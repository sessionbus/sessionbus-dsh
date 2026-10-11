"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const { createHash } = require("node:crypto");
const test = require("node:test");
const packageManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const packageVersion = packageManifest.version;
const dshVersion = process.env.DSH_TEST_VERSION ?? "0.2.1-alpha.2";

test("package metadata stays rooted in the standalone repository", () => {
  const manifest = packageManifest;
  assert.deepEqual(manifest.repository, {
    type: "git",
    url: "git+https://github.com/sessionbus/sessionbus-dsh.git",
  });
  assert.deepEqual(manifest.bugs, { url: "https://github.com/sessionbus/sessionbus-dsh/issues" });
  assert.equal(manifest.homepage, "https://github.com/sessionbus/sessionbus-dsh#readme");
  assert.deepEqual(manifest.bin, { "sessionbus-dsh": "launcher.mjs", "sessionbus-dsh-install": "bin.mjs" });
  assert.deepEqual(manifest.files, ["README.md", "docs/LANE-WITHOUT-TUI.md", "skills/sessionbus.md", "plugin.cjs", "launcher.mjs", "bin.mjs", "install.mjs"]);
  assert.equal(manifest.dependencies["@antst/dsh-file-uploads-none"], undefined);
  assert.equal(manifest.peerDependencies["@antst/dsh-file-uploads-none"], "^0.1.0 || ^0.2.0-alpha.1");
  assert.match(manifest.dependencies["@sessionbus/kit"], /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
  for (const [name, range] of Object.entries(manifest.peerDependencies)) if (name.startsWith("@deepseek-ai/dsh-")) assert.equal(range, ">=0.2.1-alpha.2");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis"], ">=4.0.5-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis-plugin-include"], ">=1.0.10-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis-plugin-loader"], ">=1.0.6-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis-plugin-timer"], ">=1.1.7-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/schemastery"], ">=3.18.5-alpha.1");
  assert.equal(manifest.peerDependencies.zod, "^4.4.3");
  assert.equal(manifest.devDependencies.zod, "4.5.4");
  assert.equal(Object.hasOwn(manifest.dependencies, "zod"), false);
});

test("zod pins come from the storage-domain producer, admit separate copies and reject wrong versions", async (t) => {
  const { deriveCliPins, assertPinnedGraph, assertPluginZod } = await import("./.github/scripts/dsh-cli-pins.mjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-zod-producer-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (location, pkg) => {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, JSON.stringify(pkg));
    return location;
  };
  write(path.join(directory, "node_modules/@deepseek-ai/dsh/package.json"), {
    name: "@deepseek-ai/dsh", dependencies: { "@deepseek-ai/dsh-storage-domain": "0.2.1-alpha.2" },
  });
  write(path.join(directory, "node_modules/@deepseek-ai/dsh-storage-domain/package.json"), {
    name: "@deepseek-ai/dsh-storage-domain", dependencies: { zod: "^4.4.3" },
  });
  const producerZod = write(path.join(directory, "node_modules/@deepseek-ai/dsh-storage-domain/node_modules/zod/package.json"), { name: "zod", version: "4.5.4" });
  write(path.join(directory, "node_modules/zod/package.json"), { name: "zod", version: "3.25.76" });
  const pins = deriveCliPins({ "@deepseek-ai/cordis": "^4.0.5-alpha.1" }, directory);
  assert.equal(pins.zod, "4.5.4", "bare CLI-anchor zod is the wrong producer");
  const plugin = write(path.join(directory, "node_modules/@sessionbus/dsh/package.json"), { name: "@sessionbus/dsh" });
  assert.throws(() => assertPluginZod(plugin), /plugin zod version mismatch/u);
  const separatePlugin = write(path.join(directory, "node_modules/@sessionbus/separate-plugin/package.json"), { name: "@sessionbus/dsh" });
  const separateZod = write(path.join(path.dirname(separatePlugin), "node_modules/zod/package.json"), { name: "zod", version: "4.5.4" });
  assert.notEqual(separateZod, producerZod);
  assert.equal(assertPluginZod(separatePlugin), separateZod, "native domain accepts independent same-version factories");
  const goodPlugin = write(path.join(directory, "node_modules/@sessionbus/valid-plugin/package.json"), { name: "@sessionbus/dsh" });
  const link = path.join(path.dirname(goodPlugin), "node_modules/zod");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(path.dirname(producerZod), link);
  assert.equal(assertPluginZod(goodPlugin), producerZod);
  assert.doesNotThrow(() => assertPinnedGraph("packages:\n  zod@3.25.76:\n  zod@4.5.4:\n", { zod: pins.zod }, "0.2.1-alpha.2"));
  assert.throws(() => assertPinnedGraph("packages:\n  zod@3.25.76:\n", { zod: pins.zod }, "0.2.1-alpha.2"), /storage-domain zod 4.5.4 is missing/u);
});

test("proof fixture and runbook resolve producer Zod from real manifest anchors, not pnpm aliases", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-realpath-control-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    return file;
  };
  const producer = path.join(directory, "node_modules/.pnpm/storage/node_modules/@deepseek-ai/dsh-storage-domain");
  const plugin = path.join(directory, "node_modules/.pnpm/plugin/node_modules/@sessionbus/dsh");
  const alias = path.join(directory, "node_modules/.pnpm/base/node_modules/@deepseek-ai/dsh-storage-domain");
  const pluginAlias = path.join(directory, "profiles/web/node_modules/@sessionbus/dsh");
  write(path.join(producer, "package.json"), { name: "@deepseek-ai/dsh-storage-domain", dependencies: { zod: "^4.4.3" } });
  write(path.join(producer, "index.cjs"), 'module.exports = require("zod/package.json").version;');
  write(path.join(plugin, "package.json"), { name: "@sessionbus/dsh" });
  write(path.join(plugin, "plugin.cjs"), 'module.exports = require("zod/package.json").version;');
  const producerZod = write(path.join(directory, "node_modules/.pnpm/storage/node_modules/zod/package.json"), { name: "zod", version: "4.5.4" });
  const pluginZod = write(path.join(directory, "node_modules/.pnpm/plugin/node_modules/zod/package.json"), { name: "zod", version: "4.5.4" });
  write(path.join(directory, "node_modules/zod/package.json"), { name: "zod", version: "3.25.76" });
  write(path.join(directory, "profiles/web/node_modules/zod/package.json"), { name: "zod", version: "4.5.4" });
  for (const [link, target] of [[alias, producer], [pluginAlias, plugin]]) {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, "dir");
  }
  assert.equal(createRequire(path.join(alias, "package.json"))("zod/package.json").version, "3.25.76", "host failing control: literal alias walks up to unrelated hoisted Zod");
  assert.equal(require(path.join(alias, "index.cjs")), "4.5.4", "ordinary module loading uses the requiring file's realpath");
  const oldHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  t.after(() => { if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome; });
  const commands = new Map();
  const packages = { packageOf: name => ({ dir: name === "@sessionbus/dsh" ? pluginAlias : alias }) };
  require("./.github/fixtures/groups-proof-plugin/plugin.cjs").apply({
    commands: { register: definition => commands.set(definition.name, definition) }, pluginPackages: packages,
  });
  const runbook = fs.readFileSync(path.join(__dirname, "docs/HOST-INSTALL.md"), "utf8");
  const producerLine = runbook.match(/^  const producerZod = .*$/m)?.[0];
  const pluginLine = runbook.match(/^    const pluginZod = .*$/m)?.[0];
  assert.ok(producerLine && pluginLine, "test the actual embedded runbook lookup, not a copied implementation");
  const lookup = new Function("realpathSync", "createRequire", "join", "storage", "plugin", `${producerLine}\n${pluginLine}\nreturn { producerZod, pluginZod };`);
  const handler = commands.get("w120-zod").handler;
  await t.test("embedded runbook resolves the actual producer and plugin", () => {
    const docs = lookup(fs.realpathSync, createRequire, path.join, packages.packageOf("storage"), packages.packageOf("@sessionbus/dsh"));
    assert.equal(docs.producerZod, producerZod);
    assert.equal(docs.pluginZod, pluginZod);
  });
  await t.test("packed-proof fixture accepts correct copies and rejects mismatch or broken anchor", () => {
    const selected = JSON.parse(handler().text);
    assert.equal(selected.version, "4.5.4");
    assert.equal(selected.producerZod, producerZod);
    assert.equal(selected.actual, pluginZod);
    write(pluginZod, { name: "zod", version: "3.25.76" });
    assert.throws(handler, /plugin zod version mismatch/u, "real mismatch must still reject");
    fs.unlinkSync(path.join(producer, "package.json"));
    assert.throws(handler, { code: "ENOENT" }, "broken producer anchor must not fall back to hoisted Zod");
  });
});

test("runbook upload-provider pin uses its app owner without requiring a second profile declaration", () => {
  const doc = fs.readFileSync(path.join(__dirname, "docs/HOST-INSTALL.md"), "utf8");
  const source = doc.match(/^    const pin = profileManifest.dependencies\?.*\n      .*$/m)?.[0];
  assert.ok(source, "exercise the actual documented lookup");
  const lookup = new Function("profileManifest", "packages", "importer", "uploads", `${source}\nreturn pin;`);
  const helper = "@antst/dsh-file-uploads-none";
  assert.equal(lookup({ dependencies: { [helper]: "0.1.3" } }, {}, "profile", helper), "0.1.3");
  assert.equal(lookup({ dependencies: { "@antst/dashi-app": "0.2.0-alpha.2" } }, {
    packageOf: () => ({ manifest: { dependencies: { [helper]: "0.2.0-alpha.1" } } }),
  }, "profile", helper), "0.2.0-alpha.1");
  assert.equal(lookup({ dependencies: { "@antst/dashi-app": "0.2.0-alpha.2", [helper]: "0.1.3" } }, {
    packageOf: () => undefined,
  }, "profile", helper), undefined, "broken app ownership must not fall back to a second declaration");
});

test("the extracted package imports and its real bin performs installation", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-pack-"));
  const packed = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], { cwd: __dirname, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  const filename = JSON.parse(packed.stdout)[0].filename;
  const extracted = spawnSync("tar", ["-xzf", path.join(directory, filename), "-C", directory], { encoding: "utf8" });
  assert.equal(extracted.status, 0, extracted.stderr);
  const consumer = path.join(directory, "consumer");
  fs.mkdirSync(consumer);
  fs.writeFileSync(path.join(consumer, "package.json"), '{"private":true}\n');
  fs.writeFileSync(path.join(consumer, ".npmrc"), "node-linker=hoisted\nauto-install-peers=false\n");
  const cli = spawnSync("npm", ["view", `@deepseek-ai/dsh@${dshVersion}`, "--json"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const cliFile = path.join(directory, "cli.json");
  fs.writeFileSync(cliFile, cli.stdout);
  const pinsFile = path.join(consumer, ".pnpmfile.cjs");
  const prepared = spawnSync(process.execPath, [path.join(__dirname, ".github/scripts/dsh-cli-pins.mjs"), "prepare", dshVersion, cliFile, pinsFile], { encoding: "utf8" });
  assert.equal(prepared.status, 0, prepared.stderr);
  const pins = prepared.stdout.trim().split("\n");
  const installed = spawnSync("pnpm", ["add", "--save-exact", `@deepseek-ai/dsh@${dshVersion}`, ...pins, path.join(directory, filename)], { cwd: consumer, encoding: "utf8" });
  assert.equal(installed.status, 0, installed.stderr);
  const { deriveCliPins, assertPinnedGraph, assertPluginZod } = await import("./.github/scripts/dsh-cli-pins.mjs");
  const companionPins = deriveCliPins(JSON.parse(cli.stdout).dependencies, consumer);
  const zodInstalled = spawnSync("pnpm", ["add", "--save-exact", `zod@${companionPins.zod}`], { cwd: consumer, encoding: "utf8" });
  assert.equal(zodInstalled.status, 0, zodInstalled.stderr);
  assertPinnedGraph(fs.readFileSync(path.join(consumer, "pnpm-lock.yaml"), "utf8"), companionPins, dshVersion);
  assertPluginZod(path.join(consumer, "node_modules/@sessionbus/dsh/package.json"));
  const semver = createRequire(fs.realpathSync(path.join(consumer, "node_modules/@deepseek-ai/dsh-app-boot/package.json")))("semver");
  await t.test("file-uploads-none range resolves one provider for pinned stable and prerelease profiles", async t => {
    const helper = "@antst/dsh-file-uploads-none";
    const range = packageManifest.peerDependencies[helper];
    for (const version of ["0.1.3", "0.2.0-alpha.1", "0.2.0-alpha.2", "0.2.0", "0.2.1"]) assert.equal(semver.satisfies(version, range), true, version);
    for (const version of ["0.2.0-alpha.0", "0.2.1-alpha.1", "0.3.0"]) assert.equal(semver.satisfies(version, range), false, version);
    assert.equal(semver.satisfies("0.2.0-alpha.1", "^0.1.0"), false, "old range rejects the new helper");

    // Unpublished W-114 helper: byte-for-byte copy of its packed payload, not a dependency override.
    const alpha = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {
      cwd: path.join(__dirname, ".github/fixtures/file-uploads-none-alpha"), encoding: "utf8",
    });
    assert.equal(alpha.status, 0, alpha.stderr);
    const stable = spawnSync("npm", ["pack", `${helper}@0.1.3`, "--json", "--ignore-scripts", "--pack-destination", directory], { encoding: "utf8" });
    assert.equal(stable.status, 0, stable.stderr);
    const artifacts = [JSON.parse(stable.stdout)[0], JSON.parse(alpha.stdout)[0]].map(packed => {
      const file = path.join(directory, packed.filename);
      const manifest = spawnSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf8" });
      assert.equal(manifest.status, 0, manifest.stderr);
      return { manifest: JSON.parse(manifest.stdout), bytes: fs.readFileSync(file) };
    });
    const old = path.join(directory, "old-range");
    fs.cpSync(path.join(directory, "package"), old, { recursive: true });
    // Registry package versions are immutable; do not reuse the new version for different old-control bytes.
    const oldPeers = { ...packageManifest.peerDependencies };
    delete oldPeers[helper];
    const oldManifest = { ...packageManifest, version: `${packageVersion}.w119-old-range`, peerDependencies: oldPeers, dependencies: { ...packageManifest.dependencies, [helper]: "^0.1.0" } };
    fs.writeFileSync(path.join(old, "package.json"), JSON.stringify(oldManifest));
    const oldPacked = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", old], { cwd: old, encoding: "utf8" });
    assert.equal(oldPacked.status, 0, oldPacked.stderr);
    const negative = path.join(old, JSON.parse(oldPacked.stdout)[0].filename);
    const server = createServer((request, response) => {
      const requested = decodeURIComponent(request.url.split("?")[0]);
      const flavour = requested.split("/")[1];
      const lookup = requested.slice(flavour.length + 1);
      const served = [...artifacts, { manifest: flavour === "old" ? oldManifest : packageManifest,
        bytes: fs.readFileSync(flavour === "old" ? negative : path.join(directory, filename)) }];
      const matching = served.filter(({ manifest }) => lookup === `/${manifest.name}`);
      if (matching.length) {
        const versions = Object.fromEntries(matching.map(({ manifest, bytes }) => [manifest.version, {
          ...manifest, dist: { tarball: `http://127.0.0.1:${server.address().port}/${flavour}/${createHash("sha1").update(bytes).digest("hex")}.tgz`,
            integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` },
        }]));
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ name: lookup.slice(1), "dist-tags": { latest: lookup === `/${helper}` ? "0.1.3" : matching[0].manifest.version }, versions }));
      } else if (lookup === "/@sessionbus/kit") {
        response.writeHead(302, { Location: "https://registry.npmjs.org/@sessionbus%2Fkit" });
        response.end();
      } else {
        const artifact = served.find(({ bytes }) => lookup === `/${createHash("sha1").update(bytes).digest("hex")}.tgz`);
        response.writeHead(artifact ? 200 : 404);
        response.end(artifact?.bytes);
      }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      await t.test("required provider: strict missing-peer failure, exact-pin success, old dependency negative control", async t => {
        const run = (profile, args) => new Promise((resolve, reject) => {
          const child = spawn("pnpm", [...args, "--ignore-scripts", "--store-dir", path.join(directory, "strict-store")], { cwd: profile });
          let output = "";
          child.stdout.on("data", chunk => { output += chunk; });
          child.stderr.on("data", chunk => { output += chunk; });
          child.once("error", reject);
          child.once("close", code => resolve({ code, output }));
        });
        for (const flavour of ["new", "old", "defaults"]) {
          const profile = fs.mkdtempSync(path.join(directory, "strict-provider-"));
          const dependencies = {};
          // Install-contract fixture: actual candidate bytes; all unrelated peers supplied as named/versioned packages. No runtime claim.
          for (const [name, spec] of Object.entries(packageManifest.peerDependencies)) {
            if (name === helper) continue;
            const fixture = path.join(profile, "peers", name);
            fs.mkdirSync(fixture, { recursive: true });
            fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name, version: semver.minVersion(spec).version }));
            dependencies[name] = `file:${fixture}`;
          }
          dependencies["@sessionbus/dsh"] = `file:${flavour === "old" ? negative : path.join(directory, filename)}`;
          fs.writeFileSync(path.join(profile, "package.json"), JSON.stringify({ private: true, dependencies }));
          const registry = `http://127.0.0.1:${server.address().port}/${flavour}`;
          fs.writeFileSync(path.join(profile, ".npmrc"), `node-linker=hoisted\nauto-install-peers=${flavour === "defaults"}\nstrict-peer-dependencies=true\n@antst:registry=${registry}\n@sessionbus:registry=${registry}\n`);
          const missing = await run(profile, ["install"]);
          if (flavour === "old") {
            assert.equal(missing.code, 0, missing.output);
            t.diagnostic("old dependency declaration supplies the provider: missing-peer refusal does not fire (negative control)");
            continue;
          }
          if (flavour === "defaults") {
            assert.equal(missing.code, 0, missing.output);
            const selected = JSON.parse(fs.readFileSync(path.join(profile, "node_modules/@antst/dsh-file-uploads-none/package.json"))).version;
            assert.equal(semver.satisfies(selected, range), true, "auto-install preference need not be highest; strict missing-peer proof is separate");
            const { providerInventory } = await import("./.github/scripts/prove-upload-provider.mjs");
            const inventory = providerInventory(profile);
            assert.equal(inventory.physical.length, 1);
            assert.deepEqual(inventory.lockVersions, [selected]);
            t.diagnostic(`pnpm auto-install observation: ${selected}; exact-pin strict proof remains separate`);
            continue;
          }
          assert.notEqual(missing.code, 0, missing.output);
          assert.match(missing.output, /ERR_PNPM_PEER_DEP_ISSUES/u);
          assert.match(missing.output, /missing peer @antst\/dsh-file-uploads-none/u);
          assert.equal((missing.output.match(/missing peer /gu) ?? []).length, 1, missing.output);
          const pinned = await run(profile, ["add", "--save-exact", `${helper}@0.2.0-alpha.1`]);
          assert.equal(pinned.code, 0, pinned.output);
          assert.equal(JSON.parse(fs.readFileSync(path.join(profile, "package.json"))).dependencies[helper], "0.2.0-alpha.1");
          t.diagnostic("candidate omitted provider: explicit missing-peer error; exact provider supplied: success");
        }
      });
      const cases = [["0.2.0-alpha.1", path.join(directory, filename), 1], ["0.1.3", path.join(directory, filename), 1], ["0.2.0-alpha.1", negative, 2]];
      const scenarios = ["direct", "dashi-app"].flatMap(layout => cases.map(entry => [layout, ...entry]));
      for (const [layout, version, plugin, count] of scenarios) {
        const profile = fs.mkdtempSync(path.join(directory, "resolution-profile-"));
        let dependencies = { "@sessionbus/dsh": `file:${plugin}`, [helper]: version };
        if (layout === "dashi-app") {
          // Registry-shaped dashi-app fixture keeps exactly the two relevant published dependency edges.
          const app = path.join(profile, "app-fixture");
          fs.mkdirSync(app);
          fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "@antst/dashi-app", version, dependencies: { "@sessionbus/dsh": count === 1 ? packageVersion : oldManifest.version, [helper]: version } }));
          const packedApp = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", profile], { cwd: app, encoding: "utf8" });
          assert.equal(packedApp.status, 0, packedApp.stderr);
          dependencies = { "@antst/dashi-app": `file:${path.join(profile, JSON.parse(packedApp.stdout)[0].filename)}` };
        }
        fs.writeFileSync(path.join(profile, "package.json"), JSON.stringify({ private: true, dependencies }));
        const registry = `http://127.0.0.1:${server.address().port}/${count === 1 ? "new" : "old"}`;
        fs.writeFileSync(path.join(profile, ".npmrc"), `node-linker=hoisted\nauto-install-peers=false\n@antst:registry=${registry}\n@sessionbus:registry=${registry}\n`);
        const result = await new Promise((resolve, reject) => {
          const child = spawn("pnpm", ["install", "--ignore-scripts", "--store-dir", path.join(directory, "resolution-store")], { cwd: profile });
          let output = "";
          child.stdout.on("data", chunk => { output += chunk; });
          child.stderr.on("data", chunk => { output += chunk; });
          child.once("error", reject);
          child.once("close", code => resolve({ code, output }));
        });
        assert.equal(result.code, 0, result.output);
        const owner = path.join(profile, layout === "direct" ? "package.json" : "node_modules/@antst/dashi-app/package.json");
        const direct = fs.realpathSync(createRequire(fs.realpathSync(owner)).resolve(helper));
        const indirect = fs.realpathSync(createRequire(fs.realpathSync(path.join(profile, "node_modules/@sessionbus/dsh/package.json"))).resolve(helper));
        const selectedManifest = JSON.parse(fs.readFileSync(path.join(profile, "node_modules/@sessionbus/dsh/package.json"), "utf8"));
        assert.equal(selectedManifest.dependencies[helper], count === 1 ? undefined : "^0.1.0");
        if (count === 1) assert.equal(selectedManifest.peerDependencies[helper], range);
        assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(direct), "../package.json"), "utf8")).version, version);
        const lockPackages = fs.readFileSync(path.join(profile, "pnpm-lock.yaml"), "utf8").split("\nsnapshots:\n")[0];
        const records = [...lockPackages.matchAll(/^  '@antst\/dsh-file-uploads-none@([^']+)':$/gm)].map(match => match[1]);
        assert.equal(records.length, count, JSON.stringify(records));
        if (count === 1) { assert.equal(direct, indirect); assert.deepEqual(records, [version]); }
        else { assert.notEqual(direct, indirect); assert.deepEqual(records.sort(), ["0.1.3", "0.2.0-alpha.1"]); }
        t.diagnostic(`${layout} helper ${version}, ${count === 1 ? "new" : "old"} range: ${count} copy; importer paths ${count === 1 ? "identical" : "different"}`);
        t.diagnostic(JSON.stringify({ profile, layout, direct, indirect, lockVersions: records }));
      }
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
  for (const [name, pin] of Object.entries(companionPins)) {
    assert.equal(semver.satisfies(pin, packageManifest.peerDependencies[name], { includePrerelease: true }), true,
      `${name} CLI pin ${pin} must satisfy the independently asserted plugin floor`);
  }
  const consumerEnv = { ...process.env, PATH: `${path.join(consumer, "node_modules", ".bin")}${path.delimiter}${process.env.PATH}` };
  assert.equal(semver.satisfies("4.0.4", packageManifest.peerDependencies["@deepseek-ai/cordis"], { includePrerelease: true }), false,
    "a wrong CLI minimum cannot self-certify below the literal Cordis floor");
  assert.equal(JSON.parse(fs.readFileSync(path.join(consumer, "node_modules", "@deepseek-ai", "dsh", "package.json"), "utf8")).version, dshVersion);
  const packageRoot = path.join(consumer, "node_modules", "@sessionbus", "dsh");
  assert.equal(JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version, packageVersion);
  const imported = spawnSync(process.execPath, ["-e", "require('./plugin.cjs')"], { cwd: packageRoot, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  const sideEffectHome = path.join(directory, "import-home");
  const importedInstaller = spawnSync(process.execPath, ["-e", "import('./install.mjs')"], { cwd: packageRoot, encoding: "utf8", env: { ...process.env, DSH_HOME: sideEffectHome } });
  assert.equal(importedInstaller.status, 0, importedInstaller.stderr);
  assert.equal(fs.existsSync(sideEffectHome), false);

  // These three bin/row fixtures declare installed packages rather than installing a CLI profile.
  // Include the newly profile-owned provider; real add/upgrade is proven by the packed native matrix.
  const providerLookup = spawnSync("pnpm", ["view", `@antst/dsh-file-uploads-none@${packageManifest.peerDependencies["@antst/dsh-file-uploads-none"]}`, "version", "--json"], { encoding: "utf8" });
  assert.equal(providerLookup.status, 0, providerLookup.stderr);
  const available = JSON.parse(providerLookup.stdout);
  const providerPin = semver.maxSatisfying(Array.isArray(available) ? available : [available], packageManifest.peerDependencies["@antst/dsh-file-uploads-none"]);
  assert.ok(providerPin);
  const profileDependencies = { "@sessionbus/dsh": packageVersion, "@antst/dsh-file-uploads-none": providerPin };

  const home = path.join(directory, "dsh-home");
  const profile = path.join(home, "profiles", "sessionbus");
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "package.json"), `${JSON.stringify({ dependencies: profileDependencies })}\n`);
  fs.writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
  const rootPatch = "# product-owned peer configuration\n[]\n";
  fs.writeFileSync(path.join(home, "cordis.patch.yml"), rootPatch);
  const bundle = path.join(home, "profiles", "native-app", "node_modules", "native-bundle");
  fs.mkdirSync(bundle, { recursive: true });
  fs.writeFileSync(path.join(home, "profiles", "native-app", "package.json"), '{"dsh":{"profile":{"bundles":["native-bundle"]}}}\n');
  fs.writeFileSync(path.join(bundle, "package.json"), '{"dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}\n');
  fs.writeFileSync(path.join(bundle, "cordis.patch.yml"), "- id: sessionbus\n  name: '@sessionbus/dsh'\n");
  const command = path.join(consumer, "node_modules", ".bin", "sessionbus-dsh-install");
  const invoked = spawnSync(command, [], { encoding: "utf8", env: { ...consumerEnv, DSH_HOME: home } });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.match(fs.readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), /mode: lane/u);
  assert.equal(fs.readFileSync(path.join(home, "cordis.patch.yml"), "utf8"), rootPatch);

  const directHome = path.join(directory, "direct-home");
  const directProfile = path.join(directHome, "profiles", "sessionbus");
  fs.mkdirSync(directProfile, { recursive: true });
  fs.writeFileSync(path.join(directProfile, "package.json"), `${JSON.stringify({ dependencies: profileDependencies })}\n`);
  fs.writeFileSync(path.join(directProfile, "cordis.patch.yml"), "[]\n");
  const direct = spawnSync(process.execPath, [path.join(packageRoot, "bin.mjs")], { encoding: "utf8", env: { ...consumerEnv, DSH_HOME: directHome } });
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(fs.readFileSync(path.join(directProfile, "cordis.patch.yml"), "utf8"), /mode: lane/u);

  const peerHome = path.join(directory, "peer-home");
  const peerProfile = path.join(peerHome, "profiles", "web");
  fs.mkdirSync(peerProfile, { recursive: true });
  fs.writeFileSync(path.join(peerProfile, "package.json"), `${JSON.stringify({ dependencies: profileDependencies })}\n`);
  fs.writeFileSync(path.join(peerProfile, "cordis.patch.yml"), "[]\n");
  const peer = spawnSync(process.execPath, [path.join(packageRoot, "bin.mjs"), "--product", "dsh", "web"], { encoding: "utf8", env: { ...consumerEnv, DSH_HOME: peerHome } });
  assert.equal(peer.status, 0, peer.stderr);
  assert.match(fs.readFileSync(path.join(peerProfile, "cordis.patch.yml"), "utf8"), /id: sessionbus/u);
  assert.match(fs.readFileSync(path.join(peerProfile, "cordis.patch.yml"), "utf8"), /product: dsh/u);

  const failed = spawnSync(command, [], { encoding: "utf8", env: { ...process.env, DSH_HOME: path.join(directory, "failed-home"), PATH: path.dirname(process.execPath) } });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /cannot resolve installed DSH; run docs\/HOST-INSTALL.md preflight/u);
});
