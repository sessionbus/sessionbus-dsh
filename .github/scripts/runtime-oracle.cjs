"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

// Public inventory is read by DSH itself; no loader entries, implementation
// records, Fiber identities, namespace equality or writable mirror are used.
async function inspectRuntime(ctx, expected) {
  const anchor = fs.realpathSync(ctx.profileContext.installAnchor);
  const { readPluginInventory } = await import(pathToFileURL(createRequire(anchor).resolve("@deepseek-ai/dsh-host-plugin-inventory")));
  return inspectFacts(ctx, expected, await readPluginInventory(ctx));
}

function inspectFacts(ctx, { version, mode }, inventory) {
  const context = ctx.profileContext;
  assert.ok(context?.installAnchor && context.dir && ctx.pluginPackages?.resolution, "native profile context and resolution must be mounted");
  const cliFile = fs.realpathSync(context.installAnchor);
  const cli = JSON.parse(fs.readFileSync(cliFile));
  const entries = inventory.entries;
  const buses = entries.filter(entry => entry.moduleName === "@sessionbus/dsh");
  assert.equal(buses.length, 1, "one mounted Sessionbus row, not a physical package count");
  const bus = buses[0];
  assert.equal(bus.enabled, true);
  assert.equal(bus.fiberPhase, "active", "a pending or failed Sessionbus row is never PASS, whatever the CLI exit status");
  const importer = pathToFileURL(path.join(context.dir, "cordis.yml")).href;
  const plugin = ctx.pluginPackages.packageOf(bus.moduleName, importer);
  assert.equal(plugin?.name, "@sessionbus/dsh");
  assert.equal(plugin.version, version);
  const pluginImporter = pathToFileURL(fs.realpathSync(path.join(plugin.dir, "plugin.cjs"))).href;
  const boot = ctx.pluginPackages.packageOf("@deepseek-ai/dsh-app-boot", pluginImporter);
  assert.ok(boot?.manifestPath, "native app-boot producer");
  const semver = createRequire(fs.realpathSync(boot.manifestPath))("semver");
  const peers = Object.entries(plugin.manifest.peerDependencies).map(([name, range]) => {
    const selected = ctx.pluginPackages.packageOf(name, pluginImporter);
    assert.ok(selected?.manifestPath, `unresolved plugin peer ${name}`);
    assert.equal(selected.name, name);
    assert.equal(semver.satisfies(selected.version, range, { includePrerelease: true }), true,
      `plugin peer ${name}@${selected.version} does not satisfy ${range}`);
    if (name.startsWith("@deepseek-ai/dsh")) assert.equal(selected.version, cli.version, `mixed DSH peer ${name}`);
    return { name, version: selected.version, path: fs.realpathSync(selected.manifestPath) };
  });
  assert.equal(semver.satisfies(cli.version, plugin.manifest.peerDependencies["@deepseek-ai/dsh-agent"], { includePrerelease: true }), true);
  const dsh = new Map();
  for (const entry of ctx.pluginPackages.resolution.entries) {
    if (!entry.name.startsWith("@deepseek-ai/dsh")) continue;
    const selected = ctx.pluginPackages.packageOf(entry.name, pluginImporter);
    assert.equal(selected?.version, cli.version, `mixed runtime ${entry.name}`);
    dsh.set(entry.name, selected.version);
  }
  const owners = entries.filter(entry => ["@sessionbus/dsh/file-uploads-none", "@deepseek-ai/dsh-client-file-upload"].includes(entry.moduleName)
    && entry.enabled && entry.fiberPhase === "active");
  assert.equal(owners.length, 1, "one active configured upload provider, not one lock/physical copy");
  const owner = owners[0];
  for (const method of ["registerAgentResolver", "resolve", "bindPrompt", "retirePrompt"]) assert.equal(typeof ctx.fileUploads?.[method], "function", `native fileUploads.${method}`);
  const provider = ctx.pluginPackages.packageOf(owner.moduleName, importer);
  assert.ok(provider?.manifestPath);
  if (mode === "lane") {
    assert.equal(owner.moduleName, "@sessionbus/dsh/file-uploads-none", "plugin own no-upload provider must own the active configured row");
    assert.equal(provider.name, "@sessionbus/dsh");
    assert.equal(fs.realpathSync(provider.manifestPath), fs.realpathSync(plugin.manifestPath));
  } else if (mode === "web") {
    assert.equal(provider.name, "@deepseek-ai/dsh-client-file-upload");
    assert.equal(entries.some(entry => entry.moduleName === "@sessionbus/dsh/file-uploads-none" && entry.enabled), false);
  } else throw new Error(`unsupported runtime proof mode ${mode}`);
  assert.equal(plugin.manifest.dependencies?.["@antst/dsh-file-uploads-none"], undefined);
  assert.equal(plugin.manifest.peerDependencies?.["@antst/dsh-file-uploads-none"], undefined);
  return { cli: { version: cli.version, path: cliFile }, profile: context.name,
    plugin: { version: plugin.version, importer, path: fs.realpathSync(plugin.manifestPath) },
    peers, dshVersions: [...new Set(dsh.values())], resolvedDshPackages: dsh.size,
    inventory: { bus: bus.entryId, upload: owner.entryId },
    upload: { row: owner.moduleName, importer, name: provider.name,
      version: provider.version, path: fs.realpathSync(provider.manifestPath), activeConfiguredProviders: owners.length } };
}
async function promptUploadRefusal(ctx) {
  const controller = ctx.sessionController;
  const { sessionId } = await controller.create({});
  const resolved = await controller.resolveAgent(sessionId);
  if (resolved.error) throw resolved.error;
  const agent = resolved.agent;
  const request = { sessionId, requestId: require("node:crypto").randomUUID(), mode: "queue",
    content: [{ type: "file", receiptId: "w128-not-staged" }] };
  let refusal;
  try { await controller.prompt(request, new AbortController().signal); }
  catch (error) { refusal = error; }
  assert.equal(refusal?.code, "session/attachment-invalid");
  assert.equal(refusal.message, "File was not uploaded for this session.");
  assert.equal(refusal.details?.reason, "FILE_NOT_STAGED");
  assert.equal(agent.session.snapshotEvents().some(event => ["request/header", "turn/start", "user/message"].includes(event.type)), false,
    "receipt refusal occurs before native model work");
  return { request, refusal: { code: refusal.code, message: refusal.message, reason: refusal.details.reason } };
}

async function ownUploadRefusal(ctx, version) {
  const runtime = await inspectRuntime(ctx, { version, mode: "lane" });
  // The public inventory and package table identify configuration and selection;
  // the real service and native receipt refusal prove behavior, not callback identity.
  return { provider: runtime.upload, ...await promptUploadRefusal(ctx) };
}
module.exports = { inspectRuntime, inspectFacts, ownUploadRefusal, promptUploadRefusal };
