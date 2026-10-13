"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./.github/scripts/prove-host.cjs");
const fixture = require("./.github/fixtures/host-proof.json");
const source = path.join(__dirname, ".github/scripts/prove-host.cjs");
const version = require("./package.json").version;
const clone = (value) => structuredClone(value);
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function argv(command) {
  const result = [];
  let word = "",
    quoted = false;
  for (let i = 0; i < command.length; i++) {
    if (command[i] === "'") quoted = !quoted;
    else if (!quoted && command[i] === "\\") word += command[++i];
    else if (!quoted && command[i] === " ") {
      result.push(word);
      word = "";
    } else word += command[i];
  }
  result.push(word);
  assert.equal(quoted, false);
  return result;
}
function manifest(packet) {
  for (const line of fs
    .readFileSync(packet + "/MANIFEST.sha256", "utf8")
    .trim()
    .split("\n")) {
    const [hash, name] = line.split("  ");
    assert.equal(api.local().hash(fs.readFileSync(packet + "/" + name)), hash, name);
  }
}
async function replay(t, options = {}, implementation = api) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-host-proof-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = root + "/dsh",
    profile = options.mode === "peer" ? "web" : "sessionbus";
  const p = {
    operation: "registry",
    acceptance: true,
    mode: "lane",
    version,
    packet: root + "/packet",
    source,
    node: process.execPath,
    zstd: process.execPath,
    dsh: [process.execPath],
    dshHome: home,
    profile,
    profileDir: `${home}/profiles/${profile}`,
    archive: root + "/candidate/archive.tgz",
    sessionsDir: home + "/sessions",
    cacheDir: home + "/storages/session_projcache/sessions",
    protected: [{ path: root + "/protected" }],
    product: profile === "web" ? "dsh" : "sessionbus-dsh",
    host: "fixture",
    input: "Reply with HOST_PROOF_OK",
    answer: "HOST_PROOF_OK",
    ...options.parameters,
  };
  if (options.mode === "peer") {
    p.mode = "peer";
    p.acceptance = false;
  }
  if (options.operation) p.operation = options.operation;
  if (options.acceptance !== undefined) p.acceptance = options.acceptance;
  const installed = p.profileDir + "/node_modules/@sessionbus/dsh",
    candidate = root + "/candidate/package";
  for (const dir of [
    installed,
    candidate,
    p.profileDir + "/.plugin-manager",
    p.profileDir + "/node_modules/.bin",
    p.protected[0].path,
    p.sessionsDir,
    p.cacheDir,
  ])
    fs.mkdirSync(dir, { recursive: true });
  for (const file of [
    "README.md",
    "package.json",
    ...require("./package.json").files.filter((x) => x !== "README.md"),
  ]) {
    fs.mkdirSync(path.dirname(candidate + "/" + file), { recursive: true });
    fs.copyFileSync(path.join(__dirname, file), candidate + "/" + file);
  }
  fs.cpSync(candidate, installed, { recursive: true });
  if (p.operation !== "none") fs.appendFileSync(installed + "/install.mjs", "\n// prior fixture installer bytes\n");
  fs.symlinkSync(path.join(__dirname, "node_modules/js-yaml"), p.profileDir + "/node_modules/js-yaml");
  fs.writeFileSync(p.archive, "recorded archive stand-in\n");
  p.archiveSha256 = api.local().hash(fs.readFileSync(p.archive));
  fs.writeFileSync(
    p.profileDir + "/package.json",
    JSON.stringify({ dependencies: { "@sessionbus/dsh": p.operation === "none" ? p.version : "0.1.1" } }),
  );
  const integrity =
    "sha512-" + require("node:crypto").createHash("sha512").update(fs.readFileSync(p.archive)).digest("base64");
  const lock = () => JSON.stringify({ packages: { [`@sessionbus/dsh@${p.version}`]: { resolution: { integrity } } } });
  fs.writeFileSync(p.profileDir + "/pnpm-lock.yaml", lock());
  fs.writeFileSync(
    p.profileDir + "/cordis.patch.yml",
    "# owner header\n- id: llm-pi-ai\n  config: { value: !!js \"throw new Error('inert')\" }\n" +
      "- id: agent-default-model # sessionbus-dsh-install owned\n" +
      "  config: { provider: fixture-provider, model: fixture-model }\n",
  );
  const { install } = await import("./install.mjs");
  install([p.profile], { home, product: p.product });
  fs.writeFileSync(p.profileDir + "/cordis.yml", "native boot bytes\n");
  fs.writeFileSync(p.profileDir + "/node_modules/.bin/example", "same wrapper bytes\n");
  fs.writeFileSync(p.profileDir + "/node_modules/.modules.yaml", "packageManager: pnpm@10.28.1\nignoredBuilds: []\n");
  fs.writeFileSync(
    p.profileDir + "/node_modules/.pnpm-workspace-state-v1.json",
    '{"settings":{},"pnpmfiles":{},"projects":{}}',
  );
  fs.writeFileSync(p.protected[0].path + "/host.key", "private fixture sentinel");
  const sealed = root + "/sealed";
  fs.mkdirSync(sealed);
  fs.writeFileSync(sealed + "/MANIFEST.sha256", "sealed fixture\n");
  p.references = [{ file: sealed + "/MANIFEST.sha256", sha256: api.local().hash("sealed fixture\n") }];
  const calls = [],
    counts = {},
    bus = p.acceptance ? clone(fixture.bus) : [],
    events = clone(fixture.events);
  const expected = fixture.observations.filter(
    ([kind, label]) =>
      !(p.operation === "none" && kind === "command") &&
      !(p.acceptance === false && ["before-open", "turn", "after-close"].includes(label)),
  );
  let cursor = 0,
    workers = 0;
  if (options.refusal)
    p.refusals = [{ name: "case-1", open: { model: "missing/model" }, reason: "unknown provider missing" }];
  const extras = (label) =>
    ({
      source: { source: fs.readFileSync(source, "utf8") },
      before: { initial: true },
      add: {
        argv: [
          ...p.dsh,
          "plugin",
          "--profile",
          p.profile,
          "add",
          "--save-exact",
          p.operation === "archive" ? p.archive : `@sessionbus/dsh@${p.version}`,
        ],
      },
      install: {
        argv: [
          ...p.dsh,
          "plugin",
          "--profile",
          p.profile,
          "exec",
          "sessionbus-dsh-install",
          ...(p.mode === "peer" ? ["--product", p.product, p.profile] : []),
        ],
      },
      installed: { validate: true, baseline: "before", upgrade: p.operation === "archive" },
      "before-open": { baseline: "installed" },
      turn: { id: "session-fixture@fixture", baseline: "installed" },
      "after-close": { baseline: "installed" },
      final: { baseline: "installed", validate: true, noWorkers: true },
      "before-case-1": { name: "case-1", baseline: "installed", initial: true },
      "after-case-1": { name: "case-1", baseline: "installed" },
      report: {},
    })[label];
  const system = {
    processes: () => ({ processes: [], workers }), // No real process or command line read.
    settle: async (milliseconds) => assert.equal(milliseconds, 6500),
    command: async (_p, label, args, deadline) => {
      calls.push({ command: label, args, deadline });
      const { put } = api.local();
      put(p.packet + "/" + label + ".request.json", { argv: args, cwd: p.packet, environmentNames: ["DSH_HOME"] });
      let stdout = "",
        stderr = "";
      if (label === "unpack") fs.cpSync(candidate, p.packet + "/package", { recursive: true });
      else if (label === "dsh-version") stdout = "0.2.1-alpha.2\n";
      else if (label === "add") {
        fs.cpSync(candidate, installed, { recursive: true });
        const pkg = json(p.profileDir + "/package.json");
        pkg.dependencies["@sessionbus/dsh"] = p.operation === "archive" ? "file:" + p.archive : p.version;
        fs.writeFileSync(p.profileDir + "/package.json", JSON.stringify(pkg));
        fs.writeFileSync(p.profileDir + "/pnpm-lock.yaml", lock());
      } else if (label === "install") {
        assert.equal(deadline, 60000);
        install([p.profile], { home, product: p.product });
      } else if (label === "decode") stdout = fs.readFileSync(args[2], "utf8");
      else throw new Error("unexpected command " + label);
      put(p.packet + "/" + label + ".stdout", stdout);
      put(p.packet + "/" + label + ".stderr", stderr);
      put(p.packet + "/" + label + ".exit.json", { code: 0, signal: null });
      return p.packet + "/" + label + ".stdout";
    },
  };
  const tools = {
    apply_patch: async (patch) => {
      const lines = patch.split("\n"),
        file = lines[1].slice("*** Add File: ".length);
      assert.equal(fs.existsSync(file), false);
      fs.writeFileSync(
        file,
        lines
          .slice(2, -1)
          .map((x) => x.slice(1))
          .join("\n") + "\n",
        { flag: "wx" },
      );
    },
    exec_command: async (request) => {
      const [, , kind, config, label, more] = argv(request.cmd),
        extra = JSON.parse(more);
      calls.push({ kind, label });
      counts[label] = (counts[label] ?? 0) + 1;
      assert.equal(counts[label], 1, "no observation retry");
      assert.deepEqual(JSON.parse(config), p);
      if (kind !== "seal") assert.deepEqual(extra, extras(label));
      if (kind !== "seal" && !label.includes("case-1")) assert.deepEqual(expected[cursor++].slice(0, 2), [kind, label]);
      await options.before?.({ kind, label, p, events, calls });
      if (options.throwObservation === label) throw new Error("tool threw " + label);
      if (options.failSeal && kind === "seal") throw new Error("seal failed");
      const result = await implementation.observeCommand(kind, p, label, extra, system);
      if (kind !== "seal" && (kind !== "boot" || result.created)) {
        const file = p.packet + "/" + label + ".observation.json";
        assert.equal(api.local().hash(fs.readFileSync(file)), result.sha256, "observer capture is required");
      }
      return {
        exit_code: options.failedObservation === label ? 1 : 0,
        output: options.malformedObservation === label ? "not JSON" : JSON.stringify(result),
      };
    },
    write_stdin: async () => {
      throw new Error("no polling in the synchronous recorded fixture");
    },
    mcp__sessionbus__sessionbus: async (request) => {
      calls.push({ action: request.action });
      const key = "bus-" + request.action;
      counts[key] = (counts[key] ?? 0) + 1;
      if (options.throwBus === request.action) {
        assert.equal(counts[key], 1);
        throw new Error("bus threw " + key);
      }
      if (request.action === "spawn" && request.arguments.name === "case-1") {
        workers = options.refusal === "opens" ? 1 : 0;
        return {
          structuredContent:
            options.refusal === "opens"
              ? { session_id: "unexpected-lane@fixture" }
              : {
                  error: {
                    code: -32009,
                    message: "spawn_failed",
                    data: { exit_code: 0, stderr_tail: [p.refusals[0].reason] },
                  },
                },
        };
      }
      const record = bus.shift();
      assert.ok(record, "no repeated bus call");
      const translated = JSON.parse(
        JSON.stringify(record).replaceAll("/fixture/packet", p.packet).replaceAll("0.1.1", version),
      );
      assert.deepEqual(request, { action: translated[0], arguments: translated[1] });
      if (request.action === "spawn") workers = 1;
      if (request.action === "close") workers = 0;
      if (request.action === "wait") {
        const key = "--" + (p.packet + "/workspace").replace(/^\/+/, "").replace(/\/+/gu, "-").slice(0, 251) + "--";
        const dir = p.sessionsDir + "/" + key + "/session-fixture";
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dir + "/session.v4.jsonl.zstd", events.map((e) => JSON.stringify(e)).join("\n") + "\n");
      }
      if (options.badRoster && request.action === "list" && counts[key] === 2)
        return { structuredContent: { sessions: [{ session_id: "session-fixture@fixture" }] } };
      return { structuredContent: translated[2].code ? { error: translated[2] } : translated[2] };
    },
  };
  return {
    p,
    tools,
    calls,
    counts,
    events,
    bus,
    run: () => implementation.runProof(p, tools),
    completed: () => cursor === expected.length - 1,
  };
}

test("real observer replay covers archive/lane, registry/peer and both independent none choices", async (t) => {
  for (const options of [
    { operation: "archive" },
    { mode: "peer" },
    { operation: "none", acceptance: false },
    { operation: "none" },
    { refusal: "refuses" },
  ]) {
    const r = await replay(t, options),
      result = await r.run();
    assert.equal(
      result.result,
      "PASS",
      JSON.stringify({
        options,
        result,
        error: result.stopped && json(r.p.packet + "/" + result.stopped.phase + ".observation.json"),
      }),
    );
    assert.equal(result.sealed, true);
    assert.equal(r.completed(), true);
    assert.equal(r.bus.length, 0);
    manifest(r.p.packet);
    assert.ok(json(r.p.packet + "/REPORT.json").references.length);
    for (const { label } of r.calls.filter((x) => x.kind && x.kind !== "seal"))
      assert.ok(fs.existsSync(r.p.packet + "/" + label + ".transport.json"));
  }
});
test("wrong inputs STOP before consuming a tool, including profile correspondence and case labels", async (t) => {
  const r = await replay(t);
  const invalid = [
    (p) => delete p.acceptance,
    (p) => delete p.product,
    (p) => delete p.zstd,
    (p) => delete p.operation,
    (p) => (p.sessionsDir += "/wrong"),
    (p) => (p.profile = "bystander"),
    (p) => (p.packet = p.profileDir + "/packet"),
    (p) => (p.mode = "other"),
    (p) => (p.dsh = []),
    (p) => {
      p.operation = "none";
      p.acceptance = false;
      delete p.references;
    },
    ...["Bad-name", "missing-credential", "bad-token"].map(
      (name) => (p) => (p.refusals = [{ name, open: { model: "missing/model" }, reason: "missing" }]),
    ),
  ];
  for (const change of invalid) {
    const p = clone(r.p);
    change(p);
    const result = await api.runProof(p, r.tools);
    assert.equal(result.result, "STOP");
    assert.equal(result.stopped.phase, "input");
    assert.equal(r.calls.length, 0);
  }
});
test("failed calls retain captures without retry; seal failure is unsealed STOP", async (t) => {
  for (const options of [
    { throwObservation: "add" },
    { failedObservation: "add" },
    { malformedObservation: "add" },
    { throwBus: "send" },
    { failSeal: true },
    { throwObservation: "report" },
  ]) {
    const r = await replay(t, options),
      result = await r.run();
    assert.equal(result.result, "STOP");
    const failed =
      options.throwObservation ??
      options.failedObservation ??
      options.malformedObservation ??
      options.throwBus ??
      "seal";
    assert.equal(result.stopped.phase, failed);
    assert.equal(r.counts[failed === "send" ? "bus-send" : failed], 1);
    if (options.failSeal) assert.equal(result.sealed, false);
    else {
      manifest(r.p.packet);
      const name = failed === "send" ? "bus-004-send.throw.json" : failed + ".transport.json";
      assert.ok(fs.existsSync(r.p.packet + "/" + name));
      if (options.throwObservation) assert.ok(json(r.p.packet + "/" + name).thrown.includes("tool threw"));
      if (options.failedObservation) assert.equal(json(r.p.packet + "/" + name).responses[0].exit_code, 1);
      if (options.malformedObservation) assert.equal(json(r.p.packet + "/" + name).responses[0].output, "not JSON");
    }
  }
});
test("unexpected accepted refusal and bad post-forget roster are terminal and name unclosed lanes", async (t) => {
  const opened = await replay(t, { refusal: "opens" }),
    a = await opened.run();
  assert.equal(a.result, "STOP");
  assert.deepEqual(a.stopped.liveLanes, ["unexpected-lane@fixture"]);
  assert.equal(a.stopped.phase, "refuse-case-1");
  const roster = await replay(t, { badRoster: true }),
    b = await roster.run();
  assert.equal(b.result, "STOP");
  assert.deepEqual(b.stopped.liveLanes, ["session-fixture@fixture"]);
});
test("real observer rejects changed bytes/owner/patch, bad logs and refusal residue", async (t) => {
  const cases = [
    { label: "turn", edit: (p) => fs.writeFileSync(p.profileDir + "/extra", "unapproved") },
    {
      label: "installed",
      operation: "archive",
      edit: (p) => {
        const f = p.profileDir + "/cordis.patch.yml";
        fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("fixture-model", "other"));
      },
    },
    { label: "turn", edit: (p) => fs.utimesSync(p.profileDir + "/cordis.patch.yml", new Date(0), new Date(0)) },
    {
      label: "after-case-1",
      refusal: "refuses",
      edit: (p) => {
        const cwd = p.packet + "/workspace/case-1",
          key = "--" + cwd.slice(1).replaceAll("/", "-").slice(0, 251) + "--";
        fs.mkdirSync(p.sessionsDir + "/" + key + "/residue", { recursive: true });
      },
    },
  ];
  for (const entry of cases) {
    const r = await replay(t, {
      ...entry,
      before: ({ label, p }) => {
        if (label === entry.label) entry.edit(p);
      },
    });
    const result = await r.run();
    assert.equal(result.result, "STOP");
    assert.equal(result.stopped.phase, entry.label);
    manifest(r.p.packet);
  }
  const bad = await replay(t, {
    before: ({ label, events }) => {
      if (label === "before-open") events.push({ type: "model/selection", data: {} });
    },
  });
  assert.equal((await bad.run()).result, "STOP");
});
test("real observer validates package pin, archive bytes and lock integrity", async (t) => {
  for (const edit of [
    (p) => fs.appendFileSync(p.profileDir + "/node_modules/@sessionbus/dsh/plugin.cjs", "bad"),
    (p) => fs.writeFileSync(p.profileDir + "/pnpm-lock.yaml", '{"packages":{}}'),
    (p) => {
      const f = p.profileDir + "/package.json",
        value = json(f);
      value.dependencies["@sessionbus/dsh"] = "wrong";
      fs.writeFileSync(f, JSON.stringify(value));
    },
  ]) {
    const r = await replay(t, {
      before: ({ label, p }) => {
        if (label === "installed") edit(p);
      },
    });
    assert.equal((await r.run()).result, "STOP");
  }
});
test("credential spy, inert spans, open schemas and unchanged-byte rewrites use the real observer", async (t) => {
  const r = await replay(t, {
      before: ({ label, p }) => {
        if (label === "installed")
          fs.writeFileSync(
            p.profileDir + "/node_modules/.pnpm-workspace-state-v1.json",
            '{"newNativeContainer":{},"projects":{}}',
          );
        if (label === "turn") {
          fs.writeFileSync(p.profileDir + "/node_modules/.bin/example", "same wrapper bytes\n");
          fs.utimesSync(p.profileDir + "/cordis.yml", new Date(0), new Date(0));
        }
      },
    }),
    original = fs.readFileSync;
  fs.readFileSync = function (file, ...args) {
    assert.equal(String(file).endsWith("/host.key"), false, "credential contents never read");
    assert.equal(String(file).startsWith("/proc/"), false, "process inspection must be replaced in tests");
    return original.call(this, file, ...args);
  };
  try {
    assert.equal((await r.run()).result, "PASS");
  } finally {
    fs.readFileSync = original;
  }
  assert.ok(
    json(r.p.packet + "/installed.snapshot.json").records["node_modules/.pnpm-workspace-state-v1.json"].keys.includes(
      "newNativeContainer",
    ),
  );
  assert.ok(json(r.p.packet + "/turn-profile-metadata.json").some((x) => x.path === "cordis.yml"));
});
test("stale actual CLI source stops before creating a packet; no replay follows", async (t) => {
  const r = await replay(t),
    root = path.dirname(r.p.packet);
  r.p.source = root + "/stale.cjs";
  fs.writeFileSync(r.p.source, fs.readFileSync(source, "utf8") + "\n");
  const calls = [],
    tools = {
      ...r.tools,
      exec_command: async (request) => {
        const [, cli, kind, config, label, more] = argv(request.cmd);
        calls.push(kind);
        const child = spawnSync(process.execPath, [cli, kind, config, label, more], { encoding: "utf8" });
        return { exit_code: child.status, output: child.stdout };
      },
    };
  assert.equal((await api.runProof(r.p, tools)).result, "STOP");
  assert.deepEqual(calls, ["boot"]);
  assert.equal(fs.existsSync(r.p.packet), false);
});
test("the same real-observer probes kill the required capture, predicate, retry and input mutations", async (t) => {
  const original = fs.readFileSync(source, "utf8");
  const edits = [
    [
      'await save(stem + ".throw.json", { at: new Date().toISOString(), message: String(error) });',
      "void 0;",
      { throwBus: "send" },
    ],
    ["await save(`${label}.transport.json`, transport);", "void 0;", {}],
    ['put(p.packet + "/" + label + ".observation.json", bytes);', "void 0;", {}],
    [
      'insist(forgotten ? !row : row?.connected === false && row.running === false, "lane lifecycle mismatch");',
      "return;",
      { badRoster: true },
    ],
    ['equal(changed, [], "profile bytes changed during native proof");', "void 0;", { defect: "file" }],
    [
      'equal(current.patch.owners, previous.patch.owners, "owner row bytes changed");',
      "void 0;",
      { defect: "owner", operation: "archive" },
    ],
    ['equal(current.patch, previous.patch, "patch hash/inode/mtime changed");', "void 0;", { defect: "patch" }],
    [
      "response = await tools.exec_command(request);",
      "response = await tools.exec_command(request).catch(() => tools.exec_command(request));",
      { throwObservation: "add" },
    ],
    [
      "raw = await tools.mcp__sessionbus__sessionbus(request);",
      "raw = await tools.mcp__sessionbus__sessionbus(request).catch(() => tools.mcp__sessionbus__sessionbus(request));",
      { throwBus: "send" },
    ],
    ['typeof p.acceptance === "boolean" && (!p.acceptance || p.mode === "lane")', "true", { invalid: "acceptance" }],
    ["p.references?.length > 0", "true", { invalid: "references", operation: "none", acceptance: false }],
  ];
  async function probe(implementation, options) {
    const defectStep = options.defect === "owner" ? "installed" : "turn";
    const r = await replay(
      t,
      {
        ...options,
        before: ({ label, p }) => {
          if (!options.defect || label !== defectStep) return;
          const patch = p.profileDir + "/cordis.patch.yml";
          if (options.defect === "file") fs.writeFileSync(p.profileDir + "/extra", "unapproved");
          else if (options.defect === "owner")
            fs.writeFileSync(patch, fs.readFileSync(patch, "utf8").replace("fixture-model", "other"));
          else fs.utimesSync(patch, new Date(0), new Date(0));
        },
      },
      implementation,
    );
    if (options.invalid) delete r.p[options.invalid];
    const result = await r.run();
    const failure =
      options.throwBus || options.throwObservation || options.badRoster || options.defect || options.invalid;
    assert.equal(result.result, failure ? "STOP" : "PASS");
    if (options.invalid) {
      assert.equal(result.stopped.phase, "input");
      assert.equal(r.calls.length, 0);
      return;
    }
    if (options.defect) assert.equal(result.stopped.phase, defectStep);
    if (options.throwBus) {
      assert.equal(r.counts["bus-send"], 1);
      assert.ok(fs.existsSync(r.p.packet + "/bus-004-send.throw.json"));
    } else if (options.throwObservation) assert.equal(r.counts.add, 1);
    if (!failure)
      for (const { kind, label } of r.calls.filter((x) => x.kind && x.kind !== "seal")) {
        assert.ok(fs.existsSync(r.p.packet + "/" + label + ".transport.json"));
        assert.ok(fs.existsSync(r.p.packet + "/" + label + ".observation.json"));
      }
  }
  for (const [search, replacement, options] of edits) {
    assert.ok(original.includes(search), "mutation target must exist: " + search);
    await probe(api, options); // The real baseline probe itself must pass.
    const module = { exports: {} };
    new Function("require", "module", "__filename", original.replace(search, replacement))(require, module, source);
    await assert.rejects(() => probe(module.exports, options), undefined, "mutation survived: " + search);
  }
});
test(
  "large command capture is full on disk and never signals an observed-exited child",
  {
    skip: process.platform === "win32" ? "Owned POSIX process groups require POSIX ps/negative group IDs" : false,
  },
  async (t) => {
    const r = await replay(t);
    fs.mkdirSync(r.p.packet);
    fs.copyFileSync(
      path.join(__dirname, ".github/scripts/proof-process-group.mjs"),
      r.p.packet + "/proof-process-group.mjs",
    );
    const kill = process.kill,
      signals = [];
    process.kill = (...args) => {
      signals.push(args);
      return kill(...args);
    };
    try {
      const stdout = await api.captureCommand(
        r.p,
        "large",
        [process.execPath, "-e", 'process.stdout.write("x".repeat(2**20));process.stderr.write("y".repeat(2**18))'],
        60000,
      );
      assert.equal(fs.statSync(stdout).size, 2 ** 20);
      assert.equal(fs.statSync(r.p.packet + "/large.stderr").size, 2 ** 18);
      assert.deepEqual(signals, []);
    } finally {
      process.kill = kill;
    }
  },
);
