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
  assert.equal(manifest.dependencies["@antst/dsh-file-uploads-none"], "^0.1.0");
  assert.match(manifest.dependencies["@sessionbus/kit"], /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
  for (const [name, range] of Object.entries(manifest.peerDependencies)) if (name.startsWith("@deepseek-ai/dsh-")) assert.equal(range, ">=0.2.1-alpha.2");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis"], ">=4.0.5-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis-plugin-include"], ">=1.0.10-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis-plugin-loader"], ">=1.0.6-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/cordis-plugin-timer"], ">=1.1.7-alpha.1");
  assert.equal(manifest.peerDependencies["@deepseek-ai/schemastery"], ">=3.18.5-alpha.1");
});

test("the extracted package imports and its real bin performs installation", async () => {
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
  const { deriveCliPins, assertPinnedGraph } = await import("./.github/scripts/dsh-cli-pins.mjs");
  const companionPins = deriveCliPins(JSON.parse(cli.stdout).dependencies);
  assertPinnedGraph(fs.readFileSync(path.join(consumer, "pnpm-lock.yaml"), "utf8"), companionPins, dshVersion);
  const semver = createRequire(path.join(consumer, "node_modules/@deepseek-ai/dsh-app-boot/package.json"))("semver");
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

  const home = path.join(directory, "dsh-home");
  const profile = path.join(home, "profiles", "sessionbus");
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "package.json"), `${JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion } })}\n`);
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
  fs.writeFileSync(path.join(directProfile, "package.json"), `${JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion } })}\n`);
  fs.writeFileSync(path.join(directProfile, "cordis.patch.yml"), "[]\n");
  const direct = spawnSync(process.execPath, [path.join(packageRoot, "bin.mjs")], { encoding: "utf8", env: { ...consumerEnv, DSH_HOME: directHome } });
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(fs.readFileSync(path.join(directProfile, "cordis.patch.yml"), "utf8"), /mode: lane/u);

  const peerHome = path.join(directory, "peer-home");
  const peerProfile = path.join(peerHome, "profiles", "web");
  fs.mkdirSync(peerProfile, { recursive: true });
  fs.writeFileSync(path.join(peerProfile, "package.json"), `${JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion } })}\n`);
  fs.writeFileSync(path.join(peerProfile, "cordis.patch.yml"), "[]\n");
  const peer = spawnSync(process.execPath, [path.join(packageRoot, "bin.mjs"), "--product", "dsh", "web"], { encoding: "utf8", env: { ...consumerEnv, DSH_HOME: peerHome } });
  assert.equal(peer.status, 0, peer.stderr);
  assert.match(fs.readFileSync(path.join(peerProfile, "cordis.patch.yml"), "utf8"), /id: sessionbus/u);
  assert.match(fs.readFileSync(path.join(peerProfile, "cordis.patch.yml"), "utf8"), /product: dsh/u);

  const failed = spawnSync(command, [], { encoding: "utf8", env: { ...process.env, DSH_HOME: path.join(directory, "failed-home"), PATH: path.dirname(process.execPath) } });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /cannot resolve installed DSH; run docs\/HOST-INSTALL.md preflight/u);
});
