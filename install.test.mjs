import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yaml from "js-yaml";
import { install, remove } from "./install.mjs";
const packageVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const uploads = "@antst/dsh-file-uploads-none";
function fixture(t, names = ["sessionbus"]) {
  const home = mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-rows-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  for (const name of names) {
    const directory = path.join(home, "profiles", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ private: true, dependencies: { "@sessionbus/dsh": packageVersion },
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"], patchReload: "startup" } } }, null, 2) + "\n");
    writeFileSync(path.join(directory, "cordis.patch.yml"), "[]\n");
  }
  return { home, file: (name, file = "cordis.patch.yml") => path.join(home, "profiles", name, file) };
}
const allRows = rows => rows.flatMap(row => [row, ...(row.insert ? allRows(row.insert) : [])]);

test("W-150 peer installer equips acp, headless and sdk without manufacturing a controller", t => {
  const f = fixture(t, ["acp", "headless", "sdk"]);
  const owner = "# owner route\n- id: agent-default-model\n  config: { provider: owner, model: unchanged }\n";
  for (const name of ["acp", "headless", "sdk"]) {
    writeFileSync(f.file(name), owner);
    const manifest = readFileSync(f.file(name, "package.json"));
    install([name], { ...f, product: "dsh" });
    const first = readFileSync(f.file(name), "utf8"), rows = allRows(yaml.load(first));
    assert.equal(first.slice(0, owner.length), owner);
    assert.equal(rows.filter(row => row.id === "sessionbus").length, 1);
    assert.equal(rows.find(row => row.id === "sessionbus").config.product, "dsh");
    assert.equal(rows.find(row => row.id === "sessionbus").config.mode, undefined);
    assert.equal(rows.find(row => row.id === "file-uploads-none").name, "@sessionbus/dsh/file-uploads-none");
    assert.equal(rows.some(row => row.id === "session-controller"), false);
    assert.deepEqual(readFileSync(f.file(name, "package.json")), manifest);
    install([name], { ...f, product: "dsh" });
    assert.equal(readFileSync(f.file(name), "utf8"), first);
  }
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
    const matches = [...doc.matchAll(/(repair_dsh_graph\(\) \{[\s\S]*?\n\})\n\nrepair_dsh_graph "\$DSH_INSTALL_DIR"/g)];
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

test("the installed lane gets only owned rows, both products and no root-patch change", t => {
  const f = fixture(t), rootPatch = "# product-owned peer configuration\n[]\n";
  writeFileSync(path.join(f.home, "cordis.patch.yml"), rootPatch);
  const manifest = readFileSync(f.file("sessionbus", "package.json"));
  install([], f);
  const first = readFileSync(f.file("sessionbus"), "utf8"), rows = allRows(yaml.load(first));
  assert.equal(rows.find(row => row.id === "sessionbus").config.product, "sessionbus-dsh");
  assert.equal(rows.find(row => row.id === "sessionbus").config.mode, "lane");
  assert.equal(rows.find(row => row.id === "file-uploads-none").name, "@sessionbus/dsh/file-uploads-none");
  assert.equal(rows.find(row => row.id === "system-prompt").config.personaPrefix, "You are a coding agent powered by the {{model}} model.");
  assert.equal(rows.find(row => row.id === "session-title-llm").disabled, true);
  assert.deepEqual(rows.find(row => row.id === "permission").config.presets, {
    "read-only": { sandbox: "read-only", approval: "ask" }, "workspace-write": { sandbox: "workspace-write", approval: "ask" },
    "workspace-write-noninteractive": { sandbox: "workspace-write", approval: "never" }, "danger-full-access": { sandbox: "danger-full-access", approval: "never" },
  });
  assert.doesNotMatch(first, /\{\{cwd\}\}/u);
  install([], f); assert.equal(readFileSync(f.file("sessionbus"), "utf8"), first);
  install([], { ...f, product: "dashi" });
  assert.equal(readFileSync(f.file("sessionbus"), "utf8"), first.replace("product: sessionbus-dsh", "product: dashi"));
  assert.deepEqual(readFileSync(f.file("sessionbus", "package.json")), manifest);
  assert.equal(readFileSync(path.join(f.home, "cordis.patch.yml"), "utf8"), rootPatch);
  assert.equal(existsSync(path.join(f.home, "profiles/web")), false);
});

test("the existing lane manifest and every extra dependency, bundle and field survive", t => {
  const f = fixture(t), file = f.file("sessionbus", "package.json");
  const existing = { name: "owned-lane", private: true, custom: { preserve: "exactly" },
    dependencies: { "@sessionbus/dsh": packageVersion, "keeper-package": "1.2.3" },
    dsh: { profile: { bundles: ["keeper-bundle", "@deepseek-ai/dsh-base"], patchReload: "custom" }, keep: true } };
  writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");
  const before = readFileSync(file);
  install([], f); install([], f);
  assert.deepEqual(readFileSync(file), before);
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
    assert.match(error.message, /app "@sessionbus\/w090-bundle-row" already provides Sessionbus/u);
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
  const patch = "- insert:\n    - { \"id\": \"sessionbus\", name: '@sessionbus/dsh', config: { groups: [native] } } # sessionbus-dsh-install owned\n    - { \"id\": \"file-uploads-none\", name: '@antst/dsh-file-uploads-none' } # sessionbus-dsh-install owned\n";
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
  writeFileSync(path.join(web, "cordis.patch.yml"), "# keep\n- insert:\n    - id: sessionbus # sessionbus-dsh-install owned\n      name: '@sessionbus/dsh'\n- id: neighboring-row\n  disabled: true\n");
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

test("removal never imports a broken plugin or changes any package state", t => {
  const f = fixture(t, ["broken"]), directory = path.dirname(f.file("broken"));
  const original = "# keep\n- id: system-prompt\n  config: { preserve: true }\n- insert:\n    - { id: keeper, name: keeper }\n";
  writeFileSync(f.file("broken"), original);
  const plugin = path.join(directory, "node_modules/@sessionbus/dsh/plugin.cjs");
  mkdirSync(path.dirname(plugin), { recursive: true }); writeFileSync(plugin, "throw new Error('unloadable')\n");
  const before = readFileSync(f.file("broken", "package.json"));
  install(["broken"], { ...f, product: "dsh" });
  remove(["broken"], f);
  assert.ok(readFileSync(f.file("broken"), "utf8").startsWith(original));
  assert.deepEqual(readFileSync(f.file("broken", "package.json")), before);
  assert.equal(readFileSync(plugin, "utf8"), "throw new Error('unloadable')\n");
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
  assert.deepEqual(calls, [], "only DSH owns package removal");
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
  const beforeRemoval = readFileSync(path.join(profile, "package.json"));
  const removed = spawnSync(command, ["--remove", "sessionbus"], { encoding: "utf8", env: { ...process.env, DSH_HOME: home } });
  assert.equal(removed.status, 0, removed.stderr);
  assert.deepEqual(readFileSync(path.join(profile, "package.json")), beforeRemoval);
  assert.equal(JSON.parse(readFileSync(path.join(profile, "package.json"), "utf8")).dependencies[uploads], "0.2.0-alpha.1");

  assert.deepEqual(yaml.load(readFileSync(path.join(profile, "cordis.patch.yml"), "utf8")), []);
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
  assert.equal(bundleResult.stderr, 'sessionbus-dsh-install: profile "bundled" app "@sessionbus/w090-bundle-row" already provides Sessionbus; there is nothing to install\n');
  const unowned = path.join(home, "profiles", "unowned");
  mkdirSync(unowned, { recursive: true });
  writeFileSync(path.join(unowned, "cordis.patch.yml"), "- insert:\n    - { id: sessionbus, name: '@sessionbus/dsh' }\n");
  const removeResult = spawnSync(command, ["--remove", "unowned"], { encoding: "utf8", env: { ...process.env, DSH_HOME: home } });
  assert.equal(removeResult.status, 2);
  assert.equal(removeResult.stderr, 'sessionbus-dsh-install: profile "unowned" row "sessionbus" has no sessionbus-dsh-install ownership marker\n');
});
