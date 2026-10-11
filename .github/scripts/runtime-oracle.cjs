"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

// Called inside the executing native DSH, never by locating a CLI from a bin or HOME layout.
function inspectRuntime(ctx, { version, mode }) {
  const context = ctx.profileContext;
  assert.ok(context?.installAnchor && ctx.pluginPackages?.current, "native profile context and resolution must be mounted");
  const cliFile = fs.realpathSync(context.installAnchor);
  const cli = JSON.parse(fs.readFileSync(cliFile));
  const entries = [...ctx.loader.entries()];
  const buses = entries.filter(entry => entry.options.name === "@sessionbus/dsh");
  assert.equal(buses.length, 1, "one mounted Sessionbus row, not a physical package count");
  const bus = buses[0];
  assert.notEqual(bus.options.disabled, true);
  assert.equal(bus.fiber?.state, 2, "a pending or failed Sessionbus row is never PASS, whatever the CLI exit status");
  const importer = bus.parent.tree.ctx.baseUrl;
  const plugin = ctx.pluginPackages.packageOf(bus.options.name, importer);
  assert.equal(plugin?.name, "@sessionbus/dsh");
  assert.equal(plugin.version, version);
  const pluginImporter = pathToFileURL(fs.realpathSync(path.join(plugin.dir, "plugin.cjs"))).href;
  assert.equal(bus.moduleNamespace.apply ?? bus.moduleNamespace.default?.apply,
    createRequire(fs.realpathSync(plugin.manifestPath))("./plugin.cjs").apply, "metadata must describe the actually mounted callback");
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
  for (const entry of ctx.pluginPackages.current.entries) {
    if (!entry.name.startsWith("@deepseek-ai/dsh")) continue;
    const selected = ctx.pluginPackages.packageOf(entry.name, pluginImporter);
    assert.equal(selected?.version, cli.version, `mixed runtime ${entry.name}`);
    dsh.set(entry.name, selected.version);
  }
  const implementations = Reflect.ownKeys(ctx.reflect.store).map(key => ctx.reflect.store[key])
    .filter(implementation => implementation?.name === "fileUploads" && implementation.fiber.state === 2);
  assert.equal(implementations.length, 1, "one registered upload provider, not one lock/physical copy");
  const owners = entries.filter(entry => entry.fiber === implementations[0].fiber);
  assert.equal(owners.length, 1, "one actual service-owning row");
  const owner = owners[0];
  const provider = ctx.pluginPackages.packageOf(owner.options.name, owner.parent.tree.ctx.baseUrl);
  assert.ok(provider?.manifestPath);
  if (mode === "lane" || mode === "custom") {
    assert.equal(owner.options.name, "@sessionbus/dsh/file-uploads-none");
    assert.equal(provider.name, "@sessionbus/dsh");
    assert.equal(fs.realpathSync(provider.manifestPath), fs.realpathSync(plugin.manifestPath));
  } else if (mode === "web") {
    assert.equal(provider.name, "@deepseek-ai/dsh-client-file-upload");
    assert.equal(entries.some(entry => entry.options.name === "@sessionbus/dsh/file-uploads-none"), false);
  } else if (mode === "dashi") {
    const app = ctx.pluginPackages.packageOf("@antst/dashi-app", importer);
    assert.equal(provider.name, "@antst/dsh-file-uploads-none");
    assert.equal(provider.version, app.manifest.dependencies[provider.name]);
  } else throw new Error(`unsupported runtime proof mode ${mode}`);
  assert.equal(plugin.manifest.dependencies?.["@antst/dsh-file-uploads-none"], undefined);
  assert.equal(plugin.manifest.peerDependencies?.["@antst/dsh-file-uploads-none"], undefined);
  return { cli: { version: cli.version, path: cliFile }, profile: context.name,
    plugin: { version: plugin.version, importer, path: fs.realpathSync(plugin.manifestPath) },
    peers, dshVersions: [...new Set(dsh.values())], resolvedDshPackages: dsh.size,
    upload: { row: owner.options.name, importer: owner.parent.tree.ctx.baseUrl, name: provider.name,
      version: provider.version, path: fs.realpathSync(provider.manifestPath), registeredServices: implementations.length } };
}
module.exports = { inspectRuntime };
