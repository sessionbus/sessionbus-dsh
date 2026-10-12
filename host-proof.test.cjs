"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { runProof, local, observation, captureCommand, roster } = require("./.github/scripts/prove-host.cjs");
const fixture = require("./.github/fixtures/host-proof.json"), source = path.join(__dirname, ".github/scripts/prove-host.cjs");
const clone = x => structuredClone(x);
const params = () => ({ operation: "registry", acceptance: true, mode: "lane", packet: "/fixture/packet", dshHome: "/fixture/dsh", node: "node", source, profile: "sessionbus", product: "sessionbus-dsh", host: "fixture", version: "0.1.1", dsh: ["dsh"], input: "Reply with HOST_PROOF_OK", answer: "HOST_PROOF_OK" });
function argv(cmd) {
  const result = []; let word = "", quoted = false;
  for (let i = 0; i < cmd.length; i++) {
    if (cmd[i] === "'") quoted = !quoted;
    else if (!quoted && cmd[i] === "\\") word += cmd[++i];
    else if (!quoted && cmd[i] === " ") { result.push(word); word = ""; }
    else word += cmd[i];
  } result.push(word); assert.equal(quoted, false); return result;
}
function replay(p = params(), change = () => {}) {
  const observations = clone(fixture.observations), bus = clone(fixture.bus), files = new Map(), calls = [];
  change({ observations, bus });
  let oi = 0, bi = 0;
  const tools = {
    apply_patch: async patch => { const name = patch.match(/\*\*\* Add File: ([^\n]+)/u)[1]; assert.equal(files.has(name), false, "capture cannot be overwritten"); files.set(name, patch); },
    exec_command: async request => {
      const [, , kind, config, label, more] = argv(request.cmd), configValue = JSON.parse(config), extra = JSON.parse(more);
      assert.deepEqual(configValue, p); calls.push({ kind, label, extra });
      if (kind === "seal") {
        const record = observations.at(-1); assert.equal(record[0], "seal");
        if (!extra.stopped) assert.equal(oi, observations.length - 1, "PASS must consume every observation");
        oi++;
        files.set(p.packet + "/MANIFEST.sha256", "fixture seal");
        return { exit_code: 0, output: JSON.stringify({ ok: true, sha256: "fixture", bytes: 40, facts: record[2] }) };
      }
      const record = observations[oi++]; assert.deepEqual(record.slice(0, 2), [kind, label], "every observation consumed exactly once in order");
      if (kind === "command") assert.deepEqual(extra.argv, label === "add" ? ["dsh", "plugin", "--profile", "sessionbus", "add", "--save-exact", "@sessionbus/dsh@0.1.1"] : ["dsh", "plugin", "--profile", "sessionbus", "exec", "sessionbus-dsh-install"]);
      if (record[3]) throw new Error(record[3]);
      return { exit_code: 0, output: JSON.stringify({ ok: true, created: kind === "boot", sha256: "fixture", bytes: 40, facts: record[2] }) };
    },
    mcp__sessionbus__sessionbus: async request => {
      const record = bus[bi++]; assert.ok(record, "no repeated native call");
      assert.deepEqual(request, { action: record[0], arguments: record[1] }); calls.push({ action: request.action });
      return { ...(record[2].code ? { isError: true } : {}), content: [{ type: "text", text: JSON.stringify(record[2]) }] };
    },
  };
  return { tools, files, calls, consumed: () => ({ observations: oi, bus: bi, total: [observations.length, bus.length] }) };
}
test("host runner replays reduced recorded envelopes, consuming every record once", async () => {
  const r = replay(), result = await runProof(params(), r.tools);
  assert.equal(result.result, "PASS"); assert.deepEqual(r.consumed(), { observations: 11, bus: 8, total: [11, 8] });
  assert.equal(r.calls.filter(x => x.action === "send").length, 1); assert.equal(r.calls.filter(x => x.label === "add").length, 1);
  assert.ok([...r.files.keys()].some(n => n.endsWith("send.request.json"))); assert.ok([...r.files.values()].some(x => x.includes("HOST_PROOF_OK")));
});
test("operation none without acceptance never repeats completed native observations", async () => {
  for (const mode of ["lane", "peer"]) {
    const p = { ...params(), operation: "none", acceptance: false, mode, references: [{ file: "/fixture/sealed/MANIFEST.sha256", sha256: "a".repeat(64) }] }, r = replay(p, ({ observations, bus }) => { observations.splice(2, 2); observations.splice(3, 3); bus.length = 0; });
    assert.equal((await runProof(p, r.tools)).result, "PASS"); assert.equal(r.calls.some(x => x.kind === "command" || x.action), false);
    assert.equal(r.consumed().observations, 6);
  }
});
test("operation none with acceptance runs one fresh lane but never repeats a package action", async () => {
  const p = { ...params(), operation: "none" }, r = replay(p, ({ observations }) => observations.splice(2, 2));
  assert.equal((await runProof(p, r.tools)).result, "PASS"); assert.equal(r.calls.some(x => x.kind === "command"), false);
  assert.equal(r.calls.filter(x => x.action === "send").length, 1);
  assert.deepEqual(r.consumed(), { observations: 9, bus: 8, total: [9, 8] });
});
test("report formatting failure seals completed observations without repeating them", async () => {
  const r = replay(params(), ({ observations }) => { observations.find(x => x[0] === "report")[3] = "display undefined"; });
  const result = await runProof(params(), r.tools);
  assert.equal(result.result, "STOP"); assert.equal(result.stopped.phase, "report"); assert.equal(r.consumed().bus, 8);
  assert.equal(r.calls.filter(x => x.action === "spawn").length, 1); assert.ok(r.files.has("/fixture/packet/MANIFEST.sha256"));
});
test("uncertain send is terminal, saved at call time, never sent again", async () => {
  const r = replay(params(), ({ bus }) => { bus[3][2].deliveries[0].disposition = "unavailable"; });
  const result = await runProof(params(), r.tools);
  assert.equal(result.result, "STOP"); assert.equal(result.stopped.phase, "send"); assert.equal(r.consumed().bus, 4);
  assert.equal(r.calls.filter(x => x.action === "send").length, 1); assert.equal(r.calls.some(x => x.action === "close"), false);
  assert.ok([...r.files.keys()].some(x => x.endsWith("send.result.json")));
});
test("explicit refusal cases save the whole error and require the reason alone", async () => {
  const p = { ...params(), refusals: [{ name: "unknown-provider", open: { model: "missing/model" }, reason: "unknown provider missing" }] };
  for (const noisy of [false, true]) {
    const r = replay(p, ({ observations, bus }) => {
      observations.splice(8, 0, ["refusal-state", "before-unknown-provider", { workers: 0 }], ["refusal-state", "after-unknown-provider", { workers: 0 }]);
      bus.push(["spawn", { product: p.product, host: p.host, name: "unknown-provider", open: { model: "missing/model", cwd: p.packet + "/workspace/unknown-provider" }, notify: false },
        { code: -32009, message: "spawn_failed", data: { exit_code: 0, stderr_tail: [...(noisy ? ["sessionbus: sessionbus connection closed"] : []), p.refusals[0].reason] } }]);
    });
    const result = await runProof(p, r.tools); assert.equal(result.result, noisy ? "STOP" : "PASS");
    assert.equal(r.consumed().bus, 9); assert.ok([...r.files.keys()].some(n => n.endsWith("refuse-unknown-provider.result.json")));
  }
});
test("replay rejects an accidental repeated mutation or send", async () => {
  for (const line of ['await observe("command", "add",', 'const sent = await bus("send", "send",']) {
    const code = fs.readFileSync(source, "utf8"), at = code.indexOf(line), end = code.indexOf("\n", at), statement = code.slice(at, end);
    const inserted = line.startsWith("const") ? statement.replace("const sent =", "await") .replace("await await", "await") : statement;
    const changed = code.slice(0, end) + "\n" + inserted + code.slice(end), module = { exports: {} };
    vm.runInNewContext(changed, { module });
    const r = replay(); const result = await module.exports.runProof(params(), r.tools);
    assert.equal(result.result, "STOP"); assert.notEqual(r.consumed().bus, 8);
  }
});
test("retained versus forgotten by-session predicates accept only exact unknown_session", () => {
  const id = "session-fixture@fixture", row = { session_id: id, connected: false, running: false };
  assert.doesNotThrow(() => roster({ sessions: [row] }, id, false)); assert.throws(() => roster({ sessions: [row] }, id, true));
  assert.doesNotThrow(() => roster({ error: { code: -32001, message: "unknown_session" } }, id, true));
  assert.throws(() => roster({ error: { code: -32001, message: "unknown_session" } }, id, false));
  assert.throws(() => roster({ error: { code: -32002, message: "unknown_session" } }, id, true));
  assert.doesNotThrow(() => roster({ sessions: [] }, id, true)); assert.throws(() => roster({ hosts: [] }, id, true));
});
test("native predicate counts relay by source among three users, not total user messages", () => {
  const { native } = local(), route = { provider: "fixture-provider", model: "fixture-model" }, events = clone(fixture.events);
  const result = native(events, params().input, params().answer, route);
  assert.equal(result.relay, 1); assert.equal(result.userSources.length, 3);
  assert.throws(() => native(events.filter(e => e.data.source?.kind !== "plugin:sessionbus-dsh"), params().input, params().answer, route));
  events[1].data.content[0].text += params().input; assert.throws(() => native(events, params().input, params().answer, route));
});
function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-host-replay-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const p = { ...params(), packet: root + "/packet", dshHome: root + "/dsh", profile: "fixture-profile", profileDir: root + "/dsh/profiles/fixture-profile", sessionsDir: root + "/sessions", cacheDir: root + "/cache", protected: [{ path: root + "/protected" }], node: process.execPath };
  for (const dir of [p.packet, p.profileDir + "/node_modules/@sessionbus/dsh", p.profileDir + "/.plugin-manager", p.profileDir + "/node_modules/.bin", p.protected[0].path]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p.profileDir + "/node_modules/@sessionbus/dsh/package.json", '{"name":"@sessionbus/dsh","version":"0.1.1"}');
  fs.symlinkSync(path.join(__dirname, "node_modules/js-yaml"), p.profileDir + "/node_modules/js-yaml");
  fs.writeFileSync(p.profileDir + "/package.json", '{"dependencies":{"@sessionbus/dsh":"0.1.1"}}'); fs.writeFileSync(p.profileDir + "/pnpm-lock.yaml", 'packages: {}\n');
  fs.writeFileSync(p.profileDir + "/cordis.patch.yml", '# owner header\n- id: llm-pi-ai\n  config: { value: !!js "throw new Error(\'must not execute\')" }\n- id: agent-default-model\n  config: { provider: fixture-provider, model: fixture-model }\n');
  fs.writeFileSync(p.profileDir + "/cordis.yml", "same native boot bytes\n");
  fs.writeFileSync(p.profileDir + "/node_modules/.modules.yaml", 'packageManager: pnpm@10.28.1\nignoredBuilds: []\npendingBuilds: []\n');
  fs.writeFileSync(p.profileDir + "/node_modules/.pnpm-workspace-state-v1.json", '{"settings":{},"pnpmfiles":{},"projects":{},"lastValidatedTimestamp":1}');
  fs.writeFileSync(p.protected[0].path + "/host.key", "private spy sentinel"); return p;
}
test("silent source spans preserve inert !!js, following row, comments and BOM", t => {
  const p = scratch(t), f = p.profileDir + "/cordis.patch.yml", bytes = fs.readFileSync(f, "utf8"); fs.writeFileSync(f, "\uFEFF" + bytes);
  const parsed = local().rows(f, p.profileDir + "/node_modules/@sessionbus/dsh/package.json");
  assert.equal(parsed.result[0].bytes, bytes.slice(bytes.indexOf("- id:"), bytes.indexOf("- id: agent-default-model")));
  assert.equal(parsed.result[1].bytes, bytes.slice(bytes.indexOf("- id: agent-default-model")));
});
test("credential spy sees no content read; maps are complete, metadata-only keys are protected", async t => {
  const p = scratch(t), read = fs.readFileSync, accessed = [];
  fs.readFileSync = function(file, ...args) { if (String(file).endsWith("/host.key")) { accessed.push(file); throw new Error("credential read"); } return read.call(this, file, ...args); };
  try {
    await observation("snapshot", p, "before", {}); assert.equal(accessed.length, 0);
    fs.chmodSync(p.protected[0].path + "/host.key", 0o400);
    await assert.rejects(observation("snapshot", p, "changed", { baseline: "before" }), /protected bytes\/links changed/);
    assert.equal(accessed.length, 0);
  } finally { fs.readFileSync = read; }
});
test("native install/boot rewrites are disclosed without a closed schema", async t => {
  const p = scratch(t); await observation("snapshot", p, "before", {});
  fs.writeFileSync(p.profileDir + "/node_modules/.pnpm-workspace-state-v1.json", '{"settings":{},"pnpmfiles":{},"projects":{},"lastValidatedTimestamp":2,"newNativeContainer":{}}');
  await observation("snapshot", p, "after-install", { baseline: "before", upgrade: true });
  const records = JSON.parse(fs.readFileSync(p.packet + "/after-install.snapshot.json")).records;
  assert.ok(records["node_modules/.pnpm-workspace-state-v1.json"].keys.includes("newNativeContainer"));
  fs.writeFileSync(p.profileDir + "/node_modules/.bin/example", "same wrapper bytes\n");
  await observation("snapshot", p, "installed", {});
  const bin = p.profileDir + "/node_modules/.bin/example"; fs.writeFileSync(bin, "same wrapper bytes\n");
  fs.utimesSync(p.profileDir + "/cordis.yml", new Date(0), new Date(0));
  await observation("snapshot", p, "booted", { baseline: "installed" });
  const changes = JSON.parse(fs.readFileSync(p.packet + "/booted-profile-metadata.json"));
  assert.ok(changes.some(x => x.path === "cordis.yml")); assert.ok(changes.some(x => x.path === "node_modules/.bin/example"));
});
test("large command capture stays on disk; helper returns a filename, never the stream", async t => {
  const p = scratch(t); fs.copyFileSync(path.join(__dirname, ".github/scripts/proof-process-group.mjs"), p.packet + "/proof-process-group.mjs");
  const stdout = await captureCommand(p, "large", [process.execPath, "-e", 'process.stdout.write("x".repeat(2**20)); process.stderr.write("y".repeat(2**18));'], 10000);
  assert.equal(fs.statSync(stdout).size, 2 ** 20); assert.equal(fs.statSync(p.packet + "/large.stderr").size, 2 ** 18);
  assert.equal(typeof stdout, "string"); const exit = JSON.parse(fs.readFileSync(p.packet + "/large.exit.json")); assert.equal(exit.code, 0);
});

test("static CLI hashes its copied source first, captures bounded facts, and never reopens an existing packet", t => {
  const p = scratch(t), { spawnSync } = require("node:child_process"), root = path.dirname(p.packet), archiveRoot = root + "/archive";
  fs.mkdirSync(archiveRoot + "/package", { recursive: true });
  fs.writeFileSync(archiveRoot + "/package/package.json", '{"name":"@sessionbus/dsh","version":"0.1.1"}');
  p.archive = root + "/candidate.tgz";
  assert.equal(spawnSync("tar", ["-czf", p.archive, "-C", archiveRoot, "package"]).status, 0);
  p.archiveSha256 = local().hash(fs.readFileSync(p.archive)); p.dsh = [process.execPath, "-e", "console.log('0.2.1-alpha.2')"];
  fs.rmSync(p.packet, { recursive: true }); // Only this test's freshly created empty packet.
  const cli = (kind, label, more) => spawnSync(process.execPath, [source, kind, JSON.stringify(p), label, JSON.stringify(more)], { encoding: "utf8" });
  const boot = cli("boot", "source", { source: fs.readFileSync(source, "utf8") });
  assert.equal(boot.status, 0, boot.stderr); assert.equal(JSON.parse(boot.stdout).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(p.packet + "/running-source.json")).sha256, local().hash(fs.readFileSync(source)));
  const capture = cli("command", "capture", { argv: [process.execPath, "-e", 'process.stdout.write("x".repeat(2**20))'] });
  assert.equal(capture.status, 0); assert.ok(capture.stdout.length < 4096); assert.equal(fs.statSync(p.packet + "/capture.stdout").size, 2 ** 20);
  const before = fs.readdirSync(p.packet), refused = cli("boot", "source", { source: fs.readFileSync(source, "utf8") });
  assert.equal(JSON.parse(refused.stdout).created, false); assert.equal(JSON.parse(refused.stdout).ok, false);
  assert.deepEqual(fs.readdirSync(p.packet), before);
  const reference = { file: p.packet + "/MANIFEST.sha256", sha256: local().hash("sealed fixture\n") };
  fs.writeFileSync(reference.file, "sealed fixture\n");
  p.operation = "none"; p.acceptance = false; p.references = [reference]; p.packet = root + "/closure";
  const anchored = cli("boot", "source", { source: fs.readFileSync(source, "utf8") });
  assert.equal(JSON.parse(anchored.stdout).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(p.packet + "/references.json")), [reference]);
  p.packet = root + "/bad-reference"; p.references = [{ ...reference, sha256: "0".repeat(64) }];
  const changed = cli("boot", "source", { source: fs.readFileSync(source, "utf8") });
  assert.equal(JSON.parse(changed.stdout).ok, false);
  assert.equal(fs.existsSync(p.packet + "/dsh-version.request.json"), false);
});
