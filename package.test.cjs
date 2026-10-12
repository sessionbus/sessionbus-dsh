"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const packageManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const packageVersion = packageManifest.version;

test("release workflow validates the tagged archive and publishes it before creating the GitHub release", () => {
  const yaml = require("js-yaml");
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, ".github/workflows/release.yml"), "utf8"));
  const steps = workflow.jobs.publish.steps;
  assert.equal(workflow.jobs.publish.needs, "verify");
  assert.match(packageVersion, /^\d+\.\d+\.\d+$/u);
  const at = name => steps.findIndex(step => step.name === name);
  for (const name of ["Validate annotated release tag", "Check packed archive", "Check registry archive", "Publish prepared archive", "Create GitHub release"]) {
    assert.ok(at(name) >= 0, `missing release step: ${name}`);
  }
  assert.ok(steps.findIndex(step => step.run?.includes("npm install")) >= 0, "missing npm install step");
  assert.ok(at("Validate annotated release tag") < steps.findIndex(step => step.run?.includes("npm install")));
  assert.ok(at("Check packed archive") < at("Check registry archive"));
  assert.ok(at("Publish prepared archive") < at("Create GitHub release"));
  assert.match(steps[at("Check packed archive")].run, /sha256sum -c \.release\.sha256/u);
  assert.match(steps[at("Publish prepared archive")].run, /npm publish "\$ARCHIVE" --access public --provenance --tag latest/u);
  assert.equal(steps[at("Publish prepared archive")].if, "steps.registry.outputs.state == 'absent'");
  assert.equal(steps[at("Publish prepared archive")].env.ARCHIVE, "${{ steps.release.outputs.archive }}");
  assert.equal(steps[at("Check registry archive")].env.ARCHIVE, "${{ steps.release.outputs.archive }}");
  assert.equal(steps[at("Create GitHub release")].env.RELEASE_VERSION, "${{ steps.release.outputs.version }}");
  assert.ok(steps.some(step => step.run === "npm install -g npm@11.12.1 && test \"$(npm --version)\" = '11.12.1'"));
  const release = steps[at("Create GitHub release")].run;
  assert.match(release, /if gh release view.*then[\s\S]*exit 0[\s\S]*fi/u);
  assert.ok(release.indexOf("gh release view") < release.indexOf("args=(release create"));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, ".github/workflows/release.yml"), "utf8"), /--prerelease|dist_tag/u);
});

test("release workflow order checks reject deletion of every compared step", t => {
  const yaml = require("js-yaml");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-release-order-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, ".github/workflows"), { recursive: true });
  for (const file of ["package.test.cjs", "package.json"]) fs.copyFileSync(path.join(__dirname, file), path.join(fixture, file));
  fs.symlinkSync(path.join(__dirname, "node_modules"), path.join(fixture, "node_modules"));
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, ".github/workflows/release.yml"), "utf8"));
  const run = steps => {
    const mutant = structuredClone(workflow); mutant.jobs.publish.steps = steps;
    fs.writeFileSync(path.join(fixture, ".github/workflows/release.yml"), yaml.dump(mutant));
    // A new standalone test process must not inherit the parent's runner IPC
    // context: Node otherwise skips a recursive --test invocation entirely.
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern=^release workflow validates the tagged archive", "package.test.cjs"], { cwd: fixture, encoding: "utf8", env });
    assert.match(result.stdout, /# Subtest: release workflow validates the tagged archive/u);
    assert.doesNotMatch(result.stderr, /skipping running files/u);
    return result;
  };
  const positive = run(workflow.jobs.publish.steps);
  assert.equal(positive.status, 0, positive.stdout + positive.stderr);
  assert.match(positive.stdout, /# pass 1\n/u);
  for (const name of ["Validate annotated release tag", "Check packed archive", "Check registry archive", "Publish prepared archive", "Create GitHub release", "npm install"]) {
    const result = run(workflow.jobs.publish.steps.filter(step => name === "npm install" ? !step.run?.includes("npm install") : step.name !== name));
    assert.notEqual(result.status, 0, `the actual workflow test must reject missing ${name}`);
    assert.match(result.stdout, /# fail 1\n/u);
  }
});

test("package metadata stays rooted in the standalone repository with its own provider entry", () => {
  const manifest = packageManifest;
  assert.deepEqual(manifest.repository, { type: "git", url: "git+https://github.com/sessionbus/sessionbus-dsh.git" });
  assert.deepEqual(manifest.bugs, { url: "https://github.com/sessionbus/sessionbus-dsh/issues" });
  assert.equal(manifest.homepage, "https://github.com/sessionbus/sessionbus-dsh#readme");
  assert.deepEqual(manifest.bin, { "sessionbus-dsh": "launcher.mjs", "sessionbus-dsh-install": "bin.mjs" });
  assert.deepEqual(manifest.files, ["README.md", "docs/LANE-WITHOUT-TUI.md", "skills/sessionbus.md", "plugin.cjs", "launcher.mjs", "bin.mjs", "install.mjs", "file-uploads-none.mjs"]);
  assert.deepEqual(manifest.exports, { ".": "./plugin.cjs", "./file-uploads-none": "./file-uploads-none.mjs" });
  assert.equal(manifest.dependencies["@antst/dsh-file-uploads-none"], undefined);
  assert.equal(manifest.peerDependencies["@antst/dsh-file-uploads-none"], undefined);
  assert.equal(manifest.dependencies["js-yaml"], "4.3.2");
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
  assert.deepEqual(fs.readFileSync(path.join(__dirname, "file-uploads-none.mjs")),
    fs.readFileSync(path.join(__dirname, ".github/fixtures/file-uploads-none-alpha/lib/index.js")), "published helper service copied byte-identically");
});

test("dashi metadata multiplicity derives from the app pin, never provider physical counts", async t => {
  const { inspectDashiResolution } = await import("./.github/scripts/prove-dashi-resolution.mjs");
  const { pathToFileURL } = await import("node:url");
  function fixture({ candidate = "0.1.0-pre.20", separate = false, wrongBundled = false, candidateProvider = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dashi-oracle-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const pkg = (directory, name, version, dependencies = {}) => {
      fs.mkdirSync(directory, { recursive: true });
      const manifest = { name, version, dependencies };
      if (name === "@antst/dashi-app") manifest.dsh = { bundle: { patch: "./cordis.patch.yml" } };
      const manifestPath = path.join(directory, "package.json");
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      return { name, version, manifest, manifestPath, dir: directory };
    };
    const app = pkg(path.join(dir, "node_modules/@antst/dashi-app"), "@antst/dashi-app", "0.2.0-alpha.2", {
      "@sessionbus/dsh": "0.1.0-pre.20", "@antst/dsh-file-uploads-none": "0.2.0-alpha.2",
    });
    fs.writeFileSync(path.join(app.dir, "cordis.patch.yml"), "[]\n");
    const direct = pkg(path.join(dir, "node_modules/@sessionbus/dsh"), "@sessionbus/dsh", candidate,
      candidateProvider ? { "@antst/dsh-file-uploads-none": "^0.1.0" } : {});
    const bundled = separate ? pkg(path.join(app.dir, "node_modules/@sessionbus/dsh"), "@sessionbus/dsh", wrongBundled ? "0.1.0-pre.18" : "0.1.0-pre.20") : direct;
    const ctx = { pluginPackages: { packageOf(name, importer) {
      if (name === "@antst/dashi-app") return app;
      assert.equal(name, "@sessionbus/dsh");
      return importer === pathToFileURL(fs.realpathSync(path.join(app.dir, "cordis.patch.yml"))).href ? bundled : direct;
    } } };
    return () => inspectDashiResolution(ctx, { dir }, app.version, candidate);
  }
  assert.equal(fixture()().distinctResolvedCopies, 1);
  assert.equal(fixture({ candidate: "0.1.0", separate: true })().distinctResolvedCopies, 2);
  for (const options of [{ separate: true }, { candidate: "0.1.0" },
    { candidate: "0.1.0", separate: true, wrongBundled: true }, { candidateProvider: true }]) assert.throws(fixture(options), assert.AssertionError);
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



test("packed cold imports and the installed bin have no CLI or registry side effects", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-pack-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const packed = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], { cwd: __dirname, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  const info = JSON.parse(packed.stdout)[0], tarball = path.join(directory, info.filename);
  assert.deepEqual(info.files.map(file => file.path).sort(), ["README.md", "bin.mjs", "docs/LANE-WITHOUT-TUI.md", "file-uploads-none.mjs", "install.mjs", "launcher.mjs", "package.json", "plugin.cjs", "skills/sessionbus.md"]);
  const consumer = path.join(directory, "consumer");
  // Cold-import/bin fixture ONLY: legacy-peer-deps deliberately avoids supplying a fake DSH.
  // Native add/exec/compatibility/service proofs run separately in every universal hosted leg.
  const installed = spawnSync("npm", ["install", "--prefix", consumer, "--ignore-scripts", "--legacy-peer-deps", tarball], { encoding: "utf8", timeout: 60_000 });
  assert.equal(installed.status, 0, installed.stderr);
  const packageRoot = path.join(consumer, "node_modules/@sessionbus/dsh");
  assert.equal(JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"))).version, packageVersion);
  const imported = spawnSync(process.execPath, ["-e", "require('./plugin.cjs')"], { cwd: packageRoot, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  const importHome = path.join(directory, "import-home");
  const importedInstaller = spawnSync(process.execPath, ["-e", "import('./install.mjs')"], {
    cwd: packageRoot, encoding: "utf8", env: { ...process.env, DSH_HOME: importHome },
  });
  assert.equal(importedInstaller.status, 0, importedInstaller.stderr);
  assert.equal(fs.existsSync(importHome), false);
  const ownEntry = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('@sessionbus/dsh/file-uploads-none')"], { cwd: consumer, encoding: "utf8" });
  assert.equal(ownEntry.status, 0, ownEntry.stderr);

  const home = path.join(directory, "home");
  for (const name of ["sessionbus", "web"]) {
    const profile = path.join(home, "profiles", name);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, "package.json"), JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion },
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } } }) + "\n");
    fs.writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
  }
  fs.writeFileSync(path.join(home, "cordis.patch.yml"), "# product-owned peer configuration\n[]\n");
  const env = { ...process.env, DSH_HOME: home, PATH: path.dirname(process.execPath), npm_config_registry: "http://127.0.0.1:9/" };
  const command = path.join(consumer, "node_modules/.bin/sessionbus-dsh-install");
  const invoked = spawnSync(command, [], { encoding: "utf8", env, timeout: 5000 });
  assert.equal(invoked.status, 0, invoked.stderr);
  const peer = spawnSync(process.execPath, [path.join(packageRoot, "bin.mjs"), "--product", "dsh", "web"], { encoding: "utf8", env, timeout: 5000 });
  assert.equal(peer.status, 0, peer.stderr);
  assert.match(fs.readFileSync(path.join(home, "profiles/sessionbus/cordis.patch.yml"), "utf8"), /mode: lane/u);
  assert.match(fs.readFileSync(path.join(home, "profiles/web/cordis.patch.yml"), "utf8"), /product: dsh/u);
  assert.equal(fs.readFileSync(path.join(home, "cordis.patch.yml"), "utf8"), "# product-owned peer configuration\n[]\n");
  const absent = spawnSync(command, [], { encoding: "utf8", env: { ...env, DSH_HOME: path.join(directory, "absent-home") } });
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /first run dsh plugin --profile sessionbus add --save-exact @sessionbus\/dsh/u);
});
