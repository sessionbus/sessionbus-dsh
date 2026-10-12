"use strict";

const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const kit = require("@sessionbus/kit");
const version = require("./package.json").version;
const { ACTIONS } = kit;
const skillContent = fs.readFileSync(path.join(__dirname, "skills/sessionbus.md"), "utf8");

// Match the MCP tool's closed union; the public kit validates each action.
function argumentSchema() {
  const properties = {};
  for (const field of ["session_id", "host", "message", "target", "group", "product", "name", "resume_session_id", "notify_target", "input", "run_id"]) properties[field] = { type: "string" };
  for (const field of ["targets", "extra_groups"]) properties[field] = { type: "array", items: { type: "string" } };
  for (const field of ["persistent", "notify", "forget"]) properties[field] = { type: "boolean" };
  for (const field of ["auto_close_ms", "timeout_ms"]) properties[field] = { type: "integer" };
  properties.trace = { type: "string", enum: ["off", "events", "content"] };
  properties.mode = { type: "string", enum: ["off", "events", "content"] };
  const open = {};
  for (const field of ["cwd", "permission_mode", "model", "reasoning_effort"]) open[field] = { type: "string" };
  open.arguments = { type: "array", items: { type: "string" } };
  properties.open = { type: "object", additionalProperties: false, properties: open };
  return { type: "object", additionalProperties: false, properties, description: "Use only the fields listed for the selected action in the tool description. send has no summary field; put the complete content in message." };
}

function assertKnownArguments(value, schema, location = "arguments") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`sessionbus ${location} must be an object`);
  for (const field of Object.keys(value)) {
    if (!Object.hasOwn(schema.properties, field)) throw new Error(`sessionbus ${location}.${field} is not supported`);
    const property = schema.properties[field];
    if (property.type === "object") assertKnownArguments(value[field], property, `${location}.${field}`);
  }
}

const name = "sessionbus-dsh";
const productPattern = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const inject = [
  "agents", "appReady", "appExit", "commands", "permissionPresets", "sessionController",
  "sessions", "sessionTitle", "skills", "storageDomain", "tools",
];
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function text(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !/[\0\r\n]/u.test(value);
}

function validGroups(groups) {
  return Array.isArray(groups) && groups.every(text) && new Set(groups).size === groups.length;
}

function clean(error) {
  return String(error?.message || error || "DSH plugin failed").replace(/[\0\r\n]/gu, " ").slice(0, 4096);
}

function readConfiguration(ctx, config = {}, ambient = process.env) {
  if (config.product === undefined) throw new Error("product is required; re-run sessionbus-dsh-install --product <name> <profile>");
  if (typeof config.product !== "string" || !productPattern.test(config.product)) throw new Error("product must match ^[a-z0-9][a-z0-9-]{0,31}$");
  const launch = ctx.launchEnvironment || ctx.get?.("launchEnvironment");
  const value = (key) => {
    if (launch) return launch.get(key)?.value;
    return Object.hasOwn(ambient, key) ? ambient[key] : undefined;
  };
  const token = value("SESSIONBUS_LAUNCH_TOKEN");
  delete process.env.SESSIONBUS_LAUNCH_TOKEN;
  const mode = token === undefined ? "peer" : "lane";
  if (config.mode !== undefined && config.mode !== mode) throw new Error(`mode ${config.mode} conflicts with launch environment`);
  let groups = mode === "lane" ? [] : Object.hasOwn(config, "groups") ? config.groups : JSON.parse(value("SESSIONBUS_GROUPS") || "[]");
  if (!validGroups(groups)) throw new Error("groups are invalid");
  const explicitSocket = Object.hasOwn(config, "socket") ? config.socket : value("SESSIONBUS_SOCKET");
  const socket = explicitSocket ? path.resolve(explicitSocket) : value("XDG_RUNTIME_DIR")
    ? path.resolve(value("XDG_RUNTIME_DIR"), "sessionbus/presence.sock")
    : path.join("/tmp", `sessionbus-${process.getuid()}`, "presence.sock");
  const localKey = Object.hasOwn(config, "local_key") ? config.local_key : value("SESSIONBUS_LOCAL_KEY");
  if (!text(socket) || localKey !== undefined && !text(localKey)) throw new Error("connection settings are invalid");
  return { settings: { mode, product: config.product, groups: [...groups], socket, localKey }, token, trace: value("SESSIONBUS_DSH_TRACE") === "1" };
}

function captureContext(ctx) {
  const services = Object.fromEntries(inject.map((service) => [service, ctx[service]]));
  let launchEnvironment;
  try { launchEnvironment = ctx.launchEnvironment || ctx.get?.("launchEnvironment"); } catch {}
  const fiber = ctx.fiber;
  return {
    active: () => fiber?.uid !== null,
    context: {
      ...services,
      launchEnvironment,
      get: ctx.get?.bind(ctx),
      on: ctx.on.bind(ctx),
      effect: ctx.effect.bind(ctx),
    },
  };
}

function settings(ctx, config = {}, ambient = process.env) {
  return readConfiguration(ctx, config, ambient).settings;
}

function connectionEnvironment(config, token) {
  return {
    SESSIONBUS_SOCKET: config.socket,
    ...(config.localKey === undefined ? {} : { SESSIONBUS_LOCAL_KEY: config.localKey }),
    ...(token === undefined ? {} : { SESSIONBUS_LAUNCH_TOKEN: token }),
  };
}

function nativeName(value) {
  const at = value.lastIndexOf("@");
  return at < 0 ? value : value.slice(0, at);
}

function textOf(message) {
  return Array.isArray(message?.content) ? message.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("") : "";
}

function renderDelivery(request) {
  const cleanAttribute = (value) => String(value).replace(/["<>\r\n]/gu, "");
  const escaped = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };
  const metadata = JSON.stringify({ fromProduct: request.from.product, messageId: request.message_id, groups: request.from.groups || [] })
    .replace(/[<>&\u2028\u2029]/gu, (character) => escaped[character]);
  const body = request.body.replace(/<\/cross-session-message/giu, "<\\/cross-session-message");
  return `<cross-session-message from="${cleanAttribute(request.from.name || request.from.session_id)}" from-session="${cleanAttribute(request.from.session_id)}">\n[sessionbus-metadata: ${metadata}]\n${body}\n</cross-session-message>`;
}

function terminal(reason) {
  const native_stop_reason = reason?.kind;
  if (native_stop_reason === "completed") return { outcome: "completed", native_stop_reason };
  if (native_stop_reason === "aborted" || native_stop_reason === "interrupted") return { outcome: "interrupted", native_stop_reason };
  if (["blocked", "error", "max-tokens"].includes(native_stop_reason)) return { outcome: "failed", native_stop_reason };
  throw new Error(`unknown DSH turn end reason ${JSON.stringify(reason)}`);
}

// Exactly DSH's native code/message, not a sanitizer or a cause-chain reader.
function turnError(error) {
  const field = (value, limit) => {
    const flat = String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ");
    if (Buffer.byteLength(flat) <= limit) return flat;
    const mark = " [truncated]";
    let bounded = "", bytes = 0;
    for (const character of flat) {
      const size = Buffer.byteLength(character);
      if (bytes + size > limit - Buffer.byteLength(mark)) break;
      bounded += character; bytes += size;
    }
    return bounded + mark;
  };
  return `${field(error?.code, 128)}: ${field(error?.message, 1024)}`;
}

class NativeSession {
  constructor(ctx, createUserMessage, ProtocolError) {
    this.ctx = ctx;
    this.createUserMessage = createUserMessage;
    this.ProtocolError = ProtocolError;
    this.receipts = new Map();
    this.deferredAdmissions = [];
    this.admissionScheduled = false;
    this.removeEvents = ctx.on("session/event", (session, event) => this.event(session, event), { global: true });
  }

  async open(request, signal) {
    const options = request.open || {};
    if (options.arguments?.length) throw new Error("open.arguments are not supported by DSH");
    if (options.model !== undefined || options.reasoning_effort !== undefined) signal?.throwIfAborted();
    for (const field of ["model", "reasoning_effort"]) {
      if (options[field] !== undefined && (typeof options[field] !== "string" || options[field].length === 0)) throw new Error(`unsupported value ${field}: expected a non-empty string`);
    }
    if (options.permission_mode !== undefined && !this.ctx.permissionPresets.names.includes(options.permission_mode)) throw new Error(`unsupported value permission_mode=${options.permission_mode}`);
    let route, llm, controller;
    if (options.model !== undefined) {
      const slash = options.model.indexOf("/");
      if (slash < 1 || slash === options.model.length - 1) throw new Error(`unsupported value model=${options.model}`);
      route = { provider: options.model.slice(0, slash), model: options.model.slice(slash + 1) };
    }
    if (options.model !== undefined || options.reasoning_effort !== undefined) {
      llm = this.ctx.get?.("llm");
      if (typeof llm?.resolveCallConfig !== "function") throw new Error("DSH llm.resolveCallConfig is unavailable for lane open options");
      // Approved alpha.2 non-public holder, documented methods only (controller
      // lib/types/index.d.ts:49; lib/types/agent.d.ts:101,107,129). Its presence is
      // session-independent: refuse before create. selectModel saves the profile
      // default; never fall back to it.
      controller = this.ctx.sessionController.agents;
      const missing = ["selectionFor", "selectForNextRequest", "serializeImageAdmission"].filter(method => typeof controller?.[method] !== "function");
      if (missing.length) {
        const message = `sessionController.agents missing ${missing.join(", ")}`;
        let dshVersion = "unknown version";
        // Diagnostic only: unavailable metadata must not hide the missing seam
        // or forward a module-resolution error containing host paths.
        try {
          const value = require("@deepseek-ai/dsh-api-session-controller/package.json").version;
          if (typeof value === "string" && value.length) dshVersion = value;
        } catch {}
        throw new Error(`${message} on DSH ${dshVersion}; lane open options require the session-only selection seam`);
      }
      if (!request.resume_session_id) {
        // Public default read is the fresh route at this moment. The serializer
        // below still reads and validates the session's commit-time selection.
        const defaultModel = route ? undefined : this.ctx.get?.("agentDefaultModel");
        const defaults = route ?? (typeof defaultModel?.currentSelection === "function" ? defaultModel.currentSelection() : undefined);
        if (!defaults) throw new Error("DSH agentDefaultModel.currentSelection is unavailable for fresh lane effort options");
        await llm.resolveCallConfig({ provider: defaults.provider, model: defaults.model,
          ...(options.reasoning_effort === undefined ? {} : { reasoningEffort: options.reasoning_effort }) }, signal);
        signal?.throwIfAborted();
      }
    }
    let resolved;
    if (request.resume_session_id) {
      resolved = await this.ctx.sessionController.resolveAgent(request.resume_session_id);
    } else {
      const created = await this.ctx.sessionController.create(options.cwd ? { cwd: options.cwd } : {});
      resolved = await this.ctx.sessionController.resolveAgent(created.sessionId);
    }
    if (resolved.error) throw resolved.error;
    const agent = resolved.agent;
    const expected = request.resume_session_id || agent.id;
    if (agent.id !== expected || agent.session.id !== expected) throw new Error("DSH resolved a different native session");
    if (options.cwd !== undefined && agent.session.header.cwd !== options.cwd) throw new Error("DSH resolved a different native cwd");
    await this.ctx.sessionController.rename({ sessionId: agent.id, title: nativeName(request.name) });
    if (options.model !== undefined || options.reasoning_effort !== undefined) {
      signal?.throwIfAborted();
      await controller.serializeImageAdmission(agent, async () => {
        signal?.throwIfAborted();
        let currentRoute = route;
        if (options.model === undefined) {
          const current = controller.selectionFor(agent).current;
          currentRoute = { provider: current.provider, model: current.model };
        }
        const resolved = await llm.resolveCallConfig({ ...currentRoute, ...(options.reasoning_effort === undefined ? {} : { reasoningEffort: options.reasoning_effort }) }, signal);
        signal?.throwIfAborted();
        controller.selectForNextRequest(agent, {
          provider: resolved.provider, model: resolved.model,
          // Adapter defaults belong to request preparation, not an explicit choice.
          ...(options.reasoning_effort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort }),
        });
      });
    }
    if (options.permission_mode !== undefined) {
      this.ctx.permissionPresets.set(agent.session, options.permission_mode);
    }
    await this.ctx.sessions.flush(agent.session);
    this.agent = agent;
    return { session_id: agent.id };
  }

  message(body) {
    return this.createUserMessage({ content: [{ type: "text", text: body }], source: { kind: `plugin:${name}`, form: "relay" } });
  }

  receipt(message, session, cancel) {
    if (cancel?.aborted) throw cancel.reason || new Error("cancelled");
    const accepted = { ...deferred(), session, observed: false };
    const abort = () => accepted.reject(cancel.reason || new Error("cancelled"));
    cancel?.addEventListener("abort", abort, { once: true });
    accepted.promise.catch(() => {});
    accepted.close = () => {
      cancel?.removeEventListener("abort", abort);
      if (this.receipts.get(message.id) === accepted) this.receipts.delete(message.id);
    };
    this.receipts.set(message.id, accepted);
    return accepted;
  }

  deferAdmission(call) {
    const result = deferred();
    this.deferredAdmissions.push({ call, result });
    if (!this.admissionScheduled) {
      this.admissionScheduled = true;
      // Let DSH's running-to-idle microtasks settle before one synchronous admission batch.
      setImmediate(() => {
        this.admissionScheduled = false;
        for (const admission of this.deferredAdmissions.splice(0)) {
          try { admission.result.resolve(admission.call()); }
          catch (error) { admission.result.reject(error); }
        }
      });
    }
    return result.promise;
  }

  event(session, event) {
    if (event.type === "agent/inbox/spliced") {
      for (const message of event.data.inserted || []) {
        const receipt = this.receipts.get(message.id);
        if (receipt?.session === session) { receipt.observed = true; receipt.resolve(); }
      }
    }
    const run = this.active;
    if (!run || run.end || run.endError || session !== this.agent?.session) return;
    if (event.type === "turn/start") run.openTurn = event.data.turn;
    if (event.type === "user/message" && event.data.id === run.message.id) {
      if (!Number.isSafeInteger(run.openTurn)) {
        run.endError = new Error("DSH consumed input outside a turn");
        return;
      }
      run.turn = run.openTurn;
    }
    if (event.type === "assistant/message" && run.turn === event.data.turn) run.output += textOf(event.data.message);
    const earlyError = event.type === "turn/end" && run.turn === null && run.openTurn === event.data.turn && event.data.reason?.kind === "error";
    if (event.type === "turn/end" && (run.turn === event.data.turn || earlyError)) {
      try {
        run.end = terminal(event.data.reason);
        if (event.data.reason.kind === "error") {
          const diagnostic = turnError(event.data.reason.error);
          run.output = run.output ? `${run.output}\n\nDSH turn error: ${diagnostic}` : diagnostic;
        }
      }
      catch (error) { run.endError = error; }
    }
  }

  async run(cancel, token, input) {
    if (token.Interrupted()) return { outcome: "interrupted", result: "" };
    // @sessionbus/kit sdk/js/index.js:108-120 passes its text or delivery seed here.
    const delivery = typeof input?.delivery?.body === "string" ? input.delivery : undefined;
    const body = typeof input === "string" ? input : typeof input?.text === "string" ? input.text : delivery?.body;
    if (body === undefined) throw new Error("sessionbus received an unexpected run input seed shape");
    const message = this.message(delivery ? renderDelivery(delivery) : body);
    const record = { message, openTurn: null, turn: null, output: "", cancelled: deferred() };
    const receipt = this.receipt(message, this.agent.session, cancel);
    this.active = record;
    token.Native = record;
    record.cancelled.promise.catch(() => {});
    const abort = () => { record.cancelled.reject(cancel.reason || new Error("cancelled")); this.receipts.get(message.id)?.reject(cancel.reason || new Error("cancelled")); };
    cancel.addEventListener("abort", abort, { once: true });
    try {
      try { this.agent.followup(message); }
      catch (error) { receipt.reject(error); throw error; }
      await receipt.promise;
      if (delivery) await token.ReportDelivery({ disposition: "injected" });
      const idle = this.agent.whenIdle();
      idle.catch(() => {});
      await Promise.race([idle, record.cancelled.promise]);
      if (record.endError) throw record.endError;
      if (record.end) return { ...record.end, result: record.output };
      if (record.cancelReason) return { outcome: "interrupted", native_stop_reason: record.cancelReason, result: record.output };
      throw new Error("DSH reached idle without turn/end");
    } finally {
      receipt.close();
      cancel.removeEventListener("abort", abort);
      if (this.active === record) this.active = null;
      if (token.Native === record) token.Native = null;
    }
  }

  interrupt(_cancel, token) {
    if (token.Native) {
      token.Native.cancelReason = "aborted:user";
      this.agent.cancel({ kind: "user" }, { keepInbox: true });
    }
  }

  async steerDelivery(cancel, request, agent) {
    const message = this.message(renderDelivery(request));
    const receipt = this.receipt(message, agent.session, cancel);
    try {
      try { agent.steer(message); }
      catch (error) {
        receipt.reject(error);
        return receipt.observed ? { disposition: "injected" } : { disposition: "rejected", reason: clean(error) };
      }
      try { await receipt.promise; }
      catch (error) {
        throw new this.ProtocolError({ code: -32603, message: "internal", data: { kind: "delivery_admission_uncertain", message_id: request.message_id, reason: clean(error) } });
      }
      return { disposition: "injected" };
    } finally { receipt.close(); }
  }

  deliver(cancel, request, agent = this.agent, live = () => agent === this.agent) {
    return this.deferAdmission(() => cancel?.aborted || !live()
      ? { disposition: "rejected", reason: "native owner closed" }
      : this.steerDelivery(cancel, request, agent));
  }

  laneDeliver(cancel, request, token) {
    return this.deferAdmission(() => {
      const run = token?.Native;
      if (cancel?.aborted || !run || this.active !== run || run.end || this.agent.status !== "running") {
        throw new this.ProtocolError({ code: -32004, message: "not_running" });
      }
      return this.steerDelivery(cancel, request, this.agent);
    });
  }

  async close() {
    if (!this.agent) return;
    if (this.agent.status === "running") this.agent.cancel({ kind: "disposed" });
    await this.agent.whenIdle();
    await this.ctx.sessions.flush(this.agent.session);
    this.removeEvents();
  }
}

function identity(ctx, agent, product, groups, title) {
  const sessionID = String(agent?.session?.id || "");
  if (!text(sessionID)) return;
  const cwd = agent?.session?.header?.cwd;
  if (!text(cwd)) throw new Error("DSH root identity is incomplete");
  const current = title === undefined ? ctx.sessionTitle.get(agent.session)?.title : title;
  const provider = agent.options?.provider;
  const model = agent.options?.model;
  return { product, session_id: sessionID, ...(text(current) ? { name: current } : {}), groups: [...groups], info: { cwd, ...(text(provider) && text(model) ? { model: `${provider}/${model}` } : {}) } };
}

function createRuntime(ctx, config, dependencies, prepared) {
  const configured = prepared || readConfiguration(ctx, config, dependencies.ambient);
  const values = configured.settings;
  const active = dependencies.active || (() => true);
  let launchToken = configured.token;
  const native = new NativeSession(ctx, dependencies.createUserMessage, dependencies.ProtocolError || kit.ProtocolError);
  const domain = dependencies.domain;
  const groups = values.mode === "peer" ? domain.table("groups") : undefined;
  const peers = new Map();
  const publicationErrors = new WeakSet();
  let worker;
  let workerExit = Promise.resolve();
  let ready = false;
  let warned = false;
  const warn = (error) => { if (active() && !warned) { warned = true; dependencies.stderr(`sessionbus: ${clean(error)}\n`); } };
  const trace = (message) => { if (configured.trace && active()) dependencies.stderr(`sessionbus trace: ${message}\n`); };
  const root = (agent) => ctx.agents.roots().includes(agent);
  trace(`mode=${values.mode} ready=false socket=${values.socket}`);
  const publicationError = (agent, error, record) => {
    if (record && peers.get(agent) === record) {
      record.peer?.shutdown();
      peers.delete(agent);
      // Leave it unpublished; a later title change may naturally call present() again.
    }
    if (active() && !publicationErrors.has(agent)) {
      publicationErrors.add(agent);
      dependencies.stderr(`sessionbus: ${clean(error)}\n`);
    }
  };
  const connectionError = (agent, error, record) => {
    void record.rehello.then(() => {
      if (active() && peers.get(agent) === record) dependencies.stderr(`sessionbus: ${clean(error)}\n`);
    });
  };
  const connect = (agent, current, tail = Promise.resolve(), previous) => {
    const record = { peer: undefined, identity: current, rehello: tail };
    const peer = dependencies.connectPeer(current, (cancel, request) =>
      native.deliver(cancel, request, agent, () => ready && active() && root(agent) && (peers.get(agent) === record
        || previous && previous() && peers.get(agent) === previous() && agent.session?.id === current.session_id)), connectionEnvironment(values), {
      connect: (socket) => {
        trace(`connect id=${current.session_id} socket=${socket}`);
        const stream = net.createConnection(socket);
        stream.once("connect", () => trace(`connect id=${current.session_id} state=connected`));
        stream.once("error", (error) => connectionError(agent, error, record));
        return stream;
      },
      schedule: dependencies.schedule,
    });
    record.peer = peer;
    void peer.closed?.then(async () => {
      await record.rehello;
      // The accepted replacement is current before the superseded old peer settles.
      if (peers.get(agent) === record && peer.error) publicationError(agent, peer.error, record);
    });
    return record;
  };
  const present = (agent) => {
    const isRoot = root(agent);
    const reason = values.mode !== "peer" ? "not-peer" : !ready ? "not-ready" : !isRoot ? "not-root" : peers.has(agent) ? "published" : "publish";
    trace(`present id=${agent?.session?.id || agent?.id || "unknown"} root=${isRoot} reason=${reason}`);
    if (reason !== "publish") return;
    try {
      const choice = groups.get(agent?.session?.id) ?? values.groups;
      if (!validGroups(choice)) throw new Error(`invalid stored groups for ${agent?.session?.id}`);
      const current = identity(ctx, agent, values.product, choice);
      if (!current) { trace(`present id=${agent?.id || "unknown"} root=${isRoot} reason=no-session-id`); return; }
      peers.set(agent, connect(agent, current));
    } catch (error) { publicationError(agent, error); }
  };
  const forget = (agent) => { peers.get(agent)?.peer.shutdown(); peers.delete(agent); };
  let removeCreated = () => {}, removeDisposed = () => {}, removeTitle = () => {};
  if (values.mode === "peer") {
    removeCreated = ctx.on("agent/created", ({ agent }) => { trace(`agent/created id=${agent?.session?.id || agent?.id || "unknown"} scope=global`); present(agent); }, { global: true });
    removeDisposed = ctx.on("agent/disposed", ({ agent }) => { trace(`agent/disposed id=${agent?.session?.id || agent?.id || "unknown"} scope=global`); forget(agent); }, { global: true });
    removeTitle = ctx.on("session/event", (session, event) => {
      if (event.type !== "session/title") return;
      const agent = ctx.agents.get(session.id);
      const record = peers.get(agent);
      if (!agent || agent.session !== session) return;
      if (!record) return present(agent);
      // kit rehello is (signal, name, info); a changed durable id needs a full replacement.
      record.rehello = record.rehello.then(() => {
        const current = peers.get(agent);
        if (!current || !ready || !root(agent)) return;
        const next = identity(ctx, agent, values.product, current.identity.groups, event.data.title);
        if (!next) return;
        const replace = next.session_id !== current.identity.session_id;
        current.identity = next;
        return replace ? current.peer.replace(next) : current.peer.rehello(undefined, next.name, next.info);
      }).catch(warn);
    }, { global: true });
  }
  const caller = (agent) => worker && native.agent === agent ? worker.caller : peers.get(agent)?.peer.caller;
  const argumentsSchema = argumentSchema();
  const execute = (argumentsValue, execution) => {
    const client = caller(execution?.agent);
    if (!client) throw new Error("sessionbus requires an exact live DSH root");
    const args = argumentsValue.arguments || {};
    assertKnownArguments(args, argumentsSchema);
    return client.action(argumentsValue.action, args);
  };
  let removeGrant;
  try {
    // The peer floor guarantees this waterfall; this catch covers registration errors, not feature detection.
    removeGrant = ctx.on("tools/pre-execute", async (execution, next) =>
      execution.name === "sessionbus" ? { kind: "allow" } : next(), { prepend: true });
  } catch (error) { throw new Error(`cannot grant sessionbus tool permission: ${clean(error)}`); }
  const removeTool = ctx.tools.register(dependencies.defineTool({
    name: "sessionbus",
    description: "Call Sessionbus with an action from the list, send, spawn, describe, trace, run, start, wait, status, interrupt, close, forget, or ack enum. Use trace mode off, events or content for a direct child. Read the sessionbus skill for exact arguments, caller identity, delivery dispositions, lane policies, collection and acknowledgment discipline, tracing, and safe replies.",
    parameters: { action: { type: "string", enum: ACTIONS, required: true }, arguments: argumentsSchema },
    output: { schema: { type: "object", additionalProperties: true, properties: {} }, render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }] },
    execute,
  }));
  const removeSkill = ctx.skills.register({
    name: "sessionbus",
    description: "Discover and message Sessionbus peers, trace direct child traffic, and create, run, collect, close and resume Sessionbus lanes through the single tool.",
    source: "runtime",
    content: skillContent,
    invocation: { modelInvocable: true, userInvocable: true },
  });
  const removeCommand = ctx.commands.register({
    name: "sessionbus-groups", description: "Show or replace this session's Sessionbus groups; - restores profile defaults",
    input: { hint: "[a,b|-]" },
    handler: async ({ agent, rawInput, signal }) => {
      if (values.mode === "lane") return { kind: "error", text: "sessionbus-groups is unavailable in lane mode; the daemon owns lane groups" };
      const id = agent?.session?.id;
      const live = () => ready && active() && root(agent) && agent.session?.id === id;
      if (!live()) return { kind: "error", text: "sessionbus-groups requires an exact live DSH root" };
      const input = rawInput.trim();
      const choice = input === "-" ? values.groups : input.split(",").map(value => value.trim());
      if (input && !validGroups(choice)) return { kind: "error", text: "groups are invalid" };
      const initial = peers.get(agent);
      if (!initial) return { kind: "error", text: "sessionbus is not connected" };
      // Show remains available while the serialized replacement waits for the daemon.
      if (!input) return { kind: "success", text: JSON.stringify(initial.identity.groups) };
      const progress = deferred();
      let inProgress = false;
      const changed = initial.rehello.then(async () => {
        if (!live()) throw new Error("DSH root was disposed or replaced");
        signal.throwIfAborted();
        const old = peers.get(agent);
        if (!old) throw new Error("sessionbus is not connected");
        const replacing = JSON.stringify(choice) !== JSON.stringify(old.identity.groups);
        if (replacing) {
          // Kit delivers only after admission; cover the short interval before our self-info check.
          let previous = old;
          // Kit has no public hello-sent hook: cancellation ends at this attempt boundary.
          const candidate = connect(agent, identity(ctx, agent, values.product, choice), old.rehello, () => previous);
          let removePending;
          try {
            removePending = ctx.effect(() => {
              const removeDisposed = ctx.on("agent/disposed", ({ agent: disposed }) => {
                if (disposed === agent) candidate.peer.shutdown();
              }, { global: true });
              return () => {
                removeDisposed();
                if (peers.get(agent) !== candidate) candidate.peer.shutdown();
              };
            }, "sessionbus-dsh.pending-groups");
            const ended = candidate.peer.closed.then(() => {
              const error = candidate.peer.error;
              const reason = error?.data;
              throw new Error(error ? `${clean(error)}${reason === undefined ? "" : `: ${clean(typeof reason === "string" ? reason : JSON.stringify(reason))}`}` : "DSH root was disposed or replaced");
            });
            const admitted = old.peer.closed.then(() => {
              if (old.peer.error?.code === -32012) return;
              if (old.peer.error) throw old.peer.error;
              if (!live() || peers.get(agent) !== old) throw new Error("DSH root was disposed or replaced");
              return new Promise(() => {});
            });
            await Promise.race([candidate.peer.ready, ended, admitted]);
            if (!live()) throw new Error("DSH root was disposed or replaced");
            // Interim public admission proof: ready alone can settle after a failed hello in kit 0.5.12.
            try {
              const { self_info: self } = await Promise.race([candidate.peer.caller.list({}, AbortSignal.timeout(5000)), ended]);
              const expected = self && [...new Set([...choice, `session:${self.session_id}`])];
              if (!self || nativeName(self.session_id) !== id || self.product !== values.product || JSON.stringify(self.groups) !== JSON.stringify(expected)) throw new Error("sessionbus hello identity was not confirmed");
            } catch (error) {
              if (candidate.peer.error) await ended;
              if (!live() || peers.get(agent) !== old) throw error;
              // Uncertain admission is not permission to detach. Native terminal signals own completion.
              inProgress = true;
              progress.resolve({ kind: "success", text: "change in progress; `/sessionbus-groups` with no argument shows the result" });
              await Promise.race([admitted, ended]);
            }
            if (!live() || peers.get(agent) !== old) throw new Error("DSH root was disposed or replaced");
            candidate.rehello = old.rehello;
            peers.set(agent, candidate);
            previous = undefined;
            old.peer.shutdown();
          } finally {
            previous = undefined;
            removePending?.();
          }
        }
        try {
          if (input === "-") await groups.delete(id); else await groups.put(id, choice);
        } catch (error) {
          throw new Error(`live groups ${replacing ? "changed" : "unchanged"}, saving failed: ${clean(error)}; restart will use the prior value`);
        }
        if (!live()) throw new Error("DSH root was disposed or replaced after saving groups");
        return { kind: "success", text: JSON.stringify(choice) };
      });
      initial.rehello = changed.then(() => {}, () => {});
      const result = changed.catch(error => {
        // The old peer's deferred publication handler reports that exact terminal error once.
        if (inProgress && active() && peers.get(agent)?.peer.error !== error) dependencies.stderr(`sessionbus: ${clean(error)}\n`);
        return { kind: "error", text: clean(error) };
      });
      return Promise.race([result, progress.promise]);
    },
  });
  const start = () => {
    ready = true;
    trace(`mode=${values.mode} ready=true`);
    if (values.mode === "lane") {
      const environment = connectionEnvironment(values, launchToken);
      launchToken = undefined;
      worker = dependencies.serveWorker({
        hello: () => ({ product: values.product, version, supports_message_run: true, supported_open_fields: ["cwd", "permission_mode", "model", "reasoning_effort"], extra_arguments: [] }),
        open: (cancel, request) => native.open(request, cancel),
        run: (cancel, token, input) => native.run(cancel, token, input),
        interrupt: (cancel, token) => native.interrupt(cancel, token),
        deliver: (cancel, request, _identity, token) => native.laneDeliver(cancel, request, token),
        close: () => native.close(),
      }, environment);
      workerExit = worker.closed.then(async () => {
        const failure = await worker.serving?.catch((error) => error);
        if (!active()) return;
        if (failure && !worker.opened) { warn(failure); ctx.appExit(1); } else ctx.appExit(0);
      });
    } else {
      for (const agent of ctx.agents.roots()) present(agent);
    }
  };
  const removeReady = ctx.appReady.onReady(start);
  const close = () => {
    ready = false;
    trace(`mode=${values.mode} ready=false reason=close`);
    removeReady(); removeCreated(); removeDisposed(); removeTitle(); removeSkill(); removeGrant(); removeTool(); removeCommand();
    for (const agent of peers.keys()) forget(agent);
    worker?.shutdown(); native.removeEvents();
    return domain?.close();
  };
  ctx.effect(() => close, "sessionbus-dsh.lifecycle");
  return { close, execute, native, peers, settings: values, start, get worker() { return worker; }, get workerExit() { return workerExit; } };
}

async function activate(ctx, config = {}, dependencies = {}, prepared) {
  const configured = prepared || readConfiguration(ctx, config, dependencies.ambient);
  const [{ createUserMessage }, { defineTool }] = await Promise.all([
    dependencies.createUserMessage ? { createUserMessage: dependencies.createUserMessage } : (dependencies.importLLM || (() => import("@deepseek-ai/dsh-llm")))(),
    dependencies.defineTool ? { defineTool: dependencies.defineTool } : (dependencies.importTools || (() => import("@deepseek-ai/dsh-tools")))(),
  ]);
  if (dependencies.active && !dependencies.active()) return;
  let domain = dependencies.domain;
  if (!domain && configured.settings.mode === "peer") {
    const { defineDomain, domainTable } = await import("@deepseek-ai/dsh-storage-domain");
    const { z } = require("zod");
    domain = await ctx.storageDomain.open(defineDomain({
      name: "sessionbus_groups", version: 1, layout: "per-record",
      tables: { groups: domainTable(z.custom(validGroups, "groups are invalid")) },
    }));
    if (dependencies.active && !dependencies.active()) { await domain.close(); return; }
  }
  try {
    return createRuntime(ctx, config, { ...kit, active: () => true, stderr: (line) => process.stderr.write(line), ...dependencies, domain, createUserMessage, defineTool }, configured);
  } catch (error) {
    await domain?.close();
    throw error;
  }
}

function apply(ctx, config = {}, dependencies = {}) {
  let captured, prepared;
  try {
    captured = captureContext(ctx);
    prepared = readConfiguration(captured.context, config, dependencies.ambient);
  } catch (error) {
    (dependencies.stderr || ((line) => process.stderr.write(line)))(`sessionbus: ${clean(error)}\n`);
    try { ctx.appExit(1); } catch {}
    return;
  }
  const runtimeDependencies = { stderr: (line) => process.stderr.write(line), ...dependencies, active: captured.active };
  void activate(captured.context, config, runtimeDependencies, prepared).catch((error) => {
    if (!captured.active()) return;
    runtimeDependencies.stderr(`sessionbus: ${clean(error)}\n`);
    captured.context.appExit(1);
  });
}

module.exports = { ACTIONS, NativeSession, activate, apply, connectionEnvironment, createRuntime, identity, inject, name, settings, terminal };
