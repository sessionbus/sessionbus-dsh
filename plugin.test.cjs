"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const { format } = require("node:util");
const { connectPeer, serveWorker } = require("@sessionbus/kit");
const { ACTIONS, activate, apply, createRuntime, inject, settings, terminal } = require("./plugin.cjs");
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
    this.logs = [];
    this.logArguments = [];
    this.loggers = [];
    this.logger = (name) => {
      const logger = Object.fromEntries(["warn", "error", "debug"].map(level =>
        [level, (...args) => {
          this.logArguments.push(args);
          this.logs.push({ name, level, message: format(...args) });
        }]));
      this.loggers.push(logger);
      return logger;
    };
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
    const ready = new Set();
    let committed = false;
    this.ready = () => { if (committed) return; committed = true; for (const call of [...ready]) call(); ready.clear(); };
    this.appReady = { onReady: (call) => { if (committed) call(); else ready.add(call); return () => ready.delete(call); } };
    this.appExit = (code) => { this.exits.push(code); };
    this.sessionTitle = { get: (session) => this.titles.get(session) };
    this.permissionPresets = { names: ["ask", "never"], set: (session, preset) => this.calls.push(["permission", session.id, preset]) };
    this.sessions = { flush: async (session) => { this.calls.push(["flush", session.id]); } };
    this.llm = { resolveCallConfig: async (request, signal) => {
      signal?.throwIfAborted();
      this.calls.push(["validate", request]);
      if (request.reasoningEffort === "invalid") throw Object.assign(new Error("unsupported effort invalid"), { code: "UNSUPPORTED_REASONING_EFFORT" });
      return { ...request };
    } };
    this.agentDefaultModel = { currentSelection: () => ({ provider: "provider", model: "default" }) };
    this.sessionController = {
      agents: {
        selectionFor: (agent) => agent.selection,
        serializeImageAdmission: async (_agent, operation) => operation(),
        selectForNextRequest: (agent, selection) => { agent.selection.current = { ...selection }; this.calls.push(["selection", agent.id, selection]); },
      },
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
  get(name) { return this[name]; }
  inject(names, callback) {
    const parent = this;
    let child, service;
    const scope = {
      uid: 1,
      async refresh() {
        if (scope.uid === null) return;
        const present = names.every(name => parent[name] !== undefined);
        const current = present ? parent[names[0]] : undefined;
        if (child && service === current) return;
        if (child) { child.fiber.uid = null; await child.dispose(); child = undefined; }
        if (!present || scope.uid === null) return;
        service = current;
        child = Object.create(parent);
        child.fiber = { uid: 1 }; child.effects = new Set();
        child.dispose = () => Promise.all([...child.effects].reverse().map(dispose => dispose()));
        for (const name of names) Object.defineProperty(child, name, { value: parent[name] });
        callback(child);
      },
      async dispose() { scope.uid = null; if (child) { child.fiber.uid = null; await child.dispose(); } },
    };
    this.scopes ??= []; this.scopes.push(scope);
    this.effect(() => () => scope.dispose());
    void scope.refresh();
    return scope;
  }
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
  assert.deepEqual(ctx.logs, []);
  assert.deepEqual(ctx.exits, []);
  assert.equal(ctx.tool, undefined);
  assert.equal(ctx.command, undefined);
});

test("a row without product fails once with the installer fix", () => {
  const ctx = new Context();
  const output = [];
  apply(ctx, {}, { stderr: (line) => output.push(line) });
  assert.deepEqual(output, ["sessionbus: product is required; re-run sessionbus-dsh-install --product <name> <profile>\n"]);
  assert.deepEqual(ctx.logs, [{ name: "sessionbus-dsh", level: "error",
    message: "sessionbus: product is required; re-run sessionbus-dsh-install --product <name> <profile>" }]);
  assert.deepEqual(ctx.exits, [1]);
  assert.equal(ctx.tool, undefined);
});

test("W-150 registered tool and skill bytes stay pinned to published 0.1.4", async () => {
  const { prefix } = JSON.parse(fs.readFileSync(path.join(__dirname, ".github/fixtures/model-prefix-0.1.4.json"), "utf8"));
  for (const product of ["dsh", "dashi", "sessionbus-dsh"]) {
    const ctx = new Context(), root = agent(ctx, "prefix-" + product), deps = dependencies(ctx);
    if (product === "sessionbus-dsh") deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "synthetic-prefix-token" };
    const runtime = createRuntime(ctx, { product, groups: ["prefix-team"] }, deps);
    const check = () => {
      const tools = [...ctx.registeredTools.values()];
      assert.equal(tools.length, 1, "the published model-facing tool set contains exactly one Sessionbus definition");
      for (const [name, bytes] of Object.entries({
        rawTool: JSON.stringify(tools[0]),
        skill: JSON.stringify(ctx.registeredSkills.get("sessionbus")),
        skillText: ctx.registeredSkills.get("sessionbus").content,
      })) {
        assert.equal(Buffer.byteLength(bytes), prefix[name].bytes, name + ": published 0.1.4 model-prefix length changed");
        assert.equal(createHash("sha256").update(bytes).digest("hex"), prefix[name].sha256,
          name + ": published 0.1.4 model-prefix bytes changed; review deliberately, never refresh this golden silently");
      }
    };
    try {
      check(); ctx.ready(); check();
      if (product !== "sessionbus-dsh") {
        await ctx.command.handler({ agent: root, rawInput: "changed-group", signal: new AbortController().signal });
        ctx.emit("session/event", root.session, { type: "session/title", data: { title: "Changed identity" } });
        await runtime.peers.get(root).rehello; check();
      }
    } finally { await ctx.dispose(); }
  }
});

test("W-150 a peer applies without reading or waiting for a controller", async () => {
  assert.equal(inject.includes("sessionController"), false, "peer service metadata must not gate activation");
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  root.steer = message => ctx.emit("session/event", root.session,
    { type: "agent/inbox/spliced", data: { inserted: [message] } });
  Object.defineProperty(ctx, "sessionController", { get() { throw new Error("peer controller read"); } });
  ctx.inject = () => { throw new Error("peer created a controller scope"); };
  apply(ctx, { product: "dsh" }, deps);
  await new Promise(setImmediate);
  ctx.ready();
  assert.deepEqual(ctx.exits, []);
  assert.equal(deps.peers.length, 1);
  assert.equal(deps.peers[0].identity.session_id, root.id);
  assert.deepEqual(await deps.peers[0].deliver(null, delivery("without a controller")), { disposition: "injected" });
  assert.deepEqual(await ctx.command.handler({ agent: root, rawInput: "" }), { kind: "success", text: "[]" });
  await ctx.dispose();
  assert.equal(deps.peers[0].stopped, true);
});

test("W-150 a missing lane controller fails at readiness once and cannot appear late", async () => {
  const ctx = new Context(), deps = dependencies(ctx);
  delete ctx.sessionController;
  deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token" };
  apply(ctx, { product: "sessionbus-dsh" }, deps);
  await new Promise(setImmediate);
  assert.equal(deps.worker, undefined);
  assert.deepEqual(ctx.exits, []);
  ctx.ready(); ctx.ready();
  assert.deepEqual(ctx.exits, [1]);
  assert.equal(deps.errors.length, 1);
  assert.match(deps.errors[0], /^sessionbus: .*sessionController.*readiness.*\n$/u);
  assert.deepEqual(ctx.logs, [], "lane diagnostics retain their existing daemon-owned stderr sink");
  ctx.sessionController = new Context().sessionController;
  for (const scope of ctx.scopes ?? []) await scope.refresh();
  await new Promise(setImmediate);
  assert.equal(deps.worker, undefined);
  await ctx.dispose();
});

test("W-150 a lane accepts a controller arriving before readiness", async () => {
  const ctx = new Context(), controller = ctx.sessionController, deps = dependencies(ctx);
  delete ctx.sessionController; deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token" };
  apply(ctx, { product: "sessionbus-dsh" }, deps);
  ctx.sessionController = controller;
  for (const scope of ctx.scopes ?? []) await scope.refresh();
  await new Promise(setImmediate);
  ctx.ready();
  assert.ok(deps.worker);
  assert.deepEqual(ctx.exits, []);
  await ctx.dispose();
  assert.equal(deps.workerStopped, true);
});

test("W-150 disposal before lane readiness creates no worker or diagnostic", async () => {
  const ctx = new Context(), deps = dependencies(ctx);
  delete ctx.sessionController; deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token" };
  apply(ctx, { product: "sessionbus-dsh" }, deps);
  ctx.fiber.uid = null; await ctx.dispose(); ctx.ready();
  assert.equal(deps.worker, undefined);
  assert.deepEqual(ctx.exits, []); assert.deepEqual(deps.errors, []);
});

test("W-150 a throwing readiness lookup cancels lane activation during imports", async () => {
  const ctx = new Context(), deps = dependencies(ctx), imported = deferred();
  const get = ctx.get.bind(ctx);
  ctx.get = name => { if (name === "sessionController") throw new Error("controller lookup failed"); return get(name); };
  deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token" };
  deps.createUserMessage = undefined;
  deps.importLLM = () => imported.promise;
  apply(ctx, { product: "sessionbus-dsh" }, deps);
  ctx.ready();
  assert.deepEqual(ctx.exits, [1]);
  assert.deepEqual(deps.errors, ["sessionbus: controller lookup failed\n"]);
  imported.resolve({ createUserMessage: value => value });
  await new Promise(setImmediate);
  assert.equal(deps.worker, undefined);
  await ctx.dispose();
});

test("W-150 an already-ready host refuses a missing lane controller synchronously", async () => {
  const ctx = new Context(), deps = dependencies(ctx);
  delete ctx.sessionController; deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token" };
  ctx.ready();
  apply(ctx, { product: "sessionbus-dsh" }, deps);
  assert.deepEqual(ctx.exits, [1]); assert.equal(deps.errors.length, 1);
  ctx.sessionController = new Context().sessionController;
  for (const scope of ctx.scopes ?? []) await scope.refresh();
  await new Promise(setImmediate);
  assert.equal(deps.worker, undefined);
  await ctx.dispose();
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

for (const isTTY of [true, false]) {
test(`W-146 peer diagnostics preserve ${isTTY ? "terminal silence" : "service stderr"} and always log`, async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: isTTY });
  t.after(() => { if (descriptor) Object.defineProperty(process.stderr, "isTTY", descriptor); else delete process.stderr.isTTY; });
  const output = [];
  t.mock.method(process.stderr, "write", (line) => { output.push(line); return true; });
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    t.mock.method(console, method, (...args) => output.push([method, ...args]));
  }
  for (const cause of ["configuration", "capture", "activation", "publication", "terminal", "title", "groups", "trace"]) {
    await t.test(cause, async () => {
      output.length = 0;
      const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
      deps.stderr = (line) => process.stderr.write(line);
      let runtime;
      try {
        if (cause === "configuration") apply(ctx, {}, deps);
        else if (cause === "capture") { ctx.on = undefined; apply(ctx, { product: "dashi" }, deps); }
        else if (cause === "activation") {
          apply(ctx, { product: "dashi" }, {
            ...deps, createUserMessage: undefined, importLLM: async () => { throw new Error("activation failed"); },
          });
          await new Promise(setImmediate);
        } else {
          if (cause === "publication") root.session.header.cwd = "";
          if (cause === "trace") deps.ambient.SESSIONBUS_DSH_TRACE = "1";
          if (cause === "groups") {
            const connect = deps.connectPeer;
            deps.connectPeer = (...args) => {
              const peer = connect(...args);
              if (deps.peers.length > 1) peer.caller.list = async () => { throw new Error("not connected"); };
              return peer;
            };
          }
          runtime = await activate(ctx, { product: "dashi" }, deps);
          ctx.ready();
          if (cause === "terminal") runtime.peers.get(root).peer.finish(new Error("invalid hello"));
          if (cause === "title") {
            runtime.peers.get(root).peer.rehello = async () => { throw new Error("title failed"); };
            ctx.emitGlobal("session/event", root.session, { type: "session/title", data: { title: "New" } });
            await runtime.peers.get(root).rehello;
          }
          if (cause === "groups") {
            const progress = await ctx.command.handler({ agent: root, rawInput: "after", signal: AbortSignal.timeout(5000) });
            assert.match(progress.text, /^change in progress/u);
            deps.peers[1].finish(new Error("groups failed"));
            await new Promise(setImmediate);
          }
          await new Promise(setImmediate);
          await runtime.close();
          runtime = undefined;
        }
        assert.ok(ctx.logs.length > 0, `${cause}: diagnostic lost instead of logged`);
        const fatal = ["configuration", "capture", "activation"].includes(cause);
        const messages = ctx.logs.map(record => `${record.message}\n`);
        const reasons = {
          publication: "sessionbus: DSH root identity is incomplete\n",
          terminal: "sessionbus: invalid hello\n",
          title: "sessionbus: title failed\n",
          groups: "sessionbus: groups failed\n",
        };
        if (cause !== "trace" && !fatal) assert.deepEqual(messages, [reasons[cause]], "unchanged 0.1.3 reason");
        assert.deepEqual(output, !isTTY || fatal ? messages : [],
          `${cause}: fatal stderr always; non-fatal stderr only when not a terminal; no console`);
        assert.equal(ctx.logs.every(record => record.name === "sessionbus-dsh"), true);
        assert.equal(ctx.logs.every(record => record.level === (cause === "trace" ? "debug" : "error")), true);
        assert.equal(ctx.loggers.every(logger => logger.level === (cause === "trace" ? 3 : undefined)), true,
          "trace off leaves the host's logger level untouched");
        if (["configuration", "capture", "activation"].includes(cause)) assert.deepEqual(ctx.exits, [1]);
      } finally { await runtime?.close(); await ctx.dispose(); }
    });
  }
});
}

test("W-146 launch mode is read once before invalid configuration, lane stderr unchanged", (t) => {
  const output = [];
  t.mock.method(process.stderr, "write", (line) => { output.push(line); return true; });
  for (const mode of ["peer", "lane"]) {
    const ctx = new Context();
    let reads = 0;
    ctx.launchEnvironment = { get: (key) => {
      if (key !== "SESSIONBUS_LAUNCH_TOKEN") return undefined;
      reads++;
      return mode === "lane" ? { value: "test-launch-token" } : undefined;
    } };
    apply(ctx, {});
    assert.equal(reads, 1, `${mode}: determine mode before validating product`);
    assert.deepEqual(ctx.exits, [1]);
    assert.equal(ctx.logs.length, mode === "peer" ? 1 : 0);
  }
  assert.deepEqual(output, [
    "sessionbus: product is required; re-run sessionbus-dsh-install --product <name> <profile>\n",
    "sessionbus: product is required; re-run sessionbus-dsh-install --product <name> <profile>\n",
  ]);
});

test("W-146 trace off preserves explicit host logger levels", () => {
  for (const level of [0, 1, 2, 3]) {
    const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
    const logger = ctx.logger;
    ctx.logger = name => Object.assign(logger(name), { level });
    root.session.header.cwd = "";
    const runtime = createRuntime(ctx, { product: "dashi" }, deps);
    ctx.ready();
    assert.equal(ctx.loggers.every(facade => facade.level === level), true);
    assert.equal(ctx.logs[0].level, "error");
    runtime.close();
  }
});

test("W-146 diagnostic text is an argument, never a logger format string", async () => {
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  const reason = "daemon %s %d %% /path/%s";
  const runtime = await activate(ctx, { product: "dashi" }, deps);
  try {
    ctx.ready();
    deps.peers[0].finish(new Error(reason));
    await new Promise(setImmediate);
    assert.deepEqual(ctx.logArguments, [["%s", `sessionbus: ${reason}`]]);
    assert.equal(ctx.logs[0].message, `sessionbus: ${reason}`);
  } finally { await runtime.close(); }
});

test("W-146 apply carries the logger through capture into a running peer", async (t) => {
  const output = [];
  t.mock.method(process.stderr, "write", line => { output.push(line); return true; });
  const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
  deps.stderr = line => process.stderr.write(line);
  root.steer = message => ctx.emit("session/event", root.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
  apply(ctx, { product: "dashi" }, deps);
  try {
    await new Promise(setImmediate);
    assert.deepEqual(ctx.exits, [], "captured context must start, not fail activation");
    assert.equal(typeof ctx.ready, "function");
    ctx.ready();
    assert.equal(deps.peers.length, 1);
    const receipt = await deps.peers[0].deliver(null, delivery("captured peer delivery"));
    assert.equal(receipt.disposition, "injected");
    deps.peers[0].finish(new Error("captured-context diagnostic"));
    await new Promise(setImmediate);
    assert.deepEqual(ctx.logs.map(record => record.message), ["sessionbus: captured-context diagnostic"]);
    assert.deepEqual(output, process.stderr.isTTY === true ? [] : ["sessionbus: captured-context diagnostic\n"]);
    assert.deepEqual(ctx.exits, []);
    assert.equal(root.session.id, "session-fresh");
  } finally { await ctx.dispose(); }
});

test("W-146 capture first preserves startup without a live launch-environment service", async () => {
  const ctx = new Context(), deps = dependencies(ctx);
  agent(ctx);
  Object.defineProperty(ctx, "launchEnvironment", { get() { throw new Error("service unavailable"); } });
  ctx.get = () => undefined;
  apply(ctx, { product: "dashi" }, deps);
  try {
    await new Promise(setImmediate);
    assert.deepEqual(ctx.exits, []);
    assert.deepEqual(deps.errors, []);
    assert.equal(typeof ctx.ready, "function");
    ctx.ready();
    assert.equal(deps.peers.length, 1);
    assert.deepEqual(ctx.logs, []);
  } finally { await ctx.dispose(); }
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
    selection: { current: { provider: "provider", model: "default" } },
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
    ["validate", { provider: "vendor", model: "model/name", reasoningEffort: "high" }],
    ["create", { cwd: "/other" }],
    ["rename", { sessionId: native.id, title: "parent/worker" }],
    ["validate", { provider: "vendor", model: "model/name", reasoningEffort: "high" }],
    ["selection", native.id, { provider: "vendor", model: "model/name", reasoningEffort: "high" }],
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
    assert.deepEqual(ctx.logs.map(record => record.message), ["sessionbus: invalid_hello"]);
    assert.deepEqual(deps.errors, process.stderr.isTTY === true ? [] : ["sessionbus: invalid_hello\n"]);
    const root = ctx.roots[0];
    ctx.emitGlobal("session/event", root.session, { type: "session/title", data: { title: "Now publish" } });
    const admitted = runtime.peers.get(root).peer;
    assert.notEqual(admitted, rejected);
    await admitted.ready;
    assert.equal(attempts, 2);
    assert.deepEqual(ctx.logs.map(record => record.message), ["sessionbus: invalid_hello"]);
    assert.deepEqual(deps.errors, process.stderr.isTTY === true ? [] : ["sessionbus: invalid_hello\n"]);
  } finally {
    runtime.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

for (const isTTY of [true, false]) {
test(`W-146 socket retries log once per outage with ${isTTY ? "terminal" : "service"} stderr`, async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: isTTY });
  t.after(() => { if (descriptor) Object.defineProperty(process.stderr, "isTTY", descriptor); else delete process.stderr.isTTY; });
  const output = [];
  t.mock.method(process.stderr, "write", (line) => { output.push(line); return true; });
  const malformed = new Context();
  const badRoot = agent(malformed, "session-incomplete");
  badRoot.session.header.cwd = "";
  const badDeps = dependencies(malformed);
  badDeps.ambient = { SESSIONBUS_SOCKET: "/run/sessionbus.sock" };
  const malformedRuntime = createRuntime(malformed, { product: "dsh" }, badDeps);
  malformed.ready();
  malformedRuntime.close();
  output.length = 0;

  const ctx = new Context();
  const root = agent(ctx, "session-connect");
  const deps = dependencies(ctx);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-reconnect-"));
  const socket = path.join(directory, "presence.sock");
  const scheduled = [];
  deps.ambient = { SESSIONBUS_SOCKET: socket };
  deps.connectPeer = connectPeer;
  deps.schedule = (call, delay) => { assert.equal(delay, 2000); scheduled.push(call); };
  deps.stderr = (line) => process.stderr.write(line);
  const runtime = createRuntime(ctx, { product: "dsh" }, deps);
  let server;
  const streams = new Set();
  const show = () => ctx.command.handler({ agent: root, rawInput: "", signal: new AbortController().signal });
  try {
    ctx.ready();
    const peer = runtime.peers.get(root).peer;
    const calls = t.mock.method(peer.caller, "list", () => { throw new Error("show must not call the bus"); });
    const held = deferred();
    t.after(() => held.resolve());
    while (scheduled.length === 0) await new Promise(setImmediate);
    assert.deepEqual(output, isTTY ? [] : [`${ctx.logs[0].message}\n`], "connection stderr follows the stream's own TTY state");
    runtime.peers.get(root).rehello = held.promise;
    const failed = await show();
    assert.match(failed.text, /^\[\]\nLast connection attempt failed; sessionbus is not connected: connect ENOENT /u);
    scheduled.shift()();
    while (scheduled.length === 0) await new Promise(setImmediate);
    assert.equal(runtime.peers.get(root).peer, peer);
    assert.equal(ctx.logs.length, 1);
    assert.equal(output.length, isTTY ? 0 : 1, "several retries produce only one service line");
    assert.equal(ctx.logs[0].level, "error", "socket outage must survive the host's default logger level");
    assert.match(ctx.logs[0].message, /^sessionbus: connect ENOENT /u);
    assert.deepEqual(await show(), failed);

    const admitted = deferred();
    server = net.createServer((stream) => {
      streams.add(stream);
      stream.on("close", () => streams.delete(stream));
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
    assert.equal(ctx.logs.length, 1);
    assert.deepEqual(await show(), { kind: "success", text: "[]" });
    for (const stream of streams) stream.destroy();
    await new Promise((resolve) => server.close(resolve));
    while (scheduled.length === 0) await new Promise(setImmediate);
    scheduled.shift()();
    while (scheduled.length === 0) await new Promise(setImmediate);
    assert.equal(ctx.logs.length, 2, "the same failure is logged again after transport recovery");
    assert.equal(output.length, isTTY ? 0 : 2, "a recovered session's second outage produces one more line");
    assert.deepEqual(await show(), failed);
    fs.mkdirSync(socket);
    scheduled.shift()();
    while (scheduled.length === 0) await new Promise(setImmediate);
    assert.equal(ctx.logs.length, 3, "a different failed-attempt state is recorded");
    assert.notEqual((await show()).text, failed.text);
    assert.equal(calls.mock.callCount(), 0);
    held.resolve();
    await runtime.close();
    scheduled.shift()();
    await new Promise(setImmediate);
    assert.equal(ctx.logs.length, 3, "shutdown does not schedule a new publication or log stale errors");
    assert.deepEqual(output, isTTY ? [] : ctx.logs.map(record => `${record.message}\n`));
    assert.deepEqual(malformed.logs.map(record => record.message), ["sessionbus: DSH root identity is incomplete"]);
    assert.deepEqual(badDeps.errors, isTTY ? [] : ["sessionbus: DSH root identity is incomplete\n"]);
  } finally {
    await runtime.close();
    for (const stream of streams) stream.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
}

test("W-146 socket errors from disposed and superseded roots are not logged", async (t) => {
  const output = [];
  t.mock.method(process.stderr, "write", line => { output.push(line); return true; });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sessionbus-dsh-stale-"));
  try {
    for (const cause of ["disposed", "superseded"]) {
      const ctx = new Context(), root = agent(ctx), deps = dependencies(ctx);
      const connect = deps.connectPeer;
      let attempt;
      deps.stderr = line => process.stderr.write(line);
      deps.connectPeer = (...args) => {
        attempt = () => args[3].connect(path.join(directory, "absent.sock"));
        return connect(...args);
      };
      const runtime = createRuntime(ctx, { product: "dsh" }, deps);
      try {
        ctx.ready();
        const stream = attempt();
        const ended = new Promise(resolve => stream.once("close", resolve));
        if (cause === "disposed") ctx.emitGlobal("agent/disposed", { agent: root });
        else runtime.peers.set(root, { peer: { shutdown() {} }, identity: { groups: ["new"] } });
        await ended;
        assert.deepEqual(ctx.logs, [], cause);
        assert.deepEqual(output, [], cause);
        if (cause === "superseded") {
          assert.deepEqual(await ctx.command.handler({ agent: root, rawInput: "", signal: AbortSignal.timeout(1000) }),
            { kind: "success", text: '["new"]' });
        }
      } finally { await runtime.close(); }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
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
  native.selection.current = { provider: "resumed", model: "selected", reasoningEffort: "high" };
  const { deps } = lane(ctx);
  assert.deepEqual(await deps.callbacks.open(null, { name: "resumed@host", groups: [], resume_session_id: native.id, open: { reasoning_effort: "low" } }), { session_id: native.id });
  assert.equal(ctx.calls.some(([call]) => call === "create"), false);
  assert.deepEqual(ctx.calls.find(([call]) => call === "selection"), ["selection", native.id, { provider: "resumed", model: "selected", reasoningEffort: "low" }]);
});

test("lane option selection never calls the profile-saving GUI API and another lane keeps defaults", async () => {
  const ctx = new Context(), first = agent(ctx);
  ctx.sessionController.selectModel = () => { throw new Error("profile-saving GUI API called"); };
  const { deps } = lane(ctx);
  await deps.callbacks.open(null, { name: "first", open: { model: "vendor/unadvertised", reasoning_effort: "high" } });
  assert.deepEqual(first.selection.current, { provider: "vendor", model: "unadvertised", reasoningEffort: "high" });
  await deps.callbacks.close();
  const second = agent(ctx, "second");
  ctx.sessionController.create = async () => ({ sessionId: second.id });
  await deps.callbacks.open(null, { name: "second", open: {} });
  assert.deepEqual(second.selection.current, { provider: "provider", model: "default" });
  await deps.callbacks.close();
});

test("model-only keeps adapter default effort out of the explicit session selection", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
  native.selection.current.reasoningEffort = "high";
  ctx.llm.resolveCallConfig = async request => ({ ...request, reasoningEffort: "adapter-default" });
  await deps.callbacks.open(null, { name: "model-only", open: { model: "vendor/new-model" } });
  assert.deepEqual(native.selection.current, { provider: "vendor", model: "new-model" });
});

test("invalid effort fails natively before commit and a later valid open still works", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
  await assert.rejects(deps.callbacks.open(null, { name: "invalid", open: { reasoning_effort: "invalid" } }), { code: "UNSUPPORTED_REASONING_EFFORT" });
  assert.deepEqual(native.selection.current, { provider: "provider", model: "default" });
  assert.equal(ctx.calls.some(([call]) => call === "model" || call === "selection"), false);
  await deps.callbacks.open(null, { name: "valid", open: { reasoning_effort: "low" } });
  assert.deepEqual(native.selection.current, { provider: "provider", model: "default", reasoningEffort: "low" });
});

test("no-option lanes do not read the optional resolver or private selector", async () => {
  const ctx = new Context(); agent(ctx);
  Object.defineProperty(ctx.sessionController, "agents", { get() { throw new Error("optional seam read"); } });
  delete ctx.llm;
  const { deps } = lane(ctx);
  assert.deepEqual(await deps.callbacks.open(null, { name: "defaults", open: {} }), { session_id: "session-fresh" });
});

test("missing selector methods fail with the resolved native version, never a GUI fallback", async t => {
  const load = Module._load;
  t.mock.method(Module, "_load", function (request, ...args) {
    return request === "@deepseek-ai/dsh-api-session-controller/package.json" ? { version: "0.2.1-alpha.2" } : load.call(this, request, ...args);
  });
  for (const missing of ["agents", "selectionFor", "selectForNextRequest", "serializeImageAdmission"]) {
    const ctx = new Context(); agent(ctx);
    if (missing === "agents") delete ctx.sessionController.agents;
    else delete ctx.sessionController.agents[missing];
    const { deps } = lane(ctx);
    await assert.rejects(deps.callbacks.open(null, { name: "missing", open: { reasoning_effort: "low" } }), /sessionController\.agents.*DSH.*0\.2\.1-alpha\.2/u);
    assert.equal(ctx.calls.some(([call]) => ["create", "rename", "model", "selection"].includes(call)), false);
  }
});

test("missing-seam diagnostics survive real unexported or invalid version metadata without leaking paths", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "w126-missing-version-"));
  return (async () => {
    try {
      fs.copyFileSync(path.join(__dirname, "plugin.cjs"), path.join(directory, "plugin.cjs"));
      fs.copyFileSync(path.join(__dirname, "package.json"), path.join(directory, "package.json"));
      fs.mkdirSync(path.join(directory, "skills"));
      fs.copyFileSync(path.join(__dirname, "skills/sessionbus.md"), path.join(directory, "skills/sessionbus.md"));
      fs.mkdirSync(path.join(directory, "node_modules/@sessionbus"), { recursive: true });
      fs.symlinkSync(fs.realpathSync(path.join(__dirname, "node_modules/@sessionbus/kit")), path.join(directory, "node_modules/@sessionbus/kit"));
      const { NativeSession } = require(path.join(directory, "plugin.cjs"));
      const dir = path.join(directory, "node_modules/@deepseek-ai/dsh-api-session-controller");
      fs.mkdirSync(dir, { recursive: true });
      // An owned unexported manifest shadows ancestors, even with TMPDIR under
      // a DSH installation. This tests real resolution, not physical absence.
      for (const metadata of [JSON.stringify({ name: "@deepseek-ai/dsh-api-session-controller", exports: { ".": "./index.js" } }), "{invalid}"]) {
        fs.writeFileSync(path.join(dir, "package.json"), metadata);
        const ctx = new Context(); agent(ctx); delete ctx.sessionController.agents;
        const native = new NativeSession(ctx);
        await assert.rejects(native.open({ name: "missing", open: { model: "vendor/model" } }), error => {
          assert.match(error.message, /sessionController\.agents missing selectionFor, selectForNextRequest, serializeImageAdmission on DSH unknown version/u);
          assert.equal(error.message.includes(directory), false);
          assert.equal(error.message.includes("Require stack"), false);
          return true;
        });
        assert.equal(ctx.calls.some(([call]) => ["create", "rename", "model", "selection"].includes(call)), false);
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  })();
});

test("unknown provider errors are relayed before session selection", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
  const failure = new Error('no adapter registered for provider "unknown"');
  ctx.llm.resolveCallConfig = async () => { throw failure; };
  await assert.rejects(deps.callbacks.open(null, { name: "unknown-provider", open: { model: "unknown/model" } }), error => error === failure);
  assert.deepEqual(native.selection.current, { provider: "provider", model: "default" });
  assert.equal(ctx.calls.some(([call]) => call === "selection" || call === "model"), false);
  assert.equal(ctx.calls.some(([call]) => call === "create"), false);
});

test("a permissive resolver accepts an unknown model at open; backend failure belongs to the first turn", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
  await deps.callbacks.open(null, { name: "mistyped", open: { model: "provider/mistyped" } });
  assert.deepEqual(native.selection.current, { provider: "provider", model: "mistyped" });
  let turns = 0;
  native.followup = message => {
    turns++;
    ctx.emit("session/event", native.session, { type: "agent/inbox/spliced", data: { inserted: [message] } });
    ctx.emit("session/event", native.session, { type: "turn/start", data: { turn: 1 } });
    ctx.emit("session/event", native.session, { type: "user/message", data: { ...message, turn: 1 } });
    ctx.emit("session/event", native.session, { type: "turn/end", data: { turn: 1, reason: { kind: "error", error: { code: "UNKNOWN", message: "backend rejected mistyped model at first request" } } } });
  };
  assert.deepEqual(await deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "probe" }), {
    outcome: "failed", native_stop_reason: "error", result: "UNKNOWN: backend rejected mistyped model at first request",
  });
  assert.equal(turns, 1);
});

test("malformed explicit model routes refuse before the resolver and selection", async () => {
  for (const model of ["provider", "/model", "provider/"]) {
    const ctx = new Context(); agent(ctx); const { deps } = lane(ctx);
    await assert.rejects(deps.callbacks.open(null, { name: "malformed", open: { model } }), { message: `unsupported value model=${model}` });
    assert.equal(ctx.calls.some(([call]) => ["validate", "selection", "model"].includes(call)), false);
  }
});

test("empty and non-string model or effort values have explicit field errors", async () => {
  for (const field of ["model", "reasoning_effort"]) for (const value of ["", null, 42, {}, []]) {
    const ctx = new Context(); agent(ctx); const { deps } = lane(ctx);
    await assert.rejects(deps.callbacks.open(null, { name: "wrong-shape", open: { [field]: value } }), new RegExp(`unsupported value ${field}: expected a non-empty string`, "u"));
    assert.equal(ctx.calls.some(([call]) => ["validate", "selection", "model"].includes(call)), false);
  }
});

test("a context without get retains no-option mount and open", async () => {
  const ctx = new Context(); agent(ctx); ctx.get = undefined;
  const deps = dependencies(ctx); deps.ambient = { SESSIONBUS_LAUNCH_TOKEN: "token" };
  apply(ctx, { product: "sessionbus-dsh" }, deps);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.exits.length, 0);
  ctx.ready();
  assert.deepEqual(await deps.callbacks.open(null, { name: "default", open: {} }), { session_id: "session-fresh" });
  await ctx.dispose();
});

test("an option requiring an absent LLM service fails only that open", async () => {
  const ctx = new Context(); agent(ctx); delete ctx.llm;
  const { deps } = lane(ctx);
  await assert.rejects(deps.callbacks.open(null, { name: "needs-validation", open: { model: "vendor/model" } }), /llm\.resolveCallConfig.*unavailable/u);
  await deps.callbacks.open(null, { name: "defaults", open: {} });
  assert.equal(ctx.calls.some(([call]) => call === "model" || call === "selection"), false);
});

test("open signal cancels native validation before commit, without replay", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx), cancellation = new AbortController();
  const failure = new Error("open cancelled"); let supplied;
  ctx.llm.resolveCallConfig = async (_request, signal) => { supplied = signal; cancellation.abort(failure); return { provider: "vendor", model: "model" }; };
  await assert.rejects(deps.callbacks.open(cancellation.signal, { name: "cancelled", open: { model: "vendor/model" } }), error => error === failure);
  assert.equal(supplied, cancellation.signal);
  assert.deepEqual(native.selection.current, { provider: "provider", model: "default" });
  assert.equal(ctx.calls.some(([call]) => call === "selection"), false);
  assert.equal(ctx.calls.some(([call]) => call === "create"), false);
});

test("session-independent refusals leave a fresh open uncreated", async () => {
  for (const open of [
    { model: "provider/model", reasoning_effort: "invalid" },
    { reasoning_effort: "invalid" }, { permission_mode: "invalid" },
    { model: "provider/" }, { model: null }, { reasoning_effort: "" },
  ]) {
    const ctx = new Context(); agent(ctx); const { deps } = lane(ctx);
    await assert.rejects(deps.callbacks.open(new AbortController().signal, { name: "refused", open }), /unsupported/u);
    assert.equal(ctx.calls.some(([call]) => ["create", "rename", "selection", "permission", "flush"].includes(call)), false);
  }
});

test("fresh effort checks default before create and current selection under serialization", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
  ctx.agentDefaultModel.currentSelection = () => ({ provider: "before", model: "default" });
  ctx.sessionController.create = async request => {
    ctx.calls.push(["create", request]);
    native.selection.current = { provider: "after", model: "changed" };
    return { sessionId: native.id };
  };
  await deps.callbacks.open(new AbortController().signal, { name: "two-moments", open: { reasoning_effort: "low" } });
  assert.deepEqual(ctx.calls.filter(([call]) => call === "validate").map(([, request]) => request), [
    { provider: "before", model: "default", reasoningEffort: "low" },
    { provider: "after", model: "changed", reasoningEffort: "low" },
  ]);
  assert.ok(ctx.calls.findIndex(([call]) => call === "validate") < ctx.calls.findIndex(([call]) => call === "create"));
  assert.deepEqual(native.selection.current, { provider: "after", model: "changed", reasoningEffort: "low" });
});

test("resume effort does not read the profile default or create", async () => {
  const ctx = new Context(), native = agent(ctx, "resumed"), { deps } = lane(ctx);
  ctx.agentDefaultModel.currentSelection = () => { throw new Error("profile default read on resume"); };
  await deps.callbacks.open(new AbortController().signal, { name: "resumed", resume_session_id: native.id, open: { reasoning_effort: "low" } });
  assert.equal(ctx.calls.filter(([call]) => call === "validate").length, 1);
  assert.equal(ctx.calls.some(([call]) => call === "create"), false);
});

test("a missing public default read refuses only fresh effort options before create", async () => {
  const ctx = new Context(); agent(ctx); delete ctx.agentDefaultModel; const { deps } = lane(ctx);
  await assert.rejects(deps.callbacks.open(new AbortController().signal, { name: "no-default-read", open: { reasoning_effort: "low" } }), /agentDefaultModel\.currentSelection.*unavailable/u);
  assert.equal(ctx.calls.some(([call]) => call === "create"), false);
  assert.deepEqual(await deps.callbacks.open(null, { name: "ordinary", open: {} }), { session_id: "session-fresh" });
});

test("a capability change between validation moments refuses commit without deleting the created session", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
  let validations = 0;
  const failure = new Error("capability changed after create");
  ctx.llm.resolveCallConfig = async request => { if (++validations === 2) throw failure; return request; };
  await assert.rejects(deps.callbacks.open(new AbortController().signal, { name: "window", open: { reasoning_effort: "high" } }), error => error === failure);
  assert.equal(ctx.calls.filter(([call]) => call === "create").length, 1);
  assert.equal(ctx.calls.some(([call]) => call === "selection"), false);
  assert.equal(ctx.byID.get(native.id), native);
});

test("effort-only reads the current selection after native serialization admits the operation", async () => {
  const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx), admission = deferred();
  ctx.sessionController.agents.serializeImageAdmission = async (_agent, operation) => { await admission.promise; return operation(); };
  const opening = deps.callbacks.open(null, { name: "serialized", open: { reasoning_effort: "low" } });
  native.selection.current = { provider: "later", model: "current", reasoningEffort: "high" };
  admission.resolve();
  await opening;
  assert.deepEqual(native.selection.current, { provider: "later", model: "current", reasoningEffort: "low" });
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

test("bound turn errors retain partial text and exactly the two native fields", async () => {
  const { ctx, native, deps } = await openedLane();
  native.followup = message => {
    const emit = (type, data) => ctx.emit("session/event", native.session, { type, data });
    emit("agent/inbox/spliced", { inserted: [message] });
    emit("turn/start", { turn: 8 }); emit("user/message", message);
    emit("assistant/message", { turn: 8, message: { content: [{ type: "text", text: "partial answer" }] } });
    emit("turn/end", { turn: 8, reason: { kind: "error", error: { code: "NATIVE", message: "provider\r\nmessage\0tail", stack: "DO_NOT_COPY", details: { secret: "DO_NOT_COPY" } } } });
    // Neither stale events nor a duplicate terminal can mutate the result.
    emit("turn/end", { turn: 7, reason: { kind: "error", error: { code: "STALE", message: "wrong" } } });
    emit("turn/end", { turn: 8, reason: { kind: "completed" } });
    emit("assistant/message", { turn: 8, message: { content: [{ type: "text", text: "late" }] } });
  };
  assert.deepEqual(await deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "request" }), {
    outcome: "failed", native_stop_reason: "error", result: "partial answer\n\nDSH turn error: NATIVE: provider  message tail",
  });
});

test("an early error remains terminal if the same input completes in a later turn before idle", async () => {
  const { ctx, native, deps } = await openedLane();
  native.followup = message => {
    const emit = (type, data) => ctx.emit("session/event", native.session, { type, data });
    emit("agent/inbox/spliced", { inserted: [message] });
    emit("turn/start", { turn: 8 });
    emit("turn/end", { turn: 8, reason: { kind: "error", error: { code: "EARLY", message: "before bind" } } });
    emit("turn/start", { turn: 9 }); emit("user/message", message);
    emit("assistant/message", { turn: 9, message: { content: [{ type: "text", text: "later answer" }] } });
    emit("turn/end", { turn: 9, reason: { kind: "completed" } });
  };
  assert.deepEqual(await deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "request" }), {
    outcome: "failed", native_stop_reason: "error", result: "EARLY: before bind",
  });
});

test("native error messages preserve exact UTF-8 boundaries on both associations", async () => {
  const mark = " [truncated]";
  const cases = [
    { input: "é😀".repeat(170) + "😀", bytes: 1024, output: "é😀".repeat(170) + "😀", outputBytes: 1024 },
    { input: "é😀".repeat(170) + "😀a", bytes: 1025, output: "é😀".repeat(168) + "é" + mark, outputBytes: 1022 },
    { input: "😀".repeat(256) + "a", bytes: 1025, output: "😀".repeat(253) + mark, outputBytes: 1024 },
  ];
  for (const bound of [false, true]) for (const fixture of cases) {
    assert.equal(Buffer.byteLength(fixture.input), fixture.bytes);
    const { ctx, native, deps } = await openedLane();
    native.followup = message => {
      const emit = (type, data) => ctx.emit("session/event", native.session, { type, data });
      emit("agent/inbox/spliced", { inserted: [message] }); emit("turn/start", { turn: 9 });
      if (bound) emit("user/message", message);
      emit("turn/end", { turn: 9, reason: { kind: "error", error: { code: "CODE", message: fixture.input } } });
    };
    const result = await deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "request" });
    assert.equal(result.outcome, "failed"); assert.equal(result.native_stop_reason, "error");
    assert.match(result.result, /^CODE: /u);
    const message = result.result.slice("CODE: ".length);
    assert.equal(Buffer.from(message, "utf8").toString("utf8"), message, "no lone surrogate or split UTF-8 code point");
    assert.equal(Buffer.byteLength(message), fixture.outputBytes);
    assert.equal(message, fixture.output);
  }
});

test("native error fields enforce all control-character line discipline and the code bound", async () => {
  const controls = [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127), 0x2028, 0x2029].map(code => String.fromCodePoint(code)).join("");
  for (const bound of [false, true]) for (const fixture of [
    { code: "C" + controls + "Z", expectedCode: "C" + " ".repeat(controls.length) + "Z", message: "M" + controls + "Z", expectedMessage: "M" + " ".repeat(controls.length) + "Z" },
    { code: "😀".repeat(32), expectedCode: "😀".repeat(32), message: "native", expectedMessage: "native" },
    { code: "😀".repeat(32) + "x", expectedCode: "😀".repeat(29) + " [truncated]", message: "native", expectedMessage: "native" },
  ]) {
    const { ctx, native, deps } = await openedLane();
    native.followup = message => {
      const emit = (type, data) => ctx.emit("session/event", native.session, { type, data });
      emit("agent/inbox/spliced", { inserted: [message] }); emit("turn/start", { turn: 9 });
      if (bound) emit("user/message", message);
      emit("turn/end", { turn: 9, reason: { kind: "error", error: { code: fixture.code, message: fixture.message } } });
    };
    const result = await deps.callbacks.run(new AbortController().signal, { Native: null, Interrupted: () => false }, { text: "request" });
    assert.equal(result.result, `${fixture.expectedCode}: ${fixture.expectedMessage}`);
    assert.equal(Buffer.from(result.result, "utf8").toString("utf8"), result.result);
    assert.ok(Buffer.byteLength(fixture.expectedCode) <= 128);
  }
});

test("already-aborted no-option create and resume preserve the original lane open behavior", async () => {
  for (const resume of [false, true]) {
    const ctx = new Context(), native = agent(ctx), { deps } = lane(ctx);
    Object.defineProperty(ctx.sessionController, "agents", { get() { throw new Error("optional selector read"); } });
    delete ctx.llm;
    const controller = new AbortController(); controller.abort(new Error("already cancelled"));
    assert.deepEqual(await deps.callbacks.open(controller.signal, { name: "no-options", ...(resume ? { resume_session_id: native.id } : {}), open: {} }), { session_id: native.id });
    assert.equal(ctx.calls.some(([call]) => call === "create"), !resume);
    assert.deepEqual(ctx.calls.at(-1), ["flush", native.id]);
  }
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
  assert.deepEqual(ctx.logs.map(record => record.message), ['sessionbus: invalid_hello: {"reason":"forbidden\\nlist"}']);
  assert.deepEqual(deps.errors, process.stderr.isTTY === true ? [] : ['sessionbus: invalid_hello: {"reason":"forbidden\\nlist"}\n']);
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
  const state = { mapped: runtime.peers.has(root), stopped: deps.peers[1].stopped,
    errors: ctx.logs.map(record => record.message), effects: ctx.effects.size };
  // Cleanup also releases the old implementation's dead queue, so the test fails, not hangs.
  await ctx.dispose();
  const result = await queued;
  assert.equal(state.mapped, false, "terminal old peer cannot remain published");
  assert.equal(state.stopped, true, "pending candidate belongs to the failed operation");
  assert.deepEqual(state.errors, ["sessionbus: invalid_hello"]);
  assert.deepEqual(deps.errors, process.stderr.isTTY === true ? [] : ["sessionbus: invalid_hello\n"]);
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
  assert.equal(ctx.logs.every(record => record.name === "sessionbus-dsh" && record.level === "debug"), true);
  assert.deepEqual(ctx.logs.map(record => `${record.message}\n`), [
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
  assert.deepEqual(deps.errors, process.stderr.isTTY === true ? [] : ctx.logs.map(record => `${record.message}\n`));
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

test("a refused Open suppresses only the expected unopened-close warning", async () => {
  const ctx = new Context(), failure = new Error("native refusal");
  ctx.sessionController.create = async () => { throw failure; };
  const { deps, runtime } = lane(ctx);
  await assert.rejects(deps.callbacks.open(new AbortController().signal, { open: { cwd: "/workspace" } }), error => error === failure);
  assert.equal(deps.worker.opened, false);
  deps.failWorker(new Error("sessionbus connection closed"));
  await runtime.workerExit;
  assert.deepEqual(deps.errors, []);
  assert.deepEqual(ctx.exits, [1], "warning suppression does not decide shutdown status");
});

test("an unopened close without a refused Open still warns", async () => {
  const ctx = new Context();
  const { deps, runtime } = lane(ctx);
  deps.failWorker(new Error("sessionbus connection closed"));
  await runtime.workerExit;
  assert.deepEqual(deps.errors, ["sessionbus: sessionbus connection closed\n"]);
  assert.deepEqual(ctx.exits, [1]);
});

test("a pending option Open aborted by transport still warns on unopened close", async () => {
  const ctx = new Context(), reached = deferred(), aborted = deferred();
  const controller = new AbortController(), cause = new Error("sessionbus connection closed");
  controller.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
  ctx.llm.resolveCallConfig = async (_request, signal) => {
    reached.resolve(); await aborted.promise; signal.throwIfAborted();
  };
  const { deps, runtime } = lane(ctx);
  const rejected = assert.rejects(deps.callbacks.open(controller.signal, { open: { model: "provider/model" } }), error => error === cause);
  await reached.promise; controller.abort(cause); await rejected;
  deps.failWorker(cause); await runtime.workerExit;
  assert.deepEqual(deps.errors, ["sessionbus: sessionbus connection closed\n"]);
  assert.deepEqual(ctx.exits, [1]);
  assert.equal(ctx.calls.some(call => call[0] === "create"), false);
});
