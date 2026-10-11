"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { connectPeer, serveWorker } = require("@sessionbus/kit");
const { ACTIONS, activate, apply, createRuntime, settings, terminal } = require("./plugin.cjs");
const packageVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function delivery(body, overrides = {}) {
  return {
    message_id: "delivery-id",
    from: { session_id: "sender@host", name: "Sender", product: "dashi", groups: ["team"] },
    body,
    ...overrides,
  };
}

class Context {
  constructor() {
    this.fiber = { uid: 1 };
    this.listeners = new Map();
    this.globalListeners = new WeakSet();
    this.roots = [];
    this.exits = [];
    this.calls = [];
    this.registeredTools = new Map();
    this.registeredSkills = new Map();
    this.titles = new Map();
    this.effects = new Set();
    this.dispose = () => Promise.all([...this.effects].reverse().map(dispose => dispose()));
    this.groupRecords = new Map();
    this.groupWrites = [];
    this.groupTable = {
      get: (key) => this.groupRecords.get(key),
      put: async (key, value) => { this.groupWrites.push(["put", key, value]); this.groupRecords.set(key, [...value]); },
      delete: async (key) => { this.groupWrites.push(["delete", key]); return this.groupRecords.delete(key); },
    };
    this.agents = { roots: () => [...this.roots], get: (id) => this.roots.find((agent) => agent.session?.id === id) };
    this.appReady = { onReady: (call) => { this.ready = call; return () => { this.ready = null; }; } };
    this.appExit = (code) => { this.exits.push(code); };
    this.sessionTitle = { get: (session) => this.titles.get(session) };
    this.permissionPresets = { names: ["ask", "never"], set: (session, preset) => this.calls.push(["permission", session.id, preset]) };
    this.sessions = { flush: async (session) => { this.calls.push(["flush", session.id]); } };
    this.sessionController = {
      create: async (request) => {
        this.calls.push(["create", request]);
        if (request.cwd) this.byID.get("session-fresh").session.header.cwd = request.cwd;
        return { sessionId: "session-fresh" };
      },
      resolveAgent: async (id) => ({ agent: this.byID.get(id) }),
      rename: async (request) => { this.calls.push(["rename", request]); },
      selectModel: async (request) => { this.calls.push(["model", request]); },
    };
    this.tools = { register: (tool) => {
      if (this.registeredTools.has(tool.name)) throw new Error("duplicate tool");
      this.registeredTools.set(tool.name, tool);
      if (tool.name === "sessionbus") this.tool = tool;
      return () => { this.registeredTools.delete(tool.name); if (this.tool === tool) this.tool = undefined; };
    } };
    this.skills = { register: (skill) => {
      if (this.registeredSkills.has(skill.name)) throw new Error("duplicate skill");
      this.registeredSkills.set(skill.name, skill);
      return () => { this.registeredSkills.delete(skill.name); };
    } };
    this.commands = { register: (command) => { if (this.command) throw new Error("duplicate command"); this.command = command; return () => { if (this.command === command) this.command = undefined; }; } };
    this.byID = new Map();
  }
  get(name) { return name === "launchEnvironment" ? this.launchEnvironment : undefined; }
  on(name, call, options = {}) {
    const list = this.listeners.get(name) || [];
    if (options.prepend) list.unshift(call); else list.push(call);
    if (options.global) this.globalListeners.add(call);
    this.listeners.set(name, list);
    return () => this.listeners.set(name, (this.listeners.get(name) || []).filter((item) => item !== call));
  }
  emit(name, ...values) { for (const call of this.listeners.get(name) || []) call(...values); }
  emitGlobal(name, ...values) { for (const call of this.listeners.get(name) || []) if (this.globalListeners.has(call)) call(...values); }
  effect(call) {
    const cleanup = call();
    const dispose = () => { if (this.effects.delete(dispose)) return cleanup(); };
    this.effects.add(dispose);
    return dispose;
  }
}

test("short print lifecycle disposes before imports without plugin output", async () => {
  const ctx = new Context();
  const llm = deferred(), tools = deferred(), output = [];
  apply(ctx, { product: "dashi" }, {
    ambient: {},
    stderr: (line) => output.push(line),
    importLLM: () => llm.promise,
    importTools: () => tools.promise,
  });
  ctx.fiber.uid = null;
  llm.resolve({ createUserMessage() { throw new Error("late message factory used"); } });
  tools.resolve({ defineTool() { throw new Error("late tool factory used"); } });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(output, []);
  assert.deepEqual(ctx.exits, []);
  assert.equal(ctx.tool, undefined);
  assert.equal(ctx.command, undefined);
});

test("a row without product fails once with the installer fix", () => {
  const ctx = new Context();
  const output = [];
  apply(ctx, {}, { stderr: (line) => output.push(line) });
  assert.deepEqual(output, ["sessionbus: product is required; re-run sessionbus-dsh-install --product <name> <profile>\n"]);
  assert.deepEqual(ctx.exits, [1]);
  assert.equal(ctx.tool, undefined);
});

test("runtime creation failure closes the supplied open domain", async () => {
  const ctx = new Context(), deps = dependencies(ctx);
  let closes = 0;
  deps.domain.close = async () => { closes++; };
  ctx.commands.register = () => { throw new Error("command registration failed"); };
  await assert.rejects(activate(ctx, { product: "dsh" }, deps), /command registration failed/u);
  assert.equal(closes, 1);
  await ctx.dispose();
});

function agent(ctx, id = "session-fresh") {
  const session = {
    id,
    header: { cwd: "/workspace" },
    append: async (type, message, options) => {
      ctx.calls.push(["append", type, message, options]);
      return { type, data: message };
    },
  };
  const value = {
    id,
    session,
    status: "idle",
    options: { provider: "provider", model: "default" },
    cancel: (...args) => ctx.calls.push(["cancel", ...args]),
    whenIdle: async () => { ctx.calls.push(["idle", id]); },
  };
  ctx.roots.push(value);
  ctx.byID.set(id, value);
  return value;
}

function dependencies(ctx) {
  let sequence = 0;
  const closed = deferred();
  const serving = deferred();
  const result = {
    domain: { table: (name) => { assert.equal(name, "groups"); return ctx.groupTable; }, close: async () => {} },
    ambient: {},
    stderr: (line) => { result.errors.push(line); },
    errors: [],
    createUserMessage: (value) => ({ id: `message-${++sequence}`, ...value }),
    defineTool: (tool) => tool,
    serveWorker: (callbacks, environment) => {
      const worker = { caller: result.workerCaller, closed: closed.promise, serving: serving.promise, opened: false, shutdown: () => { result.workerStopped = true; } };
      result.callbacks = { ...callbacks, open: async (...args) => { const value = await callbacks.open(...args); worker.opened = true; return value; } };
      result.workerEnvironment = environment;
      result.worker = worker;
      return worker;
    },
    connectPeer: (identity, deliver, environment) => {
      const closed = deferred();
      const peer = {
        caller: { action: (action, request) => ({ action, request }) },
        deliver,
        environment,
        identity,
        ready: Promise.resolve(),
        closed: closed.promise,
        finish: (error) => { peer.error = error; closed.resolve(); },
        rehello: async (signal, name, info) => {
          assert.equal(signal, undefined);
          peer.rehelloed = { name, info };
          peer.identity = { ...peer.identity, info };
          if (name === undefined) delete peer.identity.name; else peer.identity.name = name;
        },
        replace: async (next) => { peer.replaced = next; peer.identity = next; },
        shutdown: () => { peer.stopped = true; closed.resolve(); },
      };
      peer.caller.list = async () => ({ self_info: {
        session_id: `${identity.session_id}@fake`, product: identity.product,
        groups: [...new Set([...identity.groups, `session:${identity.session_id}@fake`])],
      } });
      result.peers.push(peer);
      return peer;
    },
    peers: [],
    workerCaller: { action: (action, request) => ({ action, request, worker: true }) },
    closeWorker: () => { serving.resolve(new Error("connection closed")); closed.resolve(); },
    failWorker: (error) => { serving.reject(error); closed.resolve(); },
  };
  return result;
}

function lane(ctx, config = {}) {
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token", SESSIONBUS_SOCKET: "/run/sessionbus.sock" };
  const runtime = createRuntime(ctx, { product: "sessionbus-dsh", ...config }, deps);
  ctx.ready();
  return { deps, runtime };
}

async function openedLane() {
  const ctx = new Context();
  const native = agent(ctx);
  const values = lane(ctx);
  await values.deps.callbacks.open(null, { name: "worker@host", groups: [], open: {} });
  return { ctx, native, ...values };
}

async function heldRun() {
  const values = await openedLane();
  const idle = deferred(), idleStarted = deferred();
  values.native.status = "running";
  values.native.whenIdle = async () => {
    values.ctx.calls.push(["idle", values.native.id]);
    idleStarted.resolve();
    return idle.promise;
  };
  values.native.followup = (message) => {
    values.ctx.emit("session/event", values.native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    values.ctx.emit("session/event", values.native.session, { type: "turn/start", data: { turn: 9 } });
    values.ctx.emit("session/event", values.native.session, { type: "user/message", data: message });
  };
  const token = { Native: null, Interrupted: () => false };
  const running = values.deps.callbacks.run(new AbortController().signal, token, "hold");
  await idleStarted.promise;
  return { ...values, idle, running, token };
}

test("settings use config, environment, and default precedence", () => {
  const ctx = new Context();
  const launch = new Map([
    ["SESSIONBUS_GROUPS", { value: '["env"]' }],
    ["SESSIONBUS_SOCKET", { value: "/env.sock" }],
    ["SESSIONBUS_LOCAL_KEY", { value: "env-key" }],
  ]);
  ctx.launchEnvironment = { get: (key) => launch.get(key) };
  assert.deepEqual(settings(ctx, { product: "dashi", groups: ["config"], socket: "/config.sock", local_key: "config-key" }), {
    mode: "peer", product: "dashi", groups: ["config"], socket: "/config.sock", localKey: "config-key",
  });
  assert.deepEqual(settings(ctx, { product: "dsh" }), { mode: "peer", product: "dsh", groups: ["env"], socket: "/env.sock", localKey: "env-key" });
  assert.throws(() => settings(ctx, { product: "dashi", mode: "lane" }), /conflicts/);
  assert.throws(() => settings(new Context(), { product: "dashi", groups: ["same", "same"] }, {}), /groups/);
  assert.equal(settings(new Context(), { product: "dashi" }, { SESSIONBUS_SOCKET: "relative.sock" }).socket, path.resolve("relative.sock"));
  assert.equal(settings(new Context(), { product: "dashi" }, { SESSIONBUS_SOCKET: "/absolute.sock" }).socket, "/absolute.sock");
  assert.equal(settings(new Context(), { product: "dashi" }, { XDG_RUNTIME_DIR: "/run/user/123" }).socket, "/run/user/123/sessionbus/presence.sock");
  assert.equal(settings(new Context(), { product: "dashi" }, {}).socket, `/tmp/sessionbus-${process.getuid()}/presence.sock`);
  assert.throws(() => settings(new Context()), /re-run sessionbus-dsh-install --product/u);
  assert.throws(() => settings(new Context(), { product: "Bad_Product" }), /\^\[a-z0-9\]/u);
  const laneContext = new Context();
  laneContext.launchEnvironment = { get: (key) => new Map([
    ["SESSIONBUS_LAUNCH_TOKEN", { value: "token" }],
    ["SESSIONBUS_GROUPS", { value: "not-json" }],
  ]).get(key) };
  assert.deepEqual(settings(laneContext, { product: "sessionbus-dsh" }).groups, []);
});

test("launch token is scrubbed and retained only by the kit handoff", async (t) => {
  const previous = process.env.SESSIONBUS_LAUNCH_TOKEN;
  t.after(() => {
    if (previous === undefined) delete process.env.SESSIONBUS_LAUNCH_TOKEN; else process.env.SESSIONBUS_LAUNCH_TOKEN = previous;
  });
  process.env.SESSIONBUS_LAUNCH_TOKEN = "ambient-copy";
  const ctx = new Context();
  const launch = new Map([["SESSIONBUS_LAUNCH_TOKEN", { value: "snapshot-secret" }], ["SESSIONBUS_SOCKET", { value: "/run/sessionbus.sock" }]]);
  ctx.launchEnvironment = { get: (key) => launch.get(key) };
  const deps = dependencies(ctx);
  const activating = activate(ctx, { product: "sessionbus-dsh" }, deps);
  assert.equal(process.env.SESSIONBUS_LAUNCH_TOKEN, undefined);
  const runtime = await activating;
  assert.equal(Object.hasOwn(runtime.settings, "token"), false);
  ctx.ready();
  delete deps.workerEnvironment.SESSIONBUS_LAUNCH_TOKEN;
  deps.callbacks.hello();
  assert.equal(launch.get("SESSIONBUS_LAUNCH_TOKEN").value, "snapshot-secret");
  assert.equal(JSON.stringify(runtime).includes("snapshot-secret"), false);
});

test("lane hello omits groups and session.open carrying daemon groups succeeds", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const { deps } = lane(ctx);
  assert.deepEqual(deps.callbacks.hello(), {
    product: "sessionbus-dsh", version: packageVersion, supports_message_run: true, supported_open_fields: ["cwd", "permission_mode", "model", "reasoning_effort"], extra_arguments: [],
  });
  const result = await deps.callbacks.open(null, {
    name: "parent/worker@host", groups: ["lane-primary", "lane-secondary"], open: { cwd: "/other", permission_mode: "never", model: "vendor/model/name", reasoning_effort: "high" },
  });
  assert.deepEqual(result, { session_id: native.id });
  assert.deepEqual(ctx.calls, [
    ["create", { cwd: "/other" }],
    ["rename", { sessionId: native.id, title: "parent/worker" }],
    ["model", { sessionId: native.id, provider: "vendor", model: "model/name", reasoningEffort: "high" }],
    ["permission", native.id, "never"],
    ["flush", native.id],
  ]);
  assert.deepEqual(deps.workerEnvironment, { SESSIONBUS_SOCKET: "/run/sessionbus.sock", SESSIONBUS_LAUNCH_TOKEN: "token" });
  const extra = agent(ctx, "session-extra");
  ctx.emit("agent/created", { agent: extra });
  assert.equal(deps.peers.length, 0);
});

test("lane rejects non-empty open.arguments before changing a native session", async () => {
  const ctx = new Context();
  const { deps, runtime } = lane(ctx);
  await assert.rejects(deps.callbacks.open(null, {
    name: "worker@host", groups: [], open: { arguments: ["--unsupported"] },
  }), /open\.arguments are not supported by DSH/u);
  assert.deepEqual(ctx.calls, []);
  runtime.close();
});

test("peer SESSIONBUS_GROUPS is a configuration proof against a fake daemon", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-groups-"));
  const socket = path.join(directory, "bus.sock");
  let resolveHello, rejectHello;
  const hello = new Promise((resolve, reject) => { resolveHello = resolve; rejectHello = reject; });
  const hellos = [];
  const server = net.createServer((stream) => {
    let buffer = "";
    stream.on("error", () => {});
    stream.on("data", (chunk) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const frame = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        try {
          assert.equal(frame.method, "session.hello");
          assert.deepEqual(frame.params.groups, ["alpha", "beta"]);
          hellos.push(frame.params);
          stream.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: {} })}\n`);
          if (hellos.length === 2) resolveHello();
        } catch (error) { rejectHello(error); }
      }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  const ctx = new Context();
  const root = agent(ctx, "session-peer-groups");
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_SOCKET: socket, SESSIONBUS_GROUPS: '["alpha","beta"]' };
  deps.connectPeer = connectPeer;
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  try {
    ctx.ready();
    const peer = runtime.peers.get(root).peer;
    await peer.ready;
    assert.deepEqual(peer.identity.groups, ["alpha", "beta"]);
    ctx.emit("session/event", root.session, { type: "session/title", data: { title: "Renamed" } });
    await runtime.peers.get(root).rehello;
    assert.deepEqual(deps.errors, []);
    await hello;
    assert.deepEqual(hellos, [
      { protocol: 1, product: "dsh", session_id: root.id, groups: ["alpha", "beta"], info: { cwd: "/workspace", model: "provider/default" } },
      { protocol: 1, product: "dsh", session_id: root.id, name: "Renamed", groups: ["alpha", "beta"], info: { cwd: "/workspace", model: "provider/default" } },
    ]);
  } finally {
    runtime.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a rejected peer hello is reported and a later title republishes", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-rejected-"));
  const socket = path.join(directory, "bus.sock");
  let attempts = 0;
  const server = net.createServer((stream) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const frame = JSON.parse(buffer.slice(0, newline));
      attempts++;
      const response = attempts === 1
        ? { jsonrpc: "2.0", id: frame.id, error: { code: -32602, message: "invalid_hello" } }
        : { jsonrpc: "2.0", id: frame.id, result: {} };
      stream.write(`${JSON.stringify(response)}\n`);
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  const ctx = new Context();
  agent(ctx, "session-rejected");
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_SOCKET: socket };
  deps.connectPeer = connectPeer;
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  try {
    ctx.ready();
    const rejected = runtime.peers.values().next().value.peer;
    await rejected.closed;
    await Promise.resolve();
    assert.deepEqual(deps.errors, ["sessionbus: invalid_hello\n"]);
    const root = ctx.roots[0];
    ctx.emitGlobal("session/event", root.session, { type: "session/title", data: { title: "Now publish" } });
    const admitted = runtime.peers.get(root).peer;
    assert.notEqual(admitted, rejected);
    await admitted.ready;
    assert.equal(attempts, 2);
    assert.deepEqual(deps.errors, ["sessionbus: invalid_hello\n"]);
  } finally {
    runtime.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("peer identity failures are terminal while socket failures report once and reconnect", async () => {
  const malformed = new Context();
  const badRoot = agent(malformed, "session-incomplete");
  badRoot.session.header.cwd = "";
  const badDeps = dependencies(malformed);
  badDeps.ambient = { SESSIONBUS_SOCKET: "/run/sessionbus.sock" };
  const malformedRuntime = createRuntime(malformed, { product: "dsh" }, badDeps);
  malformed.ready();
  assert.deepEqual(badDeps.errors, ["sessionbus: DSH root identity is incomplete\n"]);
  malformedRuntime.close();

  const ctx = new Context();
  const root = agent(ctx, "session-connect");
  const deps = dependencies(ctx);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-reconnect-"));
  const socket = path.join(directory, "presence.sock");
  const scheduled = [];
  let failure = deferred();
  deps.ambient = { SESSIONBUS_SOCKET: socket };
  deps.connectPeer = connectPeer;
  deps.schedule = (call) => scheduled.push(call);
  deps.stderr = (line) => { deps.errors.push(line); failure.resolve(); };
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  try {
    ctx.ready();
    const peer = runtime.peers.get(root).peer;
    await failure.promise;
    while (scheduled.length === 0) await new Promise(setImmediate);
    failure = deferred();
    scheduled.shift()();
    await failure.promise;
    while (scheduled.length === 0) await new Promise(setImmediate);
    assert.equal(runtime.peers.get(root).peer, peer);
    assert.equal(deps.errors.length, 2);
    assert.equal(deps.errors.every((line) => /^sessionbus: connect ENOENT /u.test(line)), true);

    const admitted = deferred();
    const server = net.createServer((stream) => {
      let buffer = "";
      stream.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const frame = JSON.parse(buffer.slice(0, newline));
        assert.equal(frame.method, "session.hello");
        stream.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: {} })}\n`);
        admitted.resolve();
      });
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
    scheduled.shift()();
    await admitted.promise;
    await peer.ready;
    assert.equal(runtime.peers.get(root).peer, peer);
    assert.equal(deps.errors.length, 2);
    runtime.close();
    await new Promise((resolve) => server.close(resolve));
  } finally {
    runtime.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("kit preserves spawn policy.trace through peer and lane callers", { timeout: 10000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-trace-"));
  const socket = path.join(directory, "bus.sock");
  const result = {
    session_id: "spawned-session",
    policy: { persistent: false, auto_close_ms: 60000, notify: false, trace: "content" },
  };
  const hellos = [], spawns = [], streams = new Set(), laneOpened = deferred();
  const server = net.createServer((stream) => {
    streams.add(stream);
    stream.on("close", () => streams.delete(stream));
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const frame = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (frame.method === "session.hello") {
          hellos.push(frame.params);
          stream.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: {} })}\n`);
          if (frame.params.launch_token) stream.write(`${JSON.stringify({ jsonrpc: "2.0", id: 100, method: "session.open", params: { name: "trace-worker@fake", groups: [], open: {} } })}\n`);
        } else if (frame.id === 100 && frame.result?.session_id) {
          laneOpened.resolve(frame.result);
        } else if (frame.method === "lane.spawn") {
          spawns.push(frame.params);
          stream.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result })}\n`);
        }
      }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  const runtimes = [];
  try {
    for (const mode of ["peer", "lane"]) {
      const ctx = new Context();
      const native = agent(ctx);
      const deps = dependencies(ctx);
      deps.ambient = { SESSIONBUS_SOCKET: socket, ...(mode === "lane" ? { SESSIONBUS_LAUNCH_TOKEN: "trace-token" } : {}) };
      if (mode === "peer") deps.connectPeer = connectPeer; else deps.serveWorker = serveWorker;
      const runtime = createRuntime(ctx, { product: mode === "peer" ? "dashi" : "sessionbus-dsh" }, deps);
      runtimes.push(runtime);
      ctx.ready();
      if (mode === "peer") await runtime.peers.get(native).peer.ready; else await laneOpened.promise;
      assert.deepEqual(await ctx.tool.execute({ action: "spawn", arguments: { product: "dashi", name: "trace-child", open: {} } }, { agent: native }), result);
      runtime.close();
      if (mode === "lane") await runtime.workerExit;
    }
    assert.deepEqual(hellos.map((hello) => Object.hasOwn(hello, "launch_token")), [false, true]);
    assert.deepEqual(spawns, Array(2).fill({ product: "dashi", name: "trace-child", open: {} }));
  } finally {
    for (const runtime of runtimes) runtime.close();
    for (const stream of streams) stream.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("resume keeps exact identity and uses the current model for effort", async () => {
  const ctx = new Context();
  const native = agent(ctx, "session-resume");
  const { deps } = lane(ctx);
  assert.deepEqual(await deps.callbacks.open(null, { name: "resumed@host", groups: [], resume_session_id: native.id, open: { reasoning_effort: "low" } }), { session_id: native.id });
  assert.equal(ctx.calls.some(([call]) => call === "create"), false);
  assert.deepEqual(ctx.calls.find(([call]) => call === "model")[1], { sessionId: native.id, provider: "provider", model: "default", reasoningEffort: "low" });
});

test("resume relays writer-held as a plain open failure", async () => {
  const ctx = new Context();
  const failure = Object.assign(new Error("session is held by another writer"), { code: "session/writer-held" });
  ctx.sessionController.resolveAgent = async () => ({ error: failure });
  const { deps } = lane(ctx);
  await assert.rejects(deps.callbacks.open(null, { name: "held@host", groups: [], resume_session_id: "held", open: {} }), (error) => error === failure);
});

test("run correlates receipt, turn, output, and terminal", async () => {
  const { ctx, native, deps } = await openedLane();
  let followed;
  native.followup = (message) => {
    followed = message;
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "turn/start", data: { turn: 4 } });
    ctx.emit("session/event", native.session, { type: "user/message", data: message });
    ctx.emit("session/event", native.session, { type: "assistant/message", data: { turn: 4, message: { content: [{ type: "text", text: "one" }, { type: "text", text: " two" }] } } });
    ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 4, reason: { kind: "completed" } } });
  };
  const token = { Native: null, Interrupted: () => false };
  assert.deepEqual(await deps.callbacks.run(new AbortController().signal, token, { text: "hello" }), { outcome: "completed", native_stop_reason: "completed", result: "one two" });
  assert.deepEqual(followed.content, [{ type: "text", text: "hello" }]);
  assert.deepEqual(followed.source, { kind: "plugin:sessionbus-dsh", form: "relay" });
  assert.equal(token.Native, null);
  assert.deepEqual(ctx.calls.at(-1), ["idle", native.id]);
});

test("delivery-backed run seed emits the shared sender envelope", async () => {
  const { ctx, native, deps } = await openedLane();
  let followed, reported;
  native.followup = (message) => {
    followed = message;
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "turn/start", data: { turn: 5 } });
    ctx.emit("session/event", native.session, { type: "user/message", data: message });
    ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 5, reason: { kind: "completed" } } });
  };
  const token = { Native: null, Interrupted: () => false, ReportDelivery: async (value) => { reported = value; } };
  await deps.callbacks.run(new AbortController().signal, token, { delivery: delivery("delivered", { message_id: "message-1", from: { session_id: "source", product: "dsh", groups: [] } }) });
  assert.deepEqual(followed.content, [{ type: "text", text: '<cross-session-message from="source" from-session="source">\n[sessionbus-metadata: {"fromProduct":"dsh","messageId":"message-1","groups":[]}]\ndelivered\n</cross-session-message>' }]);
  assert.deepEqual(reported, { disposition: "injected" });
  assert.deepEqual(followed.source, { kind: "plugin:sessionbus-dsh", form: "relay" });
});

test("unexpected run seed fails before creating native work", async () => {
  const { native, deps } = await openedLane();
  let followed = false;
  native.followup = () => { followed = true; };
  await assert.rejects(deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, {}), /unexpected run input seed shape/u);
  assert.equal(followed, false);
});

test("pre-commit turn error returns the durable DSH failure", async () => {
  const { ctx, native, deps } = await openedLane();
  native.followup = (message) => {
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "turn/start", data: { turn: 5 } });
    ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 5, reason: { kind: "error", error: { code: "UNKNOWN", message: "turn-start fixture failed" } } } });
  };
  assert.deepEqual(await deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "never committed" }), {
    outcome: "failed", native_stop_reason: "error", result: "UNKNOWN: turn-start fixture failed",
  });
});

test("input consumed outside a turn fails truthfully only after idle", async () => {
  const { ctx, native, deps } = await openedLane();
  const idle = deferred();
  native.whenIdle = () => idle.promise;
  native.followup = (message) => {
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "user/message", data: message });
  };
  let settled = false;
  const running = deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "misordered" });
  running.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  idle.resolve();
  await assert.rejects(running, /DSH consumed input outside a turn/);
});

test("cancel with turn end keeps the native aborted reason at idle", async () => {
  const { ctx, native, deps, idle, running, token } = await heldRun();
  let settled = false;
  running.then(() => { settled = true; }, () => { settled = true; });
  deps.callbacks.interrupt(null, token);
  ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 9, reason: { kind: "aborted", reason: { kind: "user" } } } });
  await Promise.resolve();
  assert.equal(settled, false);
  idle.resolve();
  assert.deepEqual(await running, { outcome: "interrupted", native_stop_reason: "aborted", result: "" });
});

test("cancel without turn end settles interrupted when the agent becomes idle", async () => {
  const { ctx, deps, idle, running, token } = await heldRun();
  deps.callbacks.interrupt(null, token);
  idle.resolve();
  assert.deepEqual(await running, { outcome: "interrupted", native_stop_reason: "aborted:user", result: "" });
  assert.deepEqual(ctx.calls.find(([call]) => call === "cancel"), ["cancel", { kind: "user" }, { keepInbox: true }]);
});

test("session close after a missing turn end keeps the interrupt terminal", async () => {
  const { ctx, native, deps, idle, running, token } = await heldRun();
  deps.callbacks.interrupt(null, token);
  idle.resolve();
  assert.deepEqual(await running, { outcome: "interrupted", native_stop_reason: "aborted:user", result: "" });
  native.status = "idle";
  await deps.callbacks.close();
  assert.deepEqual(ctx.calls.filter(([call]) => call === "cancel"), [["cancel", { kind: "user" }, { keepInbox: true }]]);
  assert.deepEqual(ctx.calls.at(-1), ["flush", native.id]);
});

test("a missing turn end cannot leak its turn into the next run", async () => {
  const { ctx, native, deps } = await openedLane();
  const idles = [deferred(), deferred()];
  let nextIdle = 0;
  native.status = "running";
  native.whenIdle = () => idles[nextIdle++].promise;
  let nextRun = 0;
  native.followup = (message) => {
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    if (nextRun++ === 0) ctx.emit("session/event", native.session, { type: "turn/start", data: { turn: 41 } });
    ctx.emit("session/event", native.session, { type: "user/message", data: message });
  };

  const firstToken = { Native: null, Interrupted: () => false };
  const first = deps.callbacks.run(new AbortController().signal, firstToken, { text: "first" });
  deps.callbacks.interrupt(null, firstToken);
  idles[0].resolve();
  assert.deepEqual(await first, { outcome: "interrupted", native_stop_reason: "aborted:user", result: "" });

  const second = deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "second" });
  let settled = false;
  second.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  idles[1].resolve();
  await assert.rejects(second, /DSH consumed input outside a turn/);
});

test("pre-aborted run and lane delivery create no native receipt", async () => {
  const { native, deps, runtime } = await openedLane();
  let nativeCalls = 0;
  native.followup = native.steer = () => { nativeCalls++; };
  native.status = "running";
  const cancel = new AbortController();
  cancel.abort(new Error("already cancelled"));
  await assert.rejects(deps.callbacks.run(cancel.signal, { Native: null, Interrupted: () => false }, { text: "run" }), /already cancelled/);
  await assert.rejects(deps.callbacks.deliver(cancel.signal, delivery("deliver")), (error) => error.code === -32004);
  assert.equal(nativeCalls, 0);
  assert.equal(runtime.native.receipts.size, 0);
});

test("throwing followup and steer settle receipts and remove cancel listeners", async (t) => {
  const { native, deps, runtime } = await openedLane();
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.removeListener("unhandledRejection", onUnhandled));
  const tracked = () => {
    const listeners = new Set();
    return { aborted: false, addEventListener: (_name, call) => listeners.add(call), removeEventListener: (_name, call) => listeners.delete(call), listeners };
  };
  const runCancel = tracked();
  native.followup = () => { throw new Error("followup failed"); };
  await assert.rejects(deps.callbacks.run(runCancel, { Native: null, Interrupted: () => false }, { text: "run" }), /followup failed/);
  const deliverCancel = tracked();
  native.steer = () => { throw new Error("steer failed"); };
  assert.deepEqual(await runtime.native.deliver(deliverCancel, delivery("deliver")), { disposition: "rejected", reason: "steer failed" });
  native.followup = () => {};
  const cancelled = new AbortController();
  const running = deps.callbacks.run(cancelled.signal, { Native: null, Interrupted: () => false }, { text: "cancelled" });
  cancelled.abort(new Error("connection lost"));
  await assert.rejects(running, /connection lost/);
  await Promise.resolve();
  assert.equal(runCancel.listeners.size + deliverCancel.listeners.size, 0);
  assert.equal(runtime.native.receipts.size, 0);
  assert.deepEqual(unhandled, []);
});

for (const [reason, outcome] of [["completed", "completed"], ["aborted", "interrupted"], ["interrupted", "interrupted"], ["blocked", "failed"], ["error", "failed"], ["max-tokens", "failed"]]) {
  test(`turn end ${reason} maps to ${outcome}`, () => assert.deepEqual(terminal({ kind: reason }), { outcome, native_stop_reason: reason }));
}

test("pre-interrupted run creates no native work and interrupt is exact", async () => {
  const { ctx, native, deps } = await openedLane();
  let followed = false;
  native.followup = () => { followed = true; };
  assert.deepEqual(await deps.callbacks.run(new AbortController().signal, { Interrupted: () => true }, { text: "stop" }), { outcome: "interrupted", result: "" });
  assert.equal(followed, false);
  deps.callbacks.interrupt(null, { Native: {} });
  assert.deepEqual(ctx.calls.at(-1), ["cancel", { kind: "user" }, { keepInbox: true }]);
});

test("lane delivery admitted before turn end keeps its truthful steer receipt", async () => {
  const { ctx, native, deps, idle, running, token } = await heldRun();
  let steered;
  native.steer = (message) => {
    steered = message;
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 9, reason: { kind: "completed" } } });
  };

  assert.deepEqual(await deps.callbacks.deliver(null, delivery("active"), undefined, token), { disposition: "injected" });
  assert.match(steered.content[0].text, /<cross-session-message from="Sender" from-session="sender@host">[\s\S]*\nactive\n<\/cross-session-message>/u);
  idle.resolve();
  assert.deepEqual(await running, { outcome: "completed", native_stop_reason: "completed", result: "" });
});

test("lane delivery after turn end returns NotRunning without a second native turn", async () => {
  const { ctx, native, deps, idle, running, token } = await heldRun();
  let steers = 0;
  native.steer = () => { steers++; };
  ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 9, reason: { kind: "completed" } } });

  await assert.rejects(deps.callbacks.deliver(null, delivery("boundary"), undefined, token),
    (error) => error.code === -32004 && error.message === "not_running");
  assert.equal(steers, 0);
  idle.resolve();
  assert.deepEqual(await running, { outcome: "completed", native_stop_reason: "completed", result: "" });
});

test("lane ended-run NotRunning reaches the kit reply as an RPC error", { timeout: 10000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-boundary-reply-"));
  const socket = path.join(directory, "bus.sock");
  const boundary = deferred(), ready = deferred(), idle = deferred();
  const streams = new Set();
  const ctx = new Context();
  const native = agent(ctx);
  native.status = "running";
  native.whenIdle = () => idle.promise;
  native.followup = (message) => {
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "turn/start", data: { turn: 10 } });
    ctx.emit("session/event", native.session, { type: "user/message", data: message });
  };
  const server = net.createServer((stream) => {
    streams.add(stream);
    stream.on("close", () => streams.delete(stream));
    let buffer = "";
    const send = (value) => stream.write(`${JSON.stringify({ jsonrpc: "2.0", ...value })}\n`);
    stream.on("data", (chunk) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const frame = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (frame.method === "session.hello") {
          send({ id: frame.id, result: {} });
          send({ id: 100, method: "session.open", params: {
            name: "boundary", groups: [],
            policy: { persistent: false, auto_close_ms: 60000, notify: false }, open: {},
          } });
        } else if (frame.id === 100 && frame.result?.session_id) {
          send({ id: 101, method: "turn.execute", params: { session_id: frame.result.session_id, run_id: "boundary/1", input: "hold" } });
        } else if (frame.id === 101 && frame.result?.run_id === "boundary/1") {
          ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 10, reason: { kind: "completed" } } });
          send({ id: 102, method: "message.deliver", params: delivery("boundary") });
        } else if (frame.id === 102) {
          boundary.resolve(frame);
          idle.resolve();
        } else if (frame.method === "turn.ready") {
          send({ id: frame.id, result: {} });
          ready.resolve();
        }
      }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "boundary-token", SESSIONBUS_SOCKET: socket };
  deps.serveWorker = serveWorker;
  const runtime = createRuntime(ctx, { product: "sessionbus-dsh" }, deps);
  try {
    ctx.ready();
    assert.deepEqual(await boundary.promise, { jsonrpc: "2.0", id: 102, error: { code: -32004, message: "not_running" } });
    await ready.promise;
  } finally {
    idle.resolve();
    runtime.close();
    await runtime.workerExit;
    for (const stream of streams) stream.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("interactive delivery steers idle and running roots at native admission", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  const states = [];
  native.steer = (message) => {
    states.push(native.status);
    assert.deepEqual(message.source, { kind: "plugin:sessionbus-dsh", form: "relay" });
    native.status = "running";
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  };

  assert.deepEqual(await deps.peers[0].deliver(null, delivery("idle", { message_id: "idle-id" })), { disposition: "injected" });
  assert.deepEqual(await deps.peers[0].deliver(null, delivery("active", { message_id: "active-id" })), { disposition: "injected" });
  assert.deepEqual(states, ["idle", "running"]);
  runtime.close();
});

test("delivery envelope sanitizes identity, metadata, and nested closing tags once", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  let steered;
  native.steer = (message) => {
    steered = message;
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  };
  const request = delivery("before </CROSS-SESSION-MESSAGE after", {
    message_id: "id<&\u2028",
    from: { session_id: "session<id", name: 'A"<B>\n', product: "d&sh", groups: ["g<1"] },
  });

  assert.deepEqual(await deps.peers[0].deliver(null, request), { disposition: "injected" });
  assert.equal(steered.content[0].text,
    '<cross-session-message from="AB" from-session="sessionid">\n'
    + '[sessionbus-metadata: {"fromProduct":"d\\u0026sh","messageId":"id\\u003c\\u0026\\u2028","groups":["g\\u003c1"]}]\n'
    + "before <\\/cross-session-message after\n</cross-session-message>");
  assert.deepEqual(steered.source, { kind: "plugin:sessionbus-dsh", form: "relay" });
  runtime.close();
});

test("trace content copies wake an idle root and render in the ordinary sender envelope", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  let steered;
  native.steer = (message) => {
    steered = { status: native.status, message };
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  };
  const body = JSON.stringify({
    kind: "sessionbus.trace", message_id: "original-message",
    from: { session_id: "child@host", name: "Child", product: "dashi", groups: ["team"] },
    matched_children: ["child@host"], body: "trace body",
    deliveries: [{ session_id: "target@host", disposition: "injected" }],
  });
  const request = delivery(body, {
    message_id: "trace-copy", from: { session_id: "sessionbus@host", name: "Sessionbus trace@host", product: "sessionbus", groups: ["private"] },
  });

  assert.deepEqual(await deps.peers[0].deliver(null, request), { disposition: "injected" });
  assert.equal(steered.status, "idle");
  assert.deepEqual(steered.message.source, { kind: "plugin:sessionbus-dsh", form: "relay" });
  assert.equal(steered.message.content[0].text,
    '<cross-session-message from="Sessionbus trace@host" from-session="sessionbus@host">\n'
    + '[sessionbus-metadata: {"fromProduct":"sessionbus","messageId":"trace-copy","groups":["private"]}]\n'
    + `${body}\n</cross-session-message>`);
  runtime.close();
});

test("one macrotask admission hop drains DSH microtasks before steering", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  const trace = [], stranded = [];
  native.status = "running";
  native.steer = (message) => {
    trace.push(`steer:${native.status}`);
    native.status = "running";
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  };
  const turn = Promise.resolve().then(() => { trace.push("hasPending:false"); return false; });
  const kick = (async () => { if (!await turn) { native.status = "idle"; trace.push("idle"); } })();
  let result;
  queueMicrotask(() => {
    stranded.push("message");
    if (native.status === "idle") stranded.length = 0;
    result = deps.peers[0].deliver(null, delivery("safe"));
    trace.push("delivery-callback");
  });
  await kick;
  assert.deepEqual(stranded, ["message"]);
  assert.deepEqual(trace, ["hasPending:false", "delivery-callback", "idle"]);
  assert.deepEqual(await result, { disposition: "injected" });
  assert.deepEqual(trace, ["hasPending:false", "delivery-callback", "idle", "steer:idle"]);
  runtime.close();
});

test("deferred deliveries preserve FIFO admission order", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  const steered = [];
  native.steer = (message) => {
    steered.push(message);
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  };

  const first = deps.peers[0].deliver(null, delivery("one", { message_id: "one" }));
  const second = deps.peers[0].deliver(null, delivery("two", { message_id: "two" }));
  assert.equal(steered.length, 0);
  assert.deepEqual(await Promise.all([first, second]), [{ disposition: "injected" }, { disposition: "injected" }]);
  assert.deepEqual(steered.map((message) => message.content[0].text.includes("\none\n") ? "one" : "two"), ["one", "two"]);
  runtime.close();
});

test("disposed root rejects queued delivery without steering its replacement", async () => {
  const ctx = new Context();
  const original = agent(ctx, "original");
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  const peer = deps.peers[0];
  let originalSteers = 0, replacementSteers = 0;
  original.steer = () => { originalSteers++; };
  const result = peer.deliver(null, delivery("too late"));
  ctx.emit("agent/disposed", { agent: original });
  const replacement = agent(ctx, "replacement");
  replacement.steer = () => { replacementSteers++; };
  ctx.emit("agent/created", { agent: replacement });

  assert.deepEqual(await result, { disposition: "rejected", reason: "native owner closed" });
  assert.equal(originalSteers + replacementSteers, 0);
  runtime.close();
});

test("lost receipt after steer is ProtocolError admission uncertainty", async () => {
  const ctx = new Context();
  const native = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  const steered = deferred();
  native.steer = () => { steered.resolve(); };
  const cancel = new AbortController();
  const result = deps.peers[0].deliver(cancel.signal, delivery("maybe", { message_id: "uncertain-id" }));
  await steered.promise;
  cancel.abort(new Error("connection lost"));

  await assert.rejects(result, (error) => error.code === -32603 && error.message === "internal"
    && error.data?.kind === "delivery_admission_uncertain" && error.data?.message_id === "uncertain-id"
    && error.data?.reason === "connection lost");
  runtime.close();
});

test("close cancels running work, idles, flushes, and closed exits", async () => {
  const { ctx, native, deps, runtime } = await openedLane();
  native.status = "running";
  await deps.callbacks.close();
  assert.deepEqual(ctx.calls.slice(-3), [["cancel", { kind: "disposed" }], ["idle", native.id], ["flush", native.id]]);
  deps.closeWorker();
  await runtime.workerExit;
  assert.deepEqual(ctx.exits, [0]);
});

test("human groups command swaps only its root after admission and persists the choice", async () => {
  const ctx = new Context();
  const one = agent(ctx, "groups-one"), two = agent(ctx, "groups-two");
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_GROUPS: '["default"]' };
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  assert.equal(ctx.command.name, "sessionbus-groups");
  assert.equal(ctx.registeredTools.has("sessionbus-groups"), false);
  const invoke = (rawInput, target = one) => ctx.command.handler({ agent: target, rawInput, signal: new AbortController().signal });
  assert.deepEqual(await invoke(""), { kind: "success", text: '["default"]' });
  const old = runtime.peers.get(one).peer;
  const admission = deferred();
  const connect = deps.connectPeer;
  deps.connectPeer = (...args) => { const peer = connect(...args); peer.ready = admission.promise; return peer; };
  const changed = invoke("alpha,beta");
  await new Promise(setImmediate);
  assert.equal(old.stopped, undefined);
  assert.deepEqual(ctx.groupWrites, []);
  admission.resolve();
  assert.deepEqual(await changed, { kind: "success", text: '["alpha","beta"]' });
  assert.equal(old.stopped, true);
  assert.deepEqual(runtime.peers.get(one).identity.groups, ["alpha", "beta"]);
  assert.deepEqual(runtime.peers.get(two).identity.groups, ["default"]);
  assert.deepEqual(ctx.groupRecords.get(one.id), ["alpha", "beta"]);
  ctx.emit("session/event", one.session, { type: "session/title", data: { title: "Renamed" } });
  await runtime.peers.get(one).rehello;
  assert.deepEqual(runtime.peers.get(one).identity.groups, ["alpha", "beta"]);
  const count = deps.peers.length;
  assert.deepEqual(await invoke("alpha,beta"), { kind: "success", text: '["alpha","beta"]' });
  assert.equal(deps.peers.length, count);
  assert.deepEqual(await invoke("-"), { kind: "success", text: '["default"]' });
  assert.equal(ctx.groupRecords.has(one.id), false);
  assert.equal(ctx.effects.size, 1, "temporary candidate effects are removed after adoption");
  await runtime.close();
  assert.equal(ctx.command, undefined);
});

test("groups validation and lane/non-root refusals have no connection or storage effect", async () => {
  const ctx = new Context(), root = agent(ctx);
  const deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  for (const rawInput of ["a,a", "a,,b", "a\nb", "\0"]) {
    assert.equal((await ctx.command.handler({ agent: root, rawInput, signal: new AbortController().signal })).kind, "error");
  }
  assert.equal((await ctx.command.handler({ agent: {}, rawInput: "a", signal: new AbortController().signal })).kind, "error");
  assert.equal(deps.peers.length, 1);
  assert.deepEqual(ctx.groupWrites, []);
  await runtime.close();
  const laneCtx = new Context(), laneRoot = agent(laneCtx);
  const running = lane(laneCtx);
  for (const rawInput of ["", "a", "-"]) assert.match((await laneCtx.command.handler({ agent: laneRoot, rawInput, signal: new AbortController().signal })).text, /lane/u);
  assert.deepEqual(laneCtx.groupWrites, []);
  running.runtime.close();
});

test("terminally rejected group candidates preserve the old peer and report the daemon reason", async () => {
  for (const reason of [undefined, "declared group is forbidden\nby daemon"]) {
    const ctx = new Context(), root = agent(ctx);
    const deps = dependencies(ctx), runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
    ctx.ready();
    const old = runtime.peers.get(root), connect = deps.connectPeer;
    deps.connectPeer = (...args) => {
      const peer = connect(...args);
      peer.ready = new Promise(() => {});
      peer.finish(Object.assign(new Error("invalid_hello"), { code: -32602, data: reason }));
      return peer;
    };
    const result = await ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
    assert.deepEqual(result, { kind: "error", text: reason ? "invalid_hello: declared group is forbidden by daemon" : "invalid_hello" });
    assert.equal(runtime.peers.get(root), old);
    assert.equal(old.peer.stopped, undefined);
    assert.equal(deps.peers[1].stopped, true);
    assert.deepEqual(await deps.peers[1].deliver(null, delivery("stale failed candidate")), { disposition: "rejected", reason: "native owner closed" });
    assert.deepEqual(ctx.groupWrites, []);
    assert.deepEqual(deps.errors, []);
    assert.equal(ctx.effects.size, 1, "temporary candidate effects are removed on failure");
    await runtime.close();
  }
});

test("successful overlap absorbs supersession, preserves active delivery and serializes titles and groups", async () => {
  const ctx = new Context(), root = agent(ctx);
  root.status = "running";
  root.steer = message => ctx.emit("session/event", root.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  const deps = dependencies(ctx), runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
  ctx.ready();
  const old = runtime.peers.get(root).peer, admitted = deferred(), connect = deps.connectPeer;
  deps.connectPeer = (...args) => {
    const peer = connect(...args), list = peer.caller.list;
    peer.caller.list = async (...values) => {
      old.finish(Object.assign(new Error("superseded"), { code: -32012 }));
      await admitted.promise;
      return list(...values);
    };
    return peer;
  };
  const first = ctx.command.handler({ agent: root, rawInput: "one,two", signal: new AbortController().signal });
  await new Promise(setImmediate);
  ctx.titles.set(root.session, { title: "During swap" });
  ctx.emitGlobal("session/event", root.session, { type: "session/title", data: { title: "During swap" } });
  const second = ctx.command.handler({ agent: root, rawInput: "two,one", signal: new AbortController().signal });
  admitted.resolve();
  assert.equal((await first).kind, "success");
  assert.equal((await second).kind, "success");
  const current = runtime.peers.get(root);
  await current.rehello;
  assert.deepEqual(current.identity.groups, ["two", "one"]);
  assert.equal(current.identity.name, "During swap");
  assert.deepEqual(deps.errors, [], "expected supersession is not a publication failure");
  assert.equal(root.status, "running", "group changes never cancel or idle the turn");
  assert.deepEqual(await current.peer.deliver(null, delivery("after swap")), { disposition: "injected" });
  assert.equal(ctx.calls.filter(call => call[0] === "cancel").length, 0);
  assert.deepEqual(ctx.groupWrites.map(call => call[2]), [["one", "two"], ["two", "one"]]);
  await runtime.close();
});

test("failed self-info check never detaches; late supersession adopts and saves without replay", async (t) => {
  for (const failure of ["disconnected", "wrong-identity", "timeout"]) {
    const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
    const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
    ctx.ready();
    const old = runtime.peers.get(root), connect = deps.connectPeer;
    const bound = new AbortController(), checking = deferred();
    const timer = t.mock.method(AbortSignal, "timeout", (ms) => { assert.equal(ms, 5000); return bound.signal; });
    let lists = 0;
    deps.connectPeer = (...args) => {
      const peer = connect(...args);
      peer.caller.list = async (_args, signal) => {
        lists++;
        checking.resolve();
        if (failure === "disconnected") throw Object.assign(new Error("not connected"), { code: -32002 });
        if (failure === "wrong-identity") return { self_info: { session_id: "wrong@fake", product: "dsh", groups: [] } };
        return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      };
      return peer;
    };
    const change = ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
    await checking.promise;
    if (failure === "timeout") bound.abort(new Error("list timed out"));
    const result = await change;
    const candidate = deps.peers[1];
    const state = { result, mapped: runtime.peers.get(root), oldStopped: old.peer.stopped, stopped: candidate.stopped, writes: [...ctx.groupWrites] };
    if (result.text.startsWith("change in progress")) {
      assert.deepEqual(await ctx.command.handler({ agent: root, rawInput: "", signal: new AbortController().signal }), { kind: "success", text: '["before"]' });
      old.peer.finish(Object.assign(new Error("superseded"), { code: -32012 }));
      await old.rehello;
      assert.equal(runtime.peers.get(root).peer, candidate);
      assert.deepEqual(ctx.groupRecords.get(root.id), ["after"]);
      assert.deepEqual(await ctx.command.handler({ agent: root, rawInput: "", signal: new AbortController().signal }), { kind: "success", text: '["after"]' });
    }
    await runtime.close();
    timer.mock.restore();
    assert.deepEqual(state.result, { kind: "success", text: "change in progress; `/sessionbus-groups` with no argument shows the result" }, failure);
    assert.equal(state.mapped, old, failure);
    assert.equal(state.oldStopped, undefined, failure);
    assert.equal(state.stopped, undefined, failure);
    assert.deepEqual(state.writes, []);
    assert.equal(lists, 1, "one admission check, no polling");
    assert.equal(deps.peers.length, 2, "no plugin retry or uncertain replay");
    assert.deepEqual(deps.errors, []);
  }
});

test("cancellation before attempt has no effect; cancellation after attempt cannot detach or cancel saving", async () => {
  for (const when of ["before", "waiting-ready", "checking"]) {
    const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
    const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
    ctx.ready();
    const cancel = new AbortController(), ready = deferred(), checking = deferred(), confirm = deferred();
    const old = runtime.peers.get(root).peer, connect = deps.connectPeer;
    if (when === "before") cancel.abort(new Error("user cancelled"));
    deps.connectPeer = (...args) => {
      const peer = connect(...args), list = peer.caller.list;
      peer.ready = ready.promise;
      peer.caller.list = async () => { checking.resolve(); await confirm.promise; return list(); };
      return peer;
    };
    const change = ctx.command.handler({ agent: root, rawInput: "after", signal: cancel.signal });
    await new Promise(setImmediate);
    if (when === "waiting-ready") cancel.abort(new Error("user cancelled"));
    ready.resolve();
    if (when === "checking") { await checking.promise; cancel.abort(new Error("user cancelled")); }
    const candidateStopped = deps.peers[1]?.stopped;
    confirm.resolve();
    const result = await change;
    const writes = [...ctx.groupWrites];
    await runtime.close();
    assert.equal(candidateStopped, undefined, when);
    if (when === "before") {
      assert.deepEqual(result, { kind: "error", text: "user cancelled" });
      assert.equal(deps.peers.length, 1);
      assert.deepEqual(writes, []);
    } else {
      assert.deepEqual(result, { kind: "success", text: '["after"]' }, when);
      assert.equal(old.stopped, true);
      assert.deepEqual(writes, [["put", root.id, ["after"]]]);
    }
  }
});

test("pending ready has no swap deadline; the single self-info check alone has a 5s bound", async (t) => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  const admission = deferred(), connect = deps.connectPeer, bounds = [];
  t.mock.method(AbortSignal, "timeout", (ms) => { bounds.push(ms); return new AbortController().signal; });
  deps.connectPeer = (...args) => { const peer = connect(...args); peer.ready = admission.promise; return peer; };
  const changed = ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
  await new Promise(setImmediate);
  assert.deepEqual(bounds, [], "nothing times out or closes while hello is pending");
  admission.resolve();
  assert.equal((await changed).kind, "success");
  assert.deepEqual(bounds, [5000]);
  await runtime.close();
});

test("candidate retains the kit scheduling contract even before map adoption", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const scheduled = [], connect = deps.connectPeer;
  deps.schedule = (call, delay) => { scheduled.push(delay); call(); };
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  let resumed = 0;
  deps.connectPeer = (...args) => {
    assert.equal(args[3].schedule, deps.schedule);
    args[3].schedule(() => { resumed++; }, 2000);
    return connect(...args);
  };
  const result = await ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
  assert.equal(result.kind, "success");
  assert.equal(resumed, 1);
  assert.deepEqual(scheduled, [2000]);
  await runtime.close();
});

test("rejection after progress preserves the old identity and reports one diagnostic before later valid change", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
  ctx.ready();
  const old = runtime.peers.get(root), connect = deps.connectPeer;
  deps.connectPeer = (...args) => {
    const peer = connect(...args);
    peer.caller.list = async () => { throw new Error("not connected"); };
    return peer;
  };
  const progress = await ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
  assert.match(progress.text, /^change in progress/u);
  assert.equal(deps.peers[1].stopped, undefined);
  assert.equal(old.peer.stopped, undefined);
  assert.deepEqual(ctx.groupWrites, []);
  ctx.titles.set(root.session, { title: "While pending" });
  ctx.emitGlobal("session/event", root.session, { type: "session/title", data: { title: "While pending" } });
  deps.connectPeer = connect;
  const later = ctx.command.handler({ agent: root, rawInput: "later", signal: new AbortController().signal });
  await new Promise(setImmediate);
  assert.equal(deps.peers.length, 2, "later mutation is serialized, not another competing attempt");
  deps.peers[1].finish(Object.assign(new Error("invalid_hello"), { code: -32602, data: { reason: "forbidden\nlist" } }));
  assert.deepEqual(await later, { kind: "success", text: '["later"]' });
  assert.equal(runtime.peers.get(root).identity.name, "While pending");
  assert.deepEqual(ctx.groupWrites, [["put", root.id, ["later"]]]);
  assert.deepEqual(deps.errors, ['sessionbus: invalid_hello: {"reason":"forbidden\\nlist"}\n']);
  await runtime.close();
});

test("old reconnect terminal rejection after progress releases the queue and unpublishes once", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
  ctx.ready();
  const old = runtime.peers.get(root), connect = deps.connectPeer;
  deps.connectPeer = (...args) => {
    const peer = connect(...args);
    peer.caller.list = async () => { throw new Error("not connected"); };
    return peer;
  };
  assert.match((await ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal })).text, /^change in progress/u);
  const cancel = new AbortController();
  const queued = ctx.command.handler({ agent: root, rawInput: "later", signal: cancel.signal });
  cancel.abort(new Error("queued user cancelled"));
  old.peer.finish(Object.assign(new Error("invalid_hello"), { code: -32602 }));
  await new Promise(setImmediate);
  const state = { mapped: runtime.peers.has(root), stopped: deps.peers[1].stopped, errors: [...deps.errors], effects: ctx.effects.size };
  // Cleanup also releases the old implementation's dead queue, so the test fails, not hangs.
  await ctx.dispose();
  const result = await queued;
  assert.equal(state.mapped, false, "terminal old peer cannot remain published");
  assert.equal(state.stopped, true, "pending candidate belongs to the failed operation");
  assert.deepEqual(state.errors, ["sessionbus: invalid_hello\n"]);
  assert.equal(state.effects, 1);
  assert.deepEqual(ctx.groupWrites, []);
  assert.deepEqual(result, { kind: "error", text: "queued user cancelled" });
});

test("lost self-info acknowledgment after supersession preserves the admitted candidate", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
  ctx.ready();
  const old = runtime.peers.get(root), connect = deps.connectPeer;
  deps.connectPeer = (...args) => {
    const peer = connect(...args);
    peer.caller.list = async () => {
      old.peer.finish(Object.assign(new Error("superseded"), { code: -32012 }));
      throw new Error("acknowledgment lost");
    };
    return peer;
  };
  const result = await ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
  assert.match(result.text, /^change in progress/u);
  await old.rehello;
  assert.equal(runtime.peers.get(root).peer, deps.peers[1]);
  assert.equal(deps.peers[1].stopped, undefined);
  assert.deepEqual(ctx.groupRecords.get(root.id), ["after"]);
  assert.deepEqual(deps.errors, []);
  await runtime.close();
});

test("adoption cannot overwrite a different map record after the confirmation await", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  const old = runtime.peers.get(root), connect = deps.connectPeer;
  const newer = { peer: { shutdown() {} }, identity: { groups: ["external"] }, rehello: Promise.resolve() };
  deps.connectPeer = (...args) => {
    const peer = connect(...args), list = peer.caller.list;
    peer.caller.list = async () => { runtime.peers.set(root, newer); return list(); };
    return peer;
  };
  const result = await ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
  assert.equal(result.kind, "error");
  assert.equal(runtime.peers.get(root), newer);
  assert.equal(old.peer.stopped, undefined);
  assert.equal(deps.peers[1].stopped, true);
  assert.deepEqual(ctx.groupWrites, []);
  await runtime.close();
  old.peer.shutdown();
});

test("admitted candidate accepts delivery while its one self-info check is still pending", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  let steers = 0;
  root.steer = message => { steers++; ctx.emit("session/event", root.session, { type: "agent/inbox/spliced", data: { inserted: [message] } }); };
  const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
  ctx.ready();
  const old = runtime.peers.get(root), checking = deferred(), confirm = deferred(), connect = deps.connectPeer;
  deps.connectPeer = (...args) => {
    const peer = connect(...args), list = peer.caller.list;
    peer.caller.list = async () => {
      old.peer.finish(Object.assign(new Error("superseded"), { code: -32012 }));
      checking.resolve();
      await confirm.promise;
      return list();
    };
    return peer;
  };
  const change = ctx.command.handler({ agent: root, rawInput: "after", signal: new AbortController().signal });
  await checking.promise;
  assert.equal(runtime.peers.get(root), old, "admission proof has not adopted the candidate yet");
  const receipt = await deps.peers[1].deliver(null, delivery("during admission check"));
  confirm.resolve();
  const result = await change;
  await runtime.close();
  assert.equal(result.kind, "success");
  assert.deepEqual(receipt, { disposition: "injected" }, "the already-admitted new attachment must not lose unattempted input");
  assert.equal(steers, 1, "no replay or second input insertion");
});

test("saving failure after admission keeps live groups and prior durable choice", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  ctx.groupRecords.set(root.id, ["saved"]);
  const runtime = createRuntime(ctx, { product: "dsh", groups: ["default"] }, deps);
  ctx.ready();
  ctx.groupTable.put = async () => { throw new Error("disk full"); };
  const result = await ctx.command.handler({ agent: root, rawInput: "live", signal: new AbortController().signal });
  assert.deepEqual(result, { kind: "error", text: "live groups changed, saving failed: disk full; restart will use the prior value" });
  assert.deepEqual(runtime.peers.get(root).identity.groups, ["live"]);
  assert.deepEqual(ctx.groupRecords.get(root.id), ["saved"]);
  await runtime.close();
  const restarted = createRuntime(ctx, { product: "dsh", groups: ["changed-default"] }, deps);
  ctx.ready();
  assert.deepEqual(restarted.peers.get(root).identity.groups, ["saved"]);
  const fork = agent(ctx, "forked-id");
  ctx.emitGlobal("agent/created", { agent: fork });
  assert.deepEqual(restarted.peers.get(fork).identity.groups, ["changed-default"]);
  await restarted.close();
});

test("saving failure without a live identity change says unchanged for both set and reset", async () => {
  for (const rawInput of ["same", "-"]) {
    const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
    ctx.groupRecords.set(root.id, ["same"]);
    const runtime = createRuntime(ctx, { product: "dsh", groups: ["same"] }, deps);
    ctx.ready();
    ctx.groupTable.put = ctx.groupTable.delete = async () => { throw new Error("disk full"); };
    const result = await ctx.command.handler({ agent: root, rawInput, signal: new AbortController().signal });
    assert.deepEqual(result, { kind: "error", text: "live groups unchanged, saving failed: disk full; restart will use the prior value" });
    assert.deepEqual(ctx.groupRecords.get(root.id), ["same"]);
    assert.equal(deps.peers.length, 1);
    await runtime.close();
  }
});

test("native disposal or id replacement closes pending candidates without publishing stale roots", async () => {
  for (const cause of ["dispose", "id-change", "close"]) {
    const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
    const runtime = createRuntime(ctx, { product: "dsh", groups: ["before"] }, deps);
    ctx.ready();
    const connect = deps.connectPeer, ready = deferred();
    deps.connectPeer = (...args) => { const peer = connect(...args); peer.ready = ready.promise; return peer; };
    const cancel = new AbortController();
    const pending = ctx.command.handler({ agent: root, rawInput: "after", signal: cancel.signal });
    await new Promise(setImmediate);
    if (cause === "dispose") ctx.emitGlobal("agent/disposed", { agent: root });
    else if (cause === "close") await runtime.close();
    else { root.session.id = "other"; ready.resolve(); }
    assert.equal((await pending).kind, "error", cause);
    assert.equal(deps.peers[1].stopped, true);
    assert.deepEqual(ctx.groupWrites, []);
    assert.equal([...runtime.peers.values()].some(record => record.identity.groups.includes("after")), false);
    await runtime.close();
  }
});

test("disposal after supersession closes a candidate still waiting for admission proof", async () => {
  for (const cause of ["dispose", "close"]) {
    const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
    const runtime = createRuntime(ctx, { product: "dsh" }, deps);
    ctx.ready();
    const old = runtime.peers.get(root).peer, connect = deps.connectPeer, checking = deferred();
    deps.connectPeer = (...args) => {
      const peer = connect(...args);
      peer.caller.list = async (_args, signal) => {
        old.finish(Object.assign(new Error("superseded"), { code: -32012 }));
        checking.resolve();
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          peer.closed.then(() => reject(new Error("candidate closed")));
        });
      };
      return peer;
    };
    const cancel = new AbortController();
    const pending = ctx.command.handler({ agent: root, rawInput: "after", signal: cancel.signal });
    await checking.promise;
    if (cause === "dispose") ctx.emitGlobal("agent/disposed", { agent: root }); else await ctx.dispose();
    const closed = deps.peers[1].stopped === true;
    cancel.abort(new Error("test cleanup"));
    await pending;
    await runtime.close();
    assert.equal(closed, true, `${cause}: do not leave the superseding attachment alive until the five-second deadline`);
  }
});

test("peer mode tracks roots, re-hellos titles, and binds tools to the executing root", async () => {
  const ctx = new Context();
  const one = agent(ctx, "session-one");
  ctx.titles.set(one.session, { title: "Original" });
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_SOCKET: "/run/sessionbus.sock", SESSIONBUS_GROUPS: '["team"]' };
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  assert.equal(deps.peers.length, 0);
  ctx.ready();
  assert.equal(deps.peers.length, 1);
  assert.equal(ctx.tool.name, "sessionbus");
  const skill = ctx.registeredSkills.get("sessionbus");
  assert.equal(skill.name, "sessionbus");
  assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true });
  assert.equal(skill.source, "runtime");
  assert.match(skill.content, /`list` returns `self_info`/u);
  assert.match(skill.content, /There is no `summary` field/u);
  assert.match(skill.content, /## Delivery dispositions/u);
  assert.match(skill.content, /## Collect and acknowledge runs/u);
  assert.match(skill.content, /## Choose independent lane policies/u);
  assert.match(skill.content, /Fresh lanes default to `persistent:false` and `auto_close_ms:60000`/u);
  assert.match(skill.content, /Fresh lanes and interactive sessions wake on an idle message; there is no\s+opt-out/u);
  assert.match(skill.content, /## Trace direct children/u);
  assert.match(skill.content, /copy its `from` attribute exactly as the send `target`/u);
  assert.equal(ctx.command.name, "sessionbus-groups");
  assert.deepEqual(deps.peers[0].identity, { product: "dashi", session_id: one.id, name: "Original", groups: ["team"], info: { cwd: "/workspace", model: "provider/default" } });
  assert.deepEqual(await ctx.tool.execute({ action: "start", arguments: { session_id: "target", input: "go" } }, { agent: one }), { action: "start", request: { session_id: "target", input: "go" } });
  ctx.emit("session/event", one.session, { type: "session/title", data: { title: "Renamed" } });
  await Promise.resolve();
  assert.deepEqual(deps.peers[0].rehelloed, { name: "Renamed", info: { cwd: "/workspace", model: "provider/default" } });
  ctx.emit("session/event", one.session, { type: "session/title", data: { title: "" } });
  await runtime.peers.get(one).rehello;
  assert.deepEqual(deps.peers[0].rehelloed, { name: undefined, info: { cwd: "/workspace", model: "provider/default" } });
  assert.equal(Object.hasOwn(deps.peers[0].identity, "name"), false);
  ctx.emit("agent/disposed", { agent: one });
  assert.equal(deps.peers[0].stopped, true);
  const created = agent(ctx, "session-two");
  ctx.emit("agent/created", { agent: created });
  assert.equal(deps.peers.at(-1).identity.session_id, created.id);
  runtime.close();
  assert.equal(ctx.registeredSkills.has("sessionbus"), false);
});

test("web session creation publishes its root through the global lifecycle", async () => {
  const ctx = new Context();
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_SOCKET: "/run/sessionbus.sock", SESSIONBUS_GROUPS: '["web-proof"]' };
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  const created = agent(ctx, "session-web");
  ctx.emitGlobal("agent/created", { agent: created });
  assert.deepEqual(deps.peers.map(({ identity }) => identity), [{
    product: "dsh", session_id: "session-web", groups: ["web-proof"],
    info: { cwd: "/workspace", model: "provider/default" },
  }]);
  ctx.emitGlobal("session/event", created.session, { type: "session/title", data: { title: "Web title" } });
  await runtime.peers.get(created).rehello;
  assert.equal(deps.peers[0].identity.name, "Web title");
  ctx.emitGlobal("agent/disposed", { agent: created });
  assert.equal(deps.peers[0].stopped, true);
  runtime.close();
});

test("opt-in trace reports readiness, global lifecycle, and present gates", () => {
  const ctx = new Context();
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_DSH_TRACE: "1", SESSIONBUS_SOCKET: "/run/sessionbus.sock" };
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  ctx.ready();
  const child = agent(ctx, "session-child");
  ctx.roots.pop();
  ctx.emitGlobal("agent/created", { agent: child });
  const root = agent(ctx, "session-root");
  ctx.emitGlobal("agent/created", { agent: root });
  ctx.emitGlobal("agent/created", { agent: root });
  ctx.emitGlobal("agent/disposed", { agent: root });
  runtime.close();
  assert.deepEqual(deps.errors, [
    "sessionbus trace: mode=peer ready=false socket=/run/sessionbus.sock\n",
    "sessionbus trace: mode=peer ready=true\n",
    "sessionbus trace: agent/created id=session-child scope=global\n",
    "sessionbus trace: present id=session-child root=false reason=not-root\n",
    "sessionbus trace: agent/created id=session-root scope=global\n",
    "sessionbus trace: present id=session-root root=true reason=publish\n",
    "sessionbus trace: agent/created id=session-root scope=global\n",
    "sessionbus trace: present id=session-root root=true reason=published\n",
    "sessionbus trace: agent/disposed id=session-root scope=global\n",
    "sessionbus trace: mode=peer ready=false reason=close\n",
  ]);
});

test("peer waits for a native session id and replaces it atomically when it changes", async () => {
  const ctx = new Context();
  const one = agent(ctx, "session-one");
  const session = one.session;
  one.session = undefined;
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_SOCKET: "/run/sessionbus.sock", SESSIONBUS_GROUPS: '["team"]' };
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  assert.equal(deps.peers.length, 0);
  assert.deepEqual(deps.errors, []);
  one.session = session;
  ctx.emit("agent/created", { agent: one });
  assert.equal(deps.peers.length, 1);
  one.session.id = "session-authoritative";
  ctx.emit("session/event", one.session, { type: "session/title", data: { title: "Bound" } });
  await runtime.peers.get(one).rehello;
  assert.deepEqual(deps.peers[0].replaced, {
    product: "dashi", session_id: "session-authoritative", name: "Bound", groups: ["team"], info: { cwd: "/workspace", model: "provider/default" },
  });
  runtime.close();
});

test("disable then enable leaves one connection and one registration", () => {
  const ctx = new Context();
  agent(ctx, "session-one");
  const first = dependencies(ctx);
  createRuntime(ctx, { product: "dashi" }, first);
  ctx.ready();
  assert.equal(first.peers.length, 1);
  ctx.dispose();
  assert.equal(first.peers[0].stopped, true);
  assert.equal(ctx.tool, undefined);
  assert.equal(ctx.command, undefined);

  const second = dependencies(ctx);
  const runtime = createRuntime(ctx, { product: "dashi" }, second);
  ctx.ready();
  ctx.emit("agent/created", { agent: ctx.roots[0] });
  assert.equal(second.peers.length, 1);
  assert.notEqual(second.peers[0], first.peers[0]);
  runtime.close();
});

test("peer title re-hellos are serialized and finish on the newest title", async () => {
  const ctx = new Context();
  const one = agent(ctx, "session-one");
  const deps = dependencies(ctx);
  deps.ambient = { SESSIONBUS_SOCKET: "/run/sessionbus.sock" };
  const acknowledgements = [deferred(), deferred()];
  const titles = [];
  deps.connectPeer = (identity) => ({
    identity,
    caller: deps.workerCaller,
    shutdown() {},
    async rehello(signal, name, info) {
      assert.equal(signal, undefined);
      const position = titles.push(name) - 1;
      await acknowledgements[position].promise;
      this.identity = { ...this.identity, name, info };
    },
  });
  const runtime = createRuntime(ctx, { product: "dashi" }, deps);
  ctx.ready();
  ctx.emit("session/event", one.session, { type: "session/title", data: { title: "First" } });
  ctx.emit("session/event", one.session, { type: "session/title", data: { title: "Newest" } });
  await Promise.resolve();
  assert.deepEqual(titles, ["First"]);
  acknowledgements[1].resolve();
  acknowledgements[0].resolve();
  await runtime.peers.get(one).rehello;
  assert.deepEqual(titles, ["First", "Newest"]);
  assert.equal(runtime.peers.get(one).peer.identity.name, "Newest");
});

test("native tool arguments expose the exact closed MCP union", () => {
  const ctx = new Context();
  createRuntime(ctx, { product: "dashi" }, dependencies(ctx));
  assert.deepEqual(ACTIONS, ["list", "send", "spawn", "describe", "trace", "run", "start", "wait", "status", "interrupt", "close", "forget", "ack"]);
  assert.match(ctx.tool.description, /trace mode off, events or content/u);
  assert.match(ctx.tool.description, /Read the sessionbus skill/u);
  assert.deepEqual(ctx.tool.parameters, {
    action: { type: "string", enum: ACTIONS, required: true },
    arguments: {
      type: "object", additionalProperties: false,
      description: "Use only the fields listed for the selected action in the tool description. send has no summary field; put the complete content in message.",
      properties: {
        session_id: { type: "string" }, host: { type: "string" }, message: { type: "string" },
        target: { type: "string" }, group: { type: "string" }, product: { type: "string" },
        name: { type: "string" }, resume_session_id: { type: "string" }, notify_target: { type: "string" },
        input: { type: "string" }, run_id: { type: "string" },
        targets: { type: "array", items: { type: "string" } },
        extra_groups: { type: "array", items: { type: "string" } },
        persistent: { type: "boolean" }, notify: { type: "boolean" }, forget: { type: "boolean" },
        auto_close_ms: { type: "integer" }, timeout_ms: { type: "integer" },
        trace: { type: "string", enum: ["off", "events", "content"] },
        mode: { type: "string", enum: ["off", "events", "content"] },
        open: {
          type: "object", additionalProperties: false,
          properties: {
            cwd: { type: "string" }, permission_mode: { type: "string" }, model: { type: "string" },
            reasoning_effort: { type: "string" }, arguments: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  });
  ctx.dispose();
});

test("native permission hook grants only sessionbus and delegates every other tool to native policy", async () => {
  const ctx = new Context();
  createRuntime(ctx, { product: "dashi" }, dependencies(ctx));
  const removeDummy = ctx.tools.register({ name: "w081_dummy" });
  const removeAsk = ctx.on("tools/pre-execute", async () => ({ kind: "ask", reason: "test ask-all" }));
  const handlers = ctx.listeners.get("tools/pre-execute");
  const decide = (execution, index = 0) => handlers[index](execution,
    () => index + 1 < handlers.length ? decide(execution, index + 1) : Promise.resolve({ kind: "allow" }));
  assert.deepEqual(await decide({ name: "sessionbus" }), { kind: "allow" });
  assert.deepEqual(await decide({ name: "w081_dummy" }), { kind: "ask", reason: "test ask-all" });
  assert.equal(ctx.registeredTools.get("w081_dummy").name, "w081_dummy");
  removeAsk();
  removeDummy();
  ctx.dispose();
  assert.deepEqual(ctx.listeners.get("tools/pre-execute"), []);
});

test("an unavailable native permission hook fails before tool registration", () => {
  const ctx = new Context();
  const on = ctx.on.bind(ctx);
  ctx.on = (event, ...args) => {
    if (event === "tools/pre-execute") throw new Error("hook unavailable");
    return on(event, ...args);
  };
  assert.throws(() => createRuntime(ctx, { product: "dashi" }, dependencies(ctx)),
    /cannot grant sessionbus tool permission: hook unavailable/u);
  assert.equal(ctx.tool, undefined);
});

for (const mode of ["peer", "lane"]) {
  test(`native tool accepts known arguments and rejects unknown keys before ${mode} action`, async () => {
    const { ctx, native, deps, runtime } = mode === "lane" ? await openedLane() : (() => {
      const ctx = new Context();
      const native = agent(ctx);
      const deps = dependencies(ctx);
      const runtime = createRuntime(ctx, { product: "dashi" }, deps);
      ctx.ready();
      return { ctx, native, deps, runtime };
    })();
    const forwarded = [];
    const client = mode === "lane" ? deps.workerCaller : deps.peers[0].caller;
    client.action = (action, args) => { forwarded.push({ action, args }); return "accepted"; };
    const requests = [
      ["list", {}], ["list", { session_id: "self" }], ["list", { host: "host" }],
      ["send", { target: "recipient", message: "Complete message" }],
      ["send", { targets: ["one", "two"], message: "Complete message" }],
      ["send", { group: "team", host: "host", message: "Complete message" }],
      ["spawn", { product: "dashi", name: "worker", extra_groups: ["team"], persistent: true, notify: false, notify_target: "owner", auto_close_ms: 0, trace: "events", open: { cwd: "/workspace", permission_mode: "ask", model: "model", reasoning_effort: "high", arguments: ["--flag"] } }],
      ["spawn", { resume_session_id: "previous", trace: "off" }],
      ["trace", { session_id: "worker", mode: "content" }],
      ["run", { session_id: "worker", input: "go" }],
      ["wait", { session_id: "worker", run_id: "run", timeout_ms: 0 }],
      ["close", { session_id: "worker", forget: true }],
    ];
    for (const [action, args] of requests) {
      assert.equal(await ctx.tool.execute({ action, arguments: args }, { agent: native }), "accepted");
      assert.deepEqual(forwarded.at(-1), { action, args });
      assert.equal(forwarded.at(-1).args, args);
    }
    assert.equal(new Set(requests.flatMap(([, args]) => Object.keys(args))).size, 21);
    for (const [args, message] of [
      [{ target: "recipient", message: "Complete message", summary: "extra" }, /arguments\.summary is not supported/],
      [{ unexpected: true }, /arguments\.unexpected is not supported/],
      [{ open: { cwd: "/workspace", summary: "extra" } }, /arguments\.open\.summary is not supported/],
      [{ open: [] }, /arguments\.open must be an object/],
      [[], /arguments must be an object/],
    ]) {
      assert.throws(() => ctx.tool.execute({ action: "send", arguments: args }, { agent: native }), message);
      assert.equal(forwarded.length, requests.length);
    }
    runtime.close();
  });
}

test("worker boot failure reports once and exits one before admission", async () => {
  const ctx = new Context();
  const { deps, runtime } = lane(ctx);
  deps.failWorker(new Error("bad\0boot\nline"));
  await runtime.workerExit;
  assert.deepEqual(deps.errors, ["sessionbus: bad boot line\n"]);
  assert.deepEqual(ctx.exits, [1]);
});
