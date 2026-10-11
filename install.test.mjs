import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import childProcess, { spawnSync } from "node:child_process";
import { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { install as installProfile, remove } from "./install.mjs";
const install = (names, options) => installProfile(names, { query: () => ({ status: 0, stdout: '["0.1.3","0.2.0-alpha.1"]' }), ...options });

const packageVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
// Exercise the real semver comparison with an isolated host, never the user's DSH.
const npmAnchor = process.env.npm_execpath || path.join(spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim(), "npm/package.json");
const semverDir = path.dirname(createRequire(npmAnchor).resolve("semver/package.json"));
function host(version) {
  const root = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-host-"));
  const dsh = path.join(root, "node_modules/@deepseek-ai/dsh");
  const boot = path.join(root, "node_modules/@deepseek-ai/dsh-app-boot");
  mkdirSync(path.join(dsh, "lib"), { recursive: true });
  mkdirSync(path.join(boot, "node_modules"), { recursive: true });
  mkdirSync(path.join(root, "node_modules/.bin"));
  writeFileSync(path.join(dsh, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version }));
  writeFileSync(path.join(boot, "package.json"), '{"name":"@deepseek-ai/dsh-app-boot"}');
  writeFileSync(path.join(dsh, "lib/bin.js"), "// isolated installer test anchor\n");
  symlinkSync(semverDir, path.join(boot, "node_modules/semver"));
  symlinkSync(path.join(dsh, "lib/bin.js"), path.join(root, "node_modules/.bin/dsh"));
  return { anchor: path.join(dsh, "package.json"), bin: path.join(root, "node_modules/.bin") };
}
const supportedHost = host("0.2.1-alpha.2");
process.env.PATH = `${supportedHost.bin}${path.delimiter}${process.env.PATH}`;

const uploads = "@antst/dsh-file-uploads-none";
const uploadsRange = "^0.1.0 || ^0.2.0-alpha.1";
function providerProfile(t, name, extra = {}) {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-w122-provider-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const profile = path.join(home, "profiles", name), manifestFile = path.join(profile, "package.json");
  mkdirSync(profile, { recursive: true });
  const manifest = { private: true, custom: "preserved", dependencies: { "@sessionbus/dsh": packageVersion, ...extra } };
  writeFileSync(manifestFile, JSON.stringify(manifest));
  writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
  const calls = [];
  return { home, profile, manifestFile, manifest, calls, run: args => {
    calls.push(args);
    const current = JSON.parse(readFileSync(manifestFile));
    for (const spec of args.slice(4).filter(value => value.startsWith(`${uploads}@`))) current.dependencies[uploads] = spec.slice(uploads.length + 1);
    writeFileSync(manifestFile, JSON.stringify(current));
    return { status: 0 };
  } };
}

/** Unit-only local provider for real offline removal; packed proofs stay registry-based and override-free. */
function offlineRemovalProvider(profile) {
  const manifestFile = path.join(profile, "package.json"), manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const fixture = path.join(profile, "uploads-fixture");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: uploads, version: manifest.dependencies[uploads] }));
  manifest.pnpm = { overrides: { [uploads]: "file:./uploads-fixture" } };
  writeFileSync(manifestFile, JSON.stringify(manifest));
  writeFileSync(path.join(profile, ".npmrc"), "auto-install-peers=false\noffline=true\nignore-scripts=true\n");
}

test("W-122 installer pins the highest matching provider in lane, web and custom profiles", async t => {
  for (const name of ["sessionbus", "web", "custom"]) await t.test(name, t => {
    const fixture = providerProfile(t, name, { keeper: "1.2.3", [uploads]: "0.1.3" });
    const queries = [];
    const options = { ...fixture, product: name === "sessionbus" ? "sessionbus-dsh" : "dsh", query: args => {
      queries.push(args);
      return { status: 0, stdout: JSON.stringify(["0.2.1-alpha.1", "0.2.0-alpha.1", "0.1.3", "0.2.0-alpha.0"]) };
    } };
    install([name], options);
    assert.deepEqual(queries, [["view", `${uploads}@${uploadsRange}`, "version", "--json"]]);
    assert.deepEqual(fixture.calls, [["plugin", "--profile", name, "add", "--save-exact", `${uploads}@0.2.0-alpha.1`]]);
    assert.deepEqual(JSON.parse(readFileSync(fixture.manifestFile)).dependencies, { ...fixture.manifest.dependencies, [uploads]: "0.2.0-alpha.1" });
    const patch = readFileSync(path.join(fixture.profile, "cordis.patch.yml"), "utf8");
    assert.equal(patch.includes("file-uploads-none"), name !== "web");
    install([name], options);
    assert.equal(fixture.calls.length, 1, "already exact: no second add");
    assert.equal(readFileSync(path.join(fixture.profile, "cordis.patch.yml"), "utf8"), patch);
  });
});

test("W-122 installer takes the app-owned exact provider, never registry fallback", t => {
  const fixture = providerProfile(t, "custom", { "@antst/dashi-app": "0.2.0-alpha.1" });
  const app = path.join(fixture.profile, "node_modules/@antst/dashi-app");
  mkdirSync(app, { recursive: true });
  const appFile = path.join(app, "package.json");
  writeFileSync(appFile, JSON.stringify({ name: "@antst/dashi-app", version: "0.2.0-alpha.1", dependencies: { [uploads]: "0.1.3" } }));
  const options = { ...fixture, product: "dsh", query: () => assert.fail("app owns this fact") };
  install(["custom"], options);
  assert.equal(JSON.parse(readFileSync(fixture.manifestFile)).dependencies[uploads], "0.1.3");
  const before = readFileSync(fixture.manifestFile), patch = readFileSync(path.join(fixture.profile, "cordis.patch.yml"));
  for (const pin of [undefined, "^0.1.3", "0.3.0", "0.2.1-alpha.1"]) {
    writeFileSync(appFile, JSON.stringify({ version: "0.2.0-alpha.1", dependencies: { [uploads]: pin } }));
    assert.throws(() => install(["custom"], options), /dashi-app.*exact.*provider/u);
    assert.deepEqual(readFileSync(fixture.manifestFile), before);
    assert.deepEqual(readFileSync(path.join(fixture.profile, "cordis.patch.yml")), patch);
  }
});

test("W-122 registry or add failure leaves provider rows unwritten", t => {
  const fixture = providerProfile(t, "web");
  const before = readFileSync(fixture.manifestFile), patch = readFileSync(path.join(fixture.profile, "cordis.patch.yml"));
  for (const response of [{ status: 1, stderr: "registry unavailable" }, { status: 0, stdout: "" }]) {
    assert.throws(() => install(["web"], { ...fixture, product: "dsh", query: () => response }), /registry unavailable|no matching.*provider/u);
    assert.deepEqual(readFileSync(fixture.manifestFile), before);
    assert.deepEqual(readFileSync(path.join(fixture.profile, "cordis.patch.yml")), patch);
  }
  assert.throws(() => install(["web"], { ...fixture, product: "dsh", query: () => ({ status: 0, stdout: '"0.1.3"' }), run: () => ({ status: 1, stderr: "package add failed" }) }), /package add failed/u);
  assert.deepEqual(readFileSync(fixture.manifestFile), before);
  assert.deepEqual(readFileSync(path.join(fixture.profile, "cordis.patch.yml")), patch);
});

test("W-122 every profile pin is preflighted before any add or row write", async t => {
  for (const failure of ["app-pin", "registry", "empty"]) await t.test(failure, t => {
    const fixture = providerProfile(t, "web"), custom = path.join(fixture.home, "profiles/custom");
    mkdirSync(custom, { recursive: true });
    const dependencies = { "@sessionbus/dsh": packageVersion };
    if (failure === "app-pin") {
      dependencies["@antst/dashi-app"] = "0.2.0-alpha.1";
      const app = path.join(custom, "node_modules/@antst/dashi-app");
      mkdirSync(app, { recursive: true });
      writeFileSync(path.join(app, "package.json"), JSON.stringify({ version: "0.2.0-alpha.1", dependencies: { [uploads]: "^0.1.3" } }));
    }
    writeFileSync(path.join(custom, "package.json"), JSON.stringify({ dependencies }));
    writeFileSync(path.join(custom, "cordis.patch.yml"), "[]\n");
    const files = [fixture.profile, custom].flatMap(directory => ["package.json", "cordis.patch.yml"].map(name => path.join(directory, name)));
    const before = files.map(file => readFileSync(file));
    let adds = 0;
    assert.throws(() => install(["web", "custom"], { home: fixture.home, product: "dsh", query: (args, cwd) => {
      assert.ok([fixture.profile, custom].includes(cwd), "each query uses that profile's registry context");
      return cwd === fixture.profile ? { status: 0, stdout: '"0.2.0-alpha.1"' }
        : failure === "registry" ? { status: 1, stderr: "custom registry unavailable" } : { status: 0, stdout: "" };
    }, run: args => { adds++; return fixture.run(args); } }), /exact.*provider|custom registry unavailable|no matching.*provider/u);
    assert.equal(adds, 0);
    files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i], file));
  });
});

test("W-122 query timeout is bounded, preserves native ETIMEDOUT and changes nothing", t => {
  const fixture = providerProfile(t, "web"), before = readFileSync(fixture.manifestFile);
  t.mock.method(childProcess, "spawnSync", (command, args, options) => {
    assert.equal(command, "pnpm");
    assert.equal(args[0], "view");
    assert.equal(options.timeout, 60_000);
    assert.equal(options.cwd, fixture.profile);
    return { status: null, stderr: "partial progress", error: Object.assign(new Error("spawnSync pnpm ETIMEDOUT"), { code: "ETIMEDOUT" }) };
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.throws(() => installProfile(["web"], { ...fixture, product: "dsh", run: () => assert.fail("timeout precedes mutation") }), error => error.code === "ETIMEDOUT" && /ETIMEDOUT/u.test(error.message));
  assert.deepEqual(readFileSync(fixture.manifestFile), before);
  assert.equal(readFileSync(path.join(fixture.profile, "cordis.patch.yml"), "utf8"), "[]\n");
});

test("W-122 each profile queries its own registry before either profile changes", t => {
  const fixture = providerProfile(t, "web"), custom = path.join(fixture.home, "profiles/custom");
  mkdirSync(custom, { recursive: true });
  writeFileSync(path.join(custom, "package.json"), JSON.stringify(fixture.manifest));
  writeFileSync(path.join(custom, "cordis.patch.yml"), "[]\n");
  const queries = [], adds = [];
  install(["web", "custom"], { home: fixture.home, product: "dsh", query: (args, cwd) => {
    assert.equal(adds.length, 0);
    queries.push(cwd);
    return { status: 0, stdout: JSON.stringify(cwd === fixture.profile ? "0.1.3" : "0.2.0-alpha.1") };
  }, run: args => {
    adds.push(args);
    const manifestFile = path.join(fixture.home, "profiles", args[2], "package.json");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    manifest.dependencies[uploads] = args.at(-1).slice(uploads.length + 1);
    writeFileSync(manifestFile, JSON.stringify(manifest));
    return { status: 0 };
  } });
  assert.deepEqual(queries, [fixture.profile, custom]);
  assert.deepEqual(adds.map(args => args.at(-1)), [`${uploads}@0.1.3`, `${uploads}@0.2.0-alpha.1`]);
});

test("W-122 malformed lane bundles refuse before either profile queries or changes", t => {
  const fixture = providerProfile(t, "web"), lane = path.join(fixture.home, "profiles/sessionbus");
  mkdirSync(lane, { recursive: true });
  const manifestFile = path.join(lane, "package.json"), patch = path.join(lane, "cordis.patch.yml");
  writeFileSync(patch, "# preserve\n[]\n");
  for (const bundles of ["keeper-bundle", {}, 42]) {
    writeFileSync(manifestFile, JSON.stringify({ ...fixture.manifest, dsh: { profile: { bundles } } }));
    const files = [fixture.manifestFile, path.join(fixture.profile, "cordis.patch.yml"), manifestFile, patch];
    const before = files.map(file => readFileSync(file));
    let queries = 0, adds = 0, caught;
    assert.throws(() => install(["web", "sessionbus"], { home: fixture.home, product: "dashi", query: () => {
      queries++;
      return { status: 0, stdout: '"0.1.3"' };
    }, run: args => {
      adds++;
      const file = path.join(fixture.home, "profiles", args[2], "package.json");
      const manifest = JSON.parse(readFileSync(file, "utf8"));
      manifest.dependencies[uploads] = "0.1.3";
      writeFileSync(file, JSON.stringify(manifest));
      return { status: 0 };
    } }), error => { caught = error; return /sessionbus profile bundles must be an array/u.test(error.message); });
    assert.equal(queries, 0, "guard must run before any profile's queries");
    assert.equal(adds, 0);
    assert.equal(caught.exitCode, 2);
    files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i], file));
  }
});

test("W-122 absent and null lane bundles keep the base-bundle default", t => {
  const fixture = providerProfile(t, "sessionbus", { [uploads]: "0.2.0-alpha.1" });
  for (const bundles of [undefined, null]) {
    writeFileSync(fixture.manifestFile, JSON.stringify({ ...fixture.manifest, dsh: { profile: { bundles } } }));
    install(["sessionbus"], fixture);
    assert.deepEqual(JSON.parse(readFileSync(fixture.manifestFile, "utf8")).dsh.profile.bundles, ["@deepseek-ai/dsh-base"]);
  }
  assert.equal(fixture.calls.length, 0);
});

test("W-122 app owner must be profile-local and match its declared version", t => {
  const fixture = providerProfile(t, "web", { "@antst/dashi-app": "0.2.0-alpha.1" });
  const ancestor = path.join(fixture.home, "node_modules/@antst/dashi-app");
  mkdirSync(ancestor, { recursive: true });
  writeFileSync(path.join(ancestor, "package.json"), JSON.stringify({ version: "0.2.0-alpha.1", dependencies: { [uploads]: "0.1.3" } }));
  const before = readFileSync(fixture.manifestFile), options = { ...fixture, product: "dsh", query: () => assert.fail("no fallback") };
  assert.throws(() => install(["web"], options), error => error.exitCode === 2 && /cannot resolve.*dashi-app.*profile/u.test(error.message));
  const local = path.join(fixture.profile, "node_modules/@antst/dashi-app");
  mkdirSync(local, { recursive: true });
  writeFileSync(path.join(local, "package.json"), JSON.stringify({ version: "0.3.0", dependencies: { [uploads]: "0.1.3" } }));
  assert.throws(() => install(["web"], options), error => error.exitCode === 2 && /dashi-app.*does not satisfy/u.test(error.message));
  assert.deepEqual(readFileSync(fixture.manifestFile), before);
  assert.equal(fixture.calls.length, 0);
});

test("W-122 floor refusal precedes provider registry and package operations", t => {
  const fixture = providerProfile(t, "web");
  const before = readFileSync(fixture.manifestFile), patch = readFileSync(path.join(fixture.profile, "cordis.patch.yml"));
  assert.throws(() => install(["web"], { ...fixture, product: "dsh", installAnchor: host("0.1.5-rc.2").anchor,
    query: () => assert.fail("no registry lookup before refusal"), run: () => assert.fail("no add before refusal"),
  }), /does not satisfy/u);
  assert.deepEqual(readFileSync(fixture.manifestFile), before);
  assert.deepEqual(readFileSync(path.join(fixture.profile, "cordis.patch.yml")), patch);
});

test("runbook resolves verified-absent transitive-only lock records without moving unrelated resolutions", () => {
  // Only lock repair is under test: no DSH package is installed or booted here.
  const root = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-orphan-lock-"));
  try {
    mkdirSync(path.join(root, "fixture"));
    writeFileSync(path.join(root, "fixture/package.json"), '{"name":"unrelated-fixture","version":"1.0.0"}\n');
    writeFileSync(path.join(root, "package.json"), '{"private":true,"dependencies":{"unrelated-fixture":"file:./fixture"}}\n');
    writeFileSync(path.join(root, ".npmrc"), "auto-install-peers=false\noffline=true\nignore-scripts=true\n");
    const installed = spawnSync("pnpm", ["--dir", root, "install"], { encoding: "utf8", timeout: 30_000 });
    assert.equal(installed.status, 0, installed.stderr);
    const lock = path.join(root, "pnpm-lock.yaml");
    const before = readFileSync(lock, "utf8");
    const mixed = before.replace("packages:\n", "packages:\n\n  '@deepseek-ai/dsh-invariants@0.1.5-rc.2':\n    resolution: {integrity: sha512-AA==}\n")
      .replace("snapshots:\n", "snapshots:\n\n  '@deepseek-ai/dsh-invariants@0.1.5-rc.2': {}\n");
    assert.notEqual(mixed, before);
    assert.match(mixed, /^  '@deepseek-ai\/dsh-invariants@0\.1\.5-rc\.2':$/mu);
    assert.match(mixed.split("\nsnapshots:\n")[1] ?? "", /^  '@deepseek-ai\/dsh-invariants@0\.1\.5-rc\.2': \{\}$/mu);
    writeFileSync(path.join(root, "cli-companion-pins.json"), "{}\n");
    writeFileSync(path.join(root, "registry-version.mjs"), "export function registryHasVersion(name, version) { if (name !== '@deepseek-ai/dsh-invariants' || version !== '0.2.1-alpha.2') throw new Error('unexpected registry query'); return false; }\n");
    const doc = readFileSync(new URL("./docs/HOST-INSTALL.md", import.meta.url), "utf8");
    const matches = [...doc.matchAll(/(repair_dsh_graph\(\) \{[\s\S]*?\n\})\n\nprofile_lock_has_package\(\)/g)];
    assert.equal(matches.length, 1);
    const source = matches[0][1];
    const fix = '  if [ "$absent_count" -gt 0 ] && [ "${#obsolete_direct[@]}" -eq 0 ] && [ "${#stale_packages[@]}" -eq 0 ]; then\n    pnpm --dir "$graph_root" install --lockfile-only --fix-lockfile --ignore-scripts || return\n  fi\n';
    assert.ok(source.includes(fix));
    for (const fixed of [false, true]) {
      writeFileSync(lock, mixed);
      const checked = spawnSync("bash", ["-e"], {
        encoding: "utf8", timeout: 30_000,
        env: { ...process.env, ROLLBACK_ROOT: root, DSH_BIN: "/bin/true" },
        input: `check_dsh_graph() { :; }\n${fixed ? source : source.replace(fix, "")}\nrepair_dsh_graph "$ROLLBACK_ROOT" 0.2.1-alpha.2\n`,
      });
      assert.equal(checked.error, undefined, checked.error?.message);
      assert.equal(checked.signal, null);
      if (!fixed) {
        assert.equal(checked.status, 1, checked.stderr);
        assert.match(checked.stderr, /absent target package still in lock: @deepseek-ai\/dsh-invariants/u);
      } else {
        assert.equal(checked.status, 0, checked.stderr);
        assert.match(checked.stdout, /absent target packages: zero lock records/u);
        assert.equal(readFileSync(lock, "utf8"), before, "unrelated resolution bytes must remain unchanged");
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("installer canonicalises a pnpm wrapper's symlinked CLI anchor before finding app-boot", () => {
  for (const version of ["0.2.1-alpha.2", "0.1.5-rc.2"]) {
    const root = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-isolated-"));
    const modules = path.join(root, "node_modules");
    const virtual = path.join(modules, ".pnpm/dsh-generation/node_modules/@deepseek-ai");
    const cli = path.join(virtual, "dsh");
    const boot = path.join(virtual, "dsh-app-boot");
    mkdirSync(cli, { recursive: true });
    mkdirSync(path.join(boot, "node_modules"), { recursive: true });
    mkdirSync(path.join(modules, "@deepseek-ai"));
    mkdirSync(path.join(modules, ".bin"));
    writeFileSync(path.join(cli, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version }));
    writeFileSync(path.join(boot, "package.json"), '{"name":"@deepseek-ai/dsh-app-boot"}');
    symlinkSync(semverDir, path.join(boot, "node_modules/semver"));
    symlinkSync(cli, path.join(modules, "@deepseek-ai/dsh"));
    // pnpm creates a real wrapper file, not a link to the virtual-store entry.
    writeFileSync(path.join(modules, ".bin/dsh"), "#!/bin/sh\n# never executed: package is already installed\n");
    assert.throws(() => createRequire(path.join(modules, "@deepseek-ai/dsh/package.json")).resolve("@deepseek-ai/dsh-app-boot"), { code: "MODULE_NOT_FOUND" });
    const home = path.join(root, "home"), profile = path.join(home, "profiles/web");
    mkdirSync(profile, { recursive: true });
    const manifest = JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1", "@antst/dashi-app": "0.2.0-alpha.1" } });
    const app = path.join(profile, "node_modules/@antst/dashi-app");
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, "package.json"), JSON.stringify({ version: "0.2.0-alpha.1", dependencies: { [uploads]: "0.2.0-alpha.1" } }));
    const patch = "[]\n";
    writeFileSync(path.join(profile, "package.json"), manifest);
    writeFileSync(path.join(profile, "cordis.patch.yml"), patch);
    const result = spawnSync(process.execPath, [path.resolve("bin.mjs"), "--product", "dsh", "web"], {
      encoding: "utf8", env: { ...process.env, DSH_HOME: home, npm_config_registry: "http://127.0.0.1:1", PATH: `${path.join(modules, ".bin")}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, version === "0.2.1-alpha.2" ? 0 : 2, result.stderr);
    assert.equal(readFileSync(path.join(profile, "package.json"), "utf8"), manifest);
    if (version === "0.2.1-alpha.2") assert.match(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), /product: dsh/u);
    else {
      assert.equal(result.stderr, `sessionbus-dsh-install: installed DSH ${version} does not satisfy >=0.2.1-alpha.2; run docs/HOST-INSTALL.md preflight before upgrading\n`);
      assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), patch);
    }
  }
});

test("installer refuses a below-floor host before installing or touching any profile", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-floor-"));
  const profile = path.join(home, "profiles/web");
  mkdirSync(profile, { recursive: true });
  const manifest = '{"dependencies":{"@sessionbus/dsh":"0.1.0-pre.16"}}\n';
  const patch = "# unchanged\n[]\n";
  writeFileSync(path.join(profile, "package.json"), manifest);
  writeFileSync(path.join(profile, "cordis.patch.yml"), patch);
  const legacy = host("0.1.5-rc.2");
  assert.throws(() => install(["web"], { home, product: "dsh", installAnchor: legacy.anchor, run: () => assert.fail("no install before refusal") }), error => {
    assert.equal(error.exitCode, 2);
    assert.equal(error.message, "installed DSH 0.1.5-rc.2 does not satisfy >=0.2.1-alpha.2; run docs/HOST-INSTALL.md preflight before upgrading");
    return true;
  });
  const result = spawnSync(process.execPath, [path.resolve("bin.mjs"), "--product", "dsh", "web"], { encoding: "utf8", env: { ...process.env, DSH_HOME: home, PATH: `${legacy.bin}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.status, 2);
  assert.equal(result.stderr, "sessionbus-dsh-install: installed DSH 0.1.5-rc.2 does not satisfy >=0.2.1-alpha.2; run docs/HOST-INSTALL.md preflight before upgrading\n");
  assert.equal(readFileSync(path.join(profile, "package.json"), "utf8"), manifest);
  assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), patch);
});

test("installer admits newer prereleases but refuses an earlier prerelease", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-prerelease-"));
  const profile = path.join(home, "profiles/sessionbus");
  mkdirSync(profile, { recursive: true });
  const manifest = `${JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" } })}\n`;
  const patch = "[]\n";
  writeFileSync(path.join(profile, "package.json"), manifest);
  writeFileSync(path.join(profile, "cordis.patch.yml"), patch);
  assert.throws(() => install([], { home, installAnchor: host("0.2.1-alpha.1").anchor }), /installed DSH 0\.2\.1-alpha\.1 does not satisfy >=0\.2\.1-alpha\.2/u);
  assert.equal(readFileSync(path.join(profile, "package.json"), "utf8"), manifest);
  assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), patch);
  install([], { home, installAnchor: host("0.2.2-alpha.1").anchor, run: () => assert.fail("already installed") });
  assert.match(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), /personaPrefix:/u);
  assert.doesNotMatch(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), /\{\{cwd\}\}/u);
});

test("installer creates only the lane profile and leaves the root patch untouched", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-package-"));
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-home-"));
  let runs = 0;
  const run = (argumentsValue) => {
    runs++;
    assert.deepEqual(argumentsValue, ["plugin", "--profile", "sessionbus", "add", "--save-exact", "@sessionbus/dsh", `${uploads}@0.2.0-alpha.1`]);
    const profile = path.join(home, "profiles", "sessionbus");
    mkdirSync(profile, { recursive: true });
    writeFileSync(path.join(profile, "package.json"), JSON.stringify({ dependencies: { "@sessionbus/dsh": "0.0.0", [uploads]: "0.2.0-alpha.1" }, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } } }));
    writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
    return { status: 0 };
  };
  const rootPatch = "# product-owned peer configuration\n- insert:\n    - { id: product-peer, name: product-peer }\n";
  writeFileSync(path.join(home, "cordis.patch.yml"), rootPatch);
  install(["sessionbus"], { home, root, run, product: "sessionbus-dsh" });
  const first = {
    manifest: readFileSync(path.join(home, "profiles", "sessionbus", "package.json"), "utf8"),
    profile: readFileSync(path.join(home, "profiles", "sessionbus", "cordis.patch.yml"), "utf8"),
    peer: readFileSync(path.join(home, "cordis.patch.yml"), "utf8"),
  };
  install([], { home, root, run });
  assert.equal(runs, 1);
  assert.deepEqual({
    manifest: readFileSync(path.join(home, "profiles", "sessionbus", "package.json"), "utf8"),
    profile: readFileSync(path.join(home, "profiles", "sessionbus", "cordis.patch.yml"), "utf8"),
    peer: readFileSync(path.join(home, "cordis.patch.yml"), "utf8"),
  }, first);
  install(["sessionbus"], { home, root, run, product: "dashi" });
  const repaired = readFileSync(path.join(home, "profiles", "sessionbus", "cordis.patch.yml"), "utf8");
  assert.equal(repaired, first.profile.replace("product: sessionbus-dsh", "product: dashi"));
  install(["sessionbus"], { home, root, run, product: "dashi" });
  assert.equal(readFileSync(path.join(home, "profiles", "sessionbus", "cordis.patch.yml"), "utf8"), repaired);
  assert.equal(runs, 1);
  assert.equal(first.peer, rootPatch);
  assert.equal(first.profile, `- id: system-prompt # sessionbus-dsh-install owned
  config:
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model.
- id: session-title-llm # sessionbus-dsh-install owned
  disabled: true
- id: permission # sessionbus-dsh-install owned
  config:
    presets:
      read-only: { sandbox: read-only, approval: ask }
      workspace-write: { sandbox: workspace-write, approval: ask }
      workspace-write-noninteractive: { sandbox: workspace-write, approval: never }
      danger-full-access: { sandbox: danger-full-access, approval: never }

- insert:
    - { id: workspace, name: '@deepseek-ai/dsh-workspace' } # sessionbus-dsh-install owned
    - { id: file-uploads-none, name: '@antst/dsh-file-uploads-none' } # sessionbus-dsh-install owned
    - { id: session-controller, name: '@deepseek-ai/dsh-api-session-controller' } # sessionbus-dsh-install owned
    - id: sessionbus # sessionbus-dsh-install owned
      name: '@sessionbus/dsh'
      config: { mode: lane, product: sessionbus-dsh }
`);
  assert.deepEqual(JSON.parse(first.manifest), {
    name: "dsh-profile-sessionbus",
    private: true,
    dependencies: { "@sessionbus/dsh": "0.0.0", [uploads]: "0.2.0-alpha.1" },
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"], patchReload: "startup" } },
  });
});

test("installer preserves an existing lane manifest and its extra bundle", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-existing-lane-"));
  const profile = path.join(home, "profiles", "sessionbus");
  const manifestFile = path.join(profile, "package.json");
  mkdirSync(profile, { recursive: true });
  const existing = {
    name: "owned-lane", private: true, custom: { preserve: "exactly" },
    dependencies: { "keeper-package": "1.2.3" },
    dsh: { profile: { bundles: ["keeper-bundle", "@deepseek-ai/dsh-base"], patchReload: "custom" }, keep: true },
  };
  writeFileSync(manifestFile, `${JSON.stringify(existing, null, 2)}\n`);
  writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
  let runs = 0;
  const run = () => {
    runs++;
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    manifest.dependencies["@sessionbus/dsh"] = packageVersion;
    manifest.dependencies[uploads] = "0.2.0-alpha.1";
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return { status: 0 };
  };
  install([], { home, run });
  const installed = readFileSync(manifestFile, "utf8");
  assert.deepEqual(JSON.parse(installed), { ...existing, dependencies: { ...existing.dependencies, "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" } });
  install([], { home, run });
  assert.equal(readFileSync(manifestFile, "utf8"), installed);
  assert.equal(runs, 1);
});

test("installer adds one profile-local peer row to each named profile", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-peer-home-"));
  for (const name of ["web", "custom"]) {
    const profile = path.join(home, "profiles", name);
    mkdirSync(profile, { recursive: true });
    writeFileSync(path.join(profile, "package.json"), JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" } }));
    writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
  }
  install(["web", "custom"], { home, root: path.resolve("."), product: "dsh", run: () => assert.fail("dependency already installed") });
  for (const name of ["web", "custom"]) assert.match(readFileSync(path.join(home, "profiles", name, "cordis.patch.yml"), "utf8"), /id: sessionbus/u);
  for (const name of ["web", "custom"]) assert.match(readFileSync(path.join(home, "profiles", name, "cordis.patch.yml"), "utf8"), /product: dsh/u);
  assert.doesNotMatch(readFileSync(path.join(home, "profiles", "web", "cordis.patch.yml"), "utf8"), /file-uploads-none/u);
  assert.match(readFileSync(path.join(home, "profiles", "custom", "cordis.patch.yml"), "utf8"), /file-uploads-none/u);
  assert.equal(existsSync(path.join(home, "cordis.patch.yml")), false);
});

test("installer refuses a sessionbus row supplied by a profile bundle without changing the profile", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-bundle-row-"));
  const profile = path.join(home, "profiles", "dashi");
  const bundle = "@sessionbus/w090-bundle-row";
  mkdirSync(path.join(profile, "node_modules", "@sessionbus"), { recursive: true });
  symlinkSync(path.resolve(".github/fixtures/bundle-provides-sessionbus"), path.join(profile, "node_modules", bundle));
  const manifest = `${JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion, [bundle]: "0.0.0" }, dsh: { profile: { bundles: [bundle] } } }, null, 2)}\n`;
  const patch = "# unchanged\n[]\n";
  writeFileSync(path.join(profile, "package.json"), manifest);
  writeFileSync(path.join(profile, "cordis.patch.yml"), patch);
  assert.throws(() => install(["dashi"], { home, product: "dashi", run: () => assert.fail("preflight must not install") }), error => {
    assert.equal(error.exitCode, 2);
    assert.match(error.message, /bundle "@sessionbus\/w090-bundle-row" already provides row "sessionbus"/u);
    return true;
  });
  assert.equal(readFileSync(path.join(profile, "package.json"), "utf8"), manifest);
  assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), patch);
});

test("installer preserves existing rows with quoted keys", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-native-home-"));
  const dashi = path.join(home, "profiles", "dashi");
  mkdirSync(dashi, { recursive: true });
  writeFileSync(path.join(dashi, "package.json"), JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" } }));
  const patch = "- insert:\n    - { \"id\": \"sessionbus\", name: '@sessionbus/dsh', config: { groups: [native] } }\n    - { \"id\": \"file-uploads-none\", name: '@antst/dsh-file-uploads-none' }\n";
  writeFileSync(path.join(dashi, "cordis.patch.yml"), patch);
  install(["dashi"], { home, root: path.resolve("."), product: "dashi", run: () => assert.fail("dependency already installed") });
  const installed = readFileSync(path.join(dashi, "cordis.patch.yml"), "utf8");
  assert.equal((installed.match(/"id": "sessionbus"/gu) || []).length, 1);
  assert.match(installed, /groups: \[native\]/u);
  assert.match(installed, /product: dashi/u);
  assert.equal((installed.match(/file-uploads-none/gu) || []).length, 2);
  install(["dashi"], { home, root: path.resolve("."), product: "dashi", run: () => assert.fail("dependency already installed") });
  assert.equal(readFileSync(path.join(dashi, "cordis.patch.yml"), "utf8"), installed);
});

test("installer repairs a block row without changing neighboring text", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-repair-home-"));
  const web = path.join(home, "profiles", "web");
  mkdirSync(web, { recursive: true });
  writeFileSync(path.join(web, "package.json"), JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" } }));
  writeFileSync(path.join(web, "cordis.patch.yml"), "# keep\n- insert:\n    - id: sessionbus\n      name: '@sessionbus/dsh'\n- id: neighboring-row\n  disabled: true\n");
  install(["web"], { home, product: "dsh", run: () => assert.fail("dependency already installed") });
  assert.equal(readFileSync(path.join(web, "cordis.patch.yml"), "utf8"), "# keep\n- insert:\n    - id: sessionbus # sessionbus-dsh-install owned\n      name: '@sessionbus/dsh'\n      config: { product: dsh }\n- id: neighboring-row\n  disabled: true\n");
});

test("installer requires and validates a stable peer product", () => {
  assert.throws(() => install(["web"], { home: "/unused" }), /--product is required/u);
  assert.throws(() => install(["sessionbus"], { home: "/unused", product: "dsh" }), /must be sessionbus-dsh or dashi/u);
  for (const product of ["Dashi", "bad_name", "x".repeat(33)]) {
    assert.throws(() => install(["web"], { home: "/unused", product }), /\^\[a-z0-9\]/u);
  }
});

test("removal never loads the plugin and preserves every other row", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-remove-home-"));
  const profile = path.join(home, "profiles", "broken");
  const original = "# keep\n- id: system-prompt\n  config: { preserve: true }\n- insert:\n    - { id: keeper, name: keeper }\n";
  install(["broken"], { home, product: "dsh", run: () => {
    mkdirSync(path.join(profile, "node_modules", "@sessionbus", "dsh"), { recursive: true });
    writeFileSync(path.join(profile, "package.json"), JSON.stringify({ private: true, dependencies: { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" } }));
    writeFileSync(path.join(profile, ".npmrc"), "auto-install-peers=false\n");
    writeFileSync(path.join(profile, "cordis.patch.yml"), original);
    writeFileSync(path.join(profile, "node_modules", "@sessionbus", "dsh", "package.json"), JSON.stringify({ name: "@sessionbus/dsh", version: packageVersion }));
    writeFileSync(path.join(profile, "node_modules", "@sessionbus", "dsh", "plugin.cjs"), "throw new Error('unloadable')\n");
    return { status: 0 };
  } });
  const broken = spawnSync(process.execPath, [path.join(profile, "node_modules", "@sessionbus", "dsh", "plugin.cjs")], { encoding: "utf8" });
  assert.notEqual(broken.status, 0);
  offlineRemovalProvider(profile);
  remove(["broken"], { home });
  assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), original);
  assert.equal(JSON.parse(readFileSync(path.join(profile, "package.json"), "utf8")).dependencies?.["@sessionbus/dsh"], undefined);
  assert.equal(JSON.parse(readFileSync(path.join(profile, "package.json"), "utf8")).dependencies[uploads], "0.2.0-alpha.1");
  assert.equal(JSON.parse(readFileSync(path.join(profile, "node_modules", uploads, "package.json"), "utf8")).version, "0.2.0-alpha.1");
  assert.equal(existsSync(path.join(profile, "node_modules", "@sessionbus", "dsh")), false);
});

test("removal ignores product and deletes owned block and flow rows", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-remove-rows-"));
  const calls = [];
  for (const [name, sessionbus] of [["old", "    - { id: sessionbus, name: '@sessionbus/dsh' } # sessionbus-dsh-install owned\n"], ["new", "    - id: sessionbus # sessionbus-dsh-install owned\n      name: '@sessionbus/dsh'\n      config: { product: dsh }\n"]]) {
    const profile = path.join(home, "profiles", name);
    mkdirSync(profile, { recursive: true });
    writeFileSync(path.join(profile, "cordis.patch.yml"), `- insert:\n    - { id: keeper, name: keeper }\n${sessionbus}    - { id: file-uploads-none, name: '@antst/dsh-file-uploads-none' } # sessionbus-dsh-install owned\n`);
  }
  remove(["old", "new"], { home, run: (args, cwd) => { calls.push([args, cwd]); return { status: 0 }; } });
  for (const name of ["old", "new"]) assert.equal(readFileSync(path.join(home, "profiles", name, "cordis.patch.yml"), "utf8"), "- insert:\n    - { id: keeper, name: keeper }\n");
  assert.deepEqual(calls, ["old", "new"].map(name => [["remove", "@sessionbus/dsh"], path.join(home, "profiles", name)]));
  assert.throws(() => remove([], { home }), /requires at least one profile/u);
});

test("removal refuses an unmarked matching row before removing the package", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-unowned-row-"));
  const profile = path.join(home, "profiles", "web");
  const patch = "- insert:\n    - { id: sessionbus, name: '@sessionbus/dsh' }\n";
  mkdirSync(profile, { recursive: true });
  writeFileSync(path.join(profile, "cordis.patch.yml"), patch);
  let ran = false;
  assert.throws(() => remove(["web"], { home, run: () => { ran = true; return { status: 0 }; } }), error => {
    assert.equal(error.exitCode, 2);
    assert.match(error.message, /row "sessionbus" has no sessionbus-dsh-install ownership marker/u);
    return true;
  });
  assert.equal(ran, false);
  assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), patch);
});

test("installed bin symlink runs the installer", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-bin-home-"));
  const bin = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-bin-"));
  const profile = path.join(home, "profiles", "sessionbus");
  mkdirSync(profile, { recursive: true });
  const dependencies = { "@sessionbus/dsh": packageVersion, [uploads]: "0.2.0-alpha.1" };
  writeFileSync(path.join(profile, "package.json"), JSON.stringify({ dependencies: { ...dependencies, "@antst/dashi-app": "0.2.0-alpha.1" } }));
  // Offline app-owner metadata for bin selection; package-manager removal has its own fixture below.
  const app = path.join(profile, "node_modules/@antst/dashi-app");
  mkdirSync(app, { recursive: true });
  writeFileSync(path.join(app, "package.json"), JSON.stringify({ version: "0.2.0-alpha.1", dependencies: { [uploads]: "0.2.0-alpha.1" } }));
  writeFileSync(path.join(profile, "cordis.patch.yml"), "[]\n");
  writeFileSync(path.join(home, "cordis.patch.yml"), "[]\n");
  const command = path.join(bin, "sessionbus-dsh-install");
  symlinkSync(path.resolve("bin.mjs"), command);
  const result = spawnSync(command, [], { encoding: "utf8", env: { ...process.env, DSH_HOME: home, npm_config_registry: "http://127.0.0.1:1" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), /mode: lane/u);
  assert.match(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), /file-uploads-none/u);
  assert.equal(readFileSync(path.join(home, "cordis.patch.yml"), "utf8"), "[]\n");
  for (const [args, message] of [
    [["web"], /required for peer profiles/u],
    [["--product"], /requires a value/u],
    [["--remove"], /requires at least one profile/u],
  ]) {
    const failed = spawnSync(command, args, { encoding: "utf8", env: { ...process.env, DSH_HOME: home } });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, message);
  }
  // The app above is a metadata stub, not a real installed dependency; restore the removal fixture.
  writeFileSync(path.join(profile, "package.json"), JSON.stringify({ dependencies }));
  offlineRemovalProvider(profile);
  const removed = spawnSync(command, ["--remove", "sessionbus"], { encoding: "utf8", env: { ...process.env, DSH_HOME: home } });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(profile, "package.json"), "utf8")).dependencies?.["@sessionbus/dsh"], undefined);
  assert.equal(JSON.parse(readFileSync(path.join(profile, "package.json"), "utf8")).dependencies[uploads], "0.2.0-alpha.1");
  assert.equal(JSON.parse(readFileSync(path.join(profile, "node_modules", uploads, "package.json"), "utf8")).version, "0.2.0-alpha.1");
  assert.equal(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"), "[]\n");
});

test("installed bin reports bundle and unowned-row refusals with exit two", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-bin-refusal-home-"));
  const bin = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-bin-refusal-"));
  const command = path.join(bin, "sessionbus-dsh-install");
  symlinkSync(path.resolve("bin.mjs"), command);
  const bundleName = "@sessionbus/w090-bundle-row";
  const bundled = path.join(home, "profiles", "bundled");
  mkdirSync(path.join(bundled, "node_modules", "@sessionbus"), { recursive: true });
  symlinkSync(path.resolve(".github/fixtures/bundle-provides-sessionbus"), path.join(bundled, "node_modules", bundleName));
  writeFileSync(path.join(bundled, "package.json"), JSON.stringify({ dependencies: { "@sessionbus/dsh": packageVersion }, dsh: { profile: { bundles: [bundleName] } } }));
  writeFileSync(path.join(bundled, "cordis.patch.yml"), "[]\n");
  const bundleResult = spawnSync(command, ["--product", "dsh", "bundled"], { encoding: "utf8", env: { ...process.env, DSH_HOME: home } });
  assert.equal(bundleResult.status, 2);
  assert.equal(bundleResult.stderr, 'sessionbus-dsh-install: profile "bundled" bundle "@sessionbus/w090-bundle-row" already provides row "sessionbus"\n');
  const unowned = path.join(home, "profiles", "unowned");
  mkdirSync(unowned, { recursive: true });
  writeFileSync(path.join(unowned, "cordis.patch.yml"), "- insert:\n    - { id: sessionbus, name: '@sessionbus/dsh' }\n");
  const removeResult = spawnSync(command, ["--remove", "unowned"], { encoding: "utf8", env: { ...process.env, DSH_HOME: home } });
  assert.equal(removeResult.status, 2);
  assert.equal(removeResult.stderr, 'sessionbus-dsh-install: profile "unowned" row "sessionbus" has no sessionbus-dsh-install ownership marker\n');
});
