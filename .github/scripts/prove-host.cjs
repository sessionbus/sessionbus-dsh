"use strict";
const executingSource =
  typeof require === "undefined" ? module.source : require("node:fs").readFileSync(__filename, "utf8");

// Agent entry point: inject the native exec/apply_patch/Sessionbus tools. No SDK
// client, daemon discovery, home-project mutation, retry or continuation owner.
const insist = (ok, message) => {
  if (!ok) throw new Error(message);
};
function roster(value, id, forgotten) {
  if (value.error) {
    insist(
      forgotten && value.error.code === -32001 && value.error.message === "unknown_session",
      "unexpected roster RPC error",
    );
    return;
  }
  const rows = Array.isArray(value) ? value : value.sessions;
  insist(Array.isArray(rows), "by-session roster must be an array");
  const row = rows.find((x) => x.session_id === id);
  insist(forgotten ? !row : row?.connected === false && row.running === false, "lane lifecycle mismatch");
}
function validate(p) {
  insist(p && typeof p === "object" && !Array.isArray(p), "parameters must be an object");
  const absolute = (value) =>
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.includes("\0") &&
    value
      .slice(1)
      .split("/")
      .every((x) => x && x !== "." && x !== "..");
  const string = (value) => typeof value === "string" && value.length > 0 && !value.includes("\0");
  const inside = (file, root) => file === root || file.startsWith(root + "/");
  for (const key of ["packet", "source", "dshHome", "profileDir", "archive", "sessionsDir", "cacheDir"])
    insist(absolute(p[key]), `${key}: explicit canonical absolute path required`);
  for (const key of ["node", "zstd", "product"]) insist(string(p[key]), `${key} is required`);
  insist(Array.isArray(p.dsh) && p.dsh.length > 0 && p.dsh.every(string), "dsh argv is required");
  insist(
    p.dsh.every((x) => !/^--(?:profile|home|patch)(?:=|$)/u.test(x)),
    "dsh prefix must not select a profile/home/patch",
  );
  insist(["archive", "registry", "none"].includes(p.operation), "choose archive, registry or none explicitly");
  insist(["lane", "peer"].includes(p.mode), "profiles only: choose lane or peer");
  insist(
    typeof p.acceptance === "boolean" && (!p.acceptance || p.mode === "lane"),
    "explicit acceptance true/false required; acceptance is a lane check",
  );
  insist(
    string(p.profile) && !/[\/\\]/u.test(p.profile) && ![".", "..", "node_modules"].includes(p.profile),
    "invalid profile name",
  );
  insist(
    (p.mode === "lane") === (p.profile === "sessionbus"),
    "lane profile must be sessionbus; peer must be another profile",
  );
  insist(p.profileDir === `${p.dshHome}/profiles/${p.profile}`, "profile observation must match DSH_HOME/profile");
  insist(p.sessionsDir === `${p.dshHome}/sessions`, "only the stock alpha.2 sessions root is supported");
  insist(
    p.cacheDir === `${p.dshHome}/storages/session_projcache/sessions`,
    "only the stock projection-cache root is supported",
  );
  insist(/^[A-Za-z0-9._/-]+$/u.test(p.packet) && !inside(p.packet, p.dshHome), "ASCII packet must be outside DSH_HOME");
  insist(
    p.packet
      .split("/")
      .every(
        (x) => !["credentials", "credential-store", "secrets", "tokens", "private-keys", ".ssh", ".gnupg"].includes(x),
      ),
    "packet must not be in a credential directory",
  );
  insist(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(p.version), "plain version required");
  insist(/^[a-f0-9]{64}$/u.test(p.archiveSha256), "archive SHA256 is required");
  insist(
    /^[a-z0-9][a-z0-9-]{0,31}$/u.test(p.product) &&
      (p.mode !== "lane" || ["sessionbus-dsh", "dashi"].includes(p.product)),
    "invalid installer product",
  );
  insist(Array.isArray(p.protected), "protected roots must be explicit");
  for (const entry of p.protected)
    insist(
      absolute(entry.path) &&
        !inside(p.packet, entry.path) &&
        !inside(p.dshHome, entry.path) &&
        [p.profileDir, p.sessionsDir, p.cacheDir].every(
          (mutable) => !inside(mutable, entry.path) && !inside(entry.path, mutable),
        ) &&
        (entry.metadataOnly === undefined || typeof entry.metadataOnly === "boolean"),
      "invalid protected root",
    );
  for (const key of ["ownerPid", "daemonPid"])
    insist(p[key] === undefined || (Number.isSafeInteger(p[key]) && p[key] > 0), `invalid ${key}`);
  insist(Array.isArray(p.references ?? []), "references must be an array");
  if (p.operation === "none" && !p.acceptance) insist(p.references?.length > 0, "closure requires sealed references");
  for (const reference of p.references ?? [])
    insist(
      absolute(reference.file) &&
        reference.file.endsWith("/MANIFEST.sha256") &&
        !inside(reference.file, p.packet) &&
        /^[a-f0-9]{64}$/u.test(reference.sha256),
      "invalid sealed reference",
    );
  insist(Array.isArray(p.retained ?? []) && (p.retained ?? []).every(string), "retained must be session IDs");
  insist(Array.isArray(p.refusals ?? []), "refusals must be an array");
  insist(p.acceptance || !(p.retained?.length || p.refusals?.length), "native cases require acceptance");
  if (p.acceptance)
    for (const key of ["host", "input", "answer"]) insist(string(p[key]), `${key} is required for acceptance`);
  const names = new Set();
  for (const item of p.refusals ?? []) {
    insist(/^case-[1-9]\d*$/u.test(item.name) && !names.has(item.name), "refusal names must be unique case-N labels");
    names.add(item.name);
    insist(
      string(item.reason) &&
        item.open &&
        typeof item.open === "object" &&
        !Array.isArray(item.open) &&
        Object.keys(item.open).length > 0 &&
        Object.entries(item.open).every(([key, value]) => ["model", "reasoning_effort"].includes(key) && string(value)),
      "invalid refusal open/reason",
    );
  }
}
async function runProof(p, tools) {
  let serial = 0,
    phase = "input",
    stopped,
    ownedPacket = false;
  const liveLanes = new Set();
  const save = async (name, value) => {
    const body = JSON.stringify(value, null, 2) + "\n";
    await tools.apply_patch(
      `*** Begin Patch\n*** Add File: ${p.packet}/${name}\n${body
        .trimEnd()
        .split("\n")
        .map((line) => "+" + line)
        .join("\n")}\n*** End Patch`,
    );
  };
  async function observe(kind, label, extra = {}) {
    phase = label;
    const source = kind === "boot" ? p.source : p.packet + "/prove-host.cjs";
    const request = {
      cmd: [p.node, source, kind, JSON.stringify(p), label, JSON.stringify(extra)]
        .map((value) => "'" + String(value).replaceAll("'", "'\\''") + "'")
        .join(" "),
      login: false,
      max_output_tokens: 4096,
      yield_time_ms: 1000,
    };
    const transport = { request, responses: [] };
    let response,
      result,
      output = "";
    try {
      response = await tools.exec_command(request);
      transport.responses.push(response);
      output += response.output;
      while (response.session_id && response.exit_code === undefined) {
        response = await tools.write_stdin({
          session_id: response.session_id,
          chars: "",
          yield_time_ms: 1000,
          max_output_tokens: 4096,
        });
        transport.responses.push(response);
        output += response.output;
      }
      result = JSON.parse(output);
      if (kind === "boot") ownedPacket = result.created;
    } catch (error) {
      transport.thrown = String(error);
      throw error;
    } finally {
      if (ownedPacket && kind !== "seal") await save(`${label}.transport.json`, transport);
    }
    insist(response.exit_code === 0, `${label}: observer failed; see on-disk capture`);
    insist(
      result.ok && result.bytes >= 0 && typeof result.sha256 === "string",
      `${label}: observation failed; see on-disk capture`,
    );
    return result.facts;
  }
  async function bus(label, action, args, allowError = false) {
    phase = label;
    const stem = `bus-${String(++serial).padStart(3, "0")}-${label}`,
      request = { action, arguments: args };
    await save(stem + ".request.json", { at: new Date().toISOString(), request });
    let raw;
    try {
      raw = await tools.mcp__sessionbus__sessionbus(request);
    } catch (error) {
      await save(stem + ".throw.json", { at: new Date().toISOString(), message: String(error) });
      throw new Error(`${label}: bus threw; never replay`);
    }
    await save(stem + ".result.json", { at: new Date().toISOString(), raw });
    const decoded =
      raw.structuredContent ??
      JSON.parse(
        raw.content
          .filter((x) => x.type === "text")
          .map((x) => x.text)
          .join("\n"),
      );
    const value = raw.isError && typeof decoded.code === "number" ? { error: decoded } : decoded;
    if (action === "spawn" && typeof value.session_id === "string") liveLanes.add(value.session_id);
    insist(allowError || (!raw.isError && !value.error), `${label}: bus refusal; never replay`);
    return value;
  }
  try {
    validate(p); // No tool, package mutation or send precedes complete input validation.
    await observe("boot", "source", { source: executingSource });
    const before = await observe("snapshot", "before");
    insist(before.workers === 0, "worker already running");
    for (const id of p.retained ?? []) roster(await bus("retained", "list", { session_id: id }), id, false);
    if (p.operation !== "none") {
      await observe("command", "add", {
        argv: [
          ...p.dsh,
          "plugin",
          "--profile",
          p.profile,
          "add",
          "--save-exact",
          p.operation === "archive" ? p.archive : `@sessionbus/dsh@${p.version}`,
        ],
      });
      await observe("command", "install", {
        argv: [
          ...p.dsh,
          "plugin",
          "--profile",
          p.profile,
          "exec",
          "sessionbus-dsh-install",
          ...(p.mode === "peer"
            ? ["--product", p.product, p.profile]
            : p.product === "sessionbus-dsh"
              ? []
              : ["--product", p.product]),
        ],
      });
    }
    await observe("snapshot", "installed", { validate: true, baseline: "before", upgrade: p.operation === "archive" });
    if (p.acceptance) {
      insist(
        (await bus("describe", "describe", { product: p.product, host: p.host })).version === p.version,
        "describe version mismatch",
      );
      await observe("snapshot", "before-open", { baseline: "installed" });
      const opened = await bus("spawn", "spawn", {
        product: p.product,
        host: p.host,
        name: "host-proof",
        open: { cwd: p.packet + "/workspace" },
        notify: false,
      });
      const live = opened.session_id;
      insist(typeof live === "string", "spawn returned no id");
      const idle = await bus("idle", "list", { session_id: live }),
        rows = Array.isArray(idle) ? idle : idle.sessions;
      insist(
        rows?.some((x) => x.session_id === live && x.connected === true && x.running === false),
        "lane not idle",
      );
      const sent = await bus("send", "send", { target: live, message: p.input });
      insist(
        sent.deliveries?.length === 1 &&
          ["written", "injected", "queued_for_next_turn"].includes(sent.deliveries[0].disposition),
        "send uncertain; never replay",
      );
      const record = await bus("collect", "wait", { session_id: live, timeout_ms: 60000 });
      insist(
        record.state === "done" &&
          record.result?.outcome === "completed" &&
          record.result.native_stop_reason === "completed",
        "turn failed; never retry",
      );
      insist(
        typeof record.result.result === "string" &&
          record.result.result.includes(p.answer) &&
          typeof record.run_id === "string",
        "answer/run mismatch",
      );
      await observe("native", "turn", { id: live, baseline: "installed" });
      await bus("ack", "ack", { session_id: live, run_id: record.run_id });
      await bus("close", "close", { session_id: live, forget: true });
      await observe("settled", "after-close", { baseline: "installed" });
      roster(await bus("absent", "list", { session_id: live }, true), live, true);
      liveLanes.delete(live);
      for (const id of p.retained ?? []) {
        await bus("forget-retained", "close", { session_id: id, forget: true });
        roster(await bus("retained-absent", "list", { session_id: id }, true), id, true);
      }
      for (const refusal of p.refusals ?? []) {
        await observe("refusal-state", "before-" + refusal.name, {
          name: refusal.name,
          baseline: "installed",
          initial: true,
        });
        const value = await bus(
          "refuse-" + refusal.name,
          "spawn",
          {
            product: p.product,
            host: p.host,
            name: refusal.name,
            open: { ...refusal.open, cwd: p.packet + "/workspace/" + refusal.name },
            notify: false,
          },
          true,
        );
        insist(
          value.error?.code === -32009 && value.error.message === "spawn_failed",
          "expected one spawn_failed refusal",
        );
        const tail = value.error.data?.stderr_tail;
        insist(Array.isArray(tail) && tail.length === 1, "refusal tail must contain exactly one line");
        insist(tail[0] === refusal.reason, "refusal reason differs from expected text");
        await observe("refusal-state", "after-" + refusal.name, { name: refusal.name, baseline: "installed" });
      }
    }
    await observe("snapshot", "final", { baseline: "installed", validate: true, noWorkers: true });
    await observe("report", "report");
  } catch (error) {
    stopped = { phase, message: String(error?.message ?? error), liveLanes: [...liveLanes] };
  }
  // Sealing is independent of report formatting. No retry or close after a stop.
  if (!ownedPacket) return { packet: p?.packet, result: "STOP", stopped, sealed: false };
  try {
    const seal = await observe("seal", "seal", { stopped });
    return { packet: p.packet, result: stopped ? "STOP" : "PASS", stopped, sealed: true, ...seal };
  } catch (error) {
    return {
      packet: p.packet,
      result: "STOP",
      stopped: stopped ?? { phase: "seal", liveLanes: [...liveLanes] },
      sealed: false,
      sealError: String(error?.message ?? error),
    };
  }
}

// Everything below runs only as a static Node observation command, using the
// packet's immutable source. Full observations never pass through tool stdout.
function local() {
  const fs = require("node:fs"),
    path = require("node:path"),
    crypto = require("node:crypto");
  const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
  const privateFile = (file) => {
    const name = path.basename(file).toLowerCase(),
      directories = path.dirname(file).split(path.sep);
    return (
      directories.some((n) =>
        [".ssh", ".gnupg", "credentials", "credential-store", "secrets", "tokens", "private-keys"].includes(n),
      ) ||
      /^(?:\.npmrc|\.env(?:\..*)?|host\.key|service\.env|environ|id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?)$/u.test(name) ||
      /\.(?:pem|p12|pfx|key)$/u.test(name) ||
      /(?:^|[-_.])(?:credentials?|secrets?|tokens?|private[-_]key)(?:[-_.]|$)/u.test(name)
    );
  };
  const read = (file) => {
    insist(
      !privateFile(file) && !privateFile(fs.realpathSync(file)),
      `credential-bearing file is metadata only: ${file}`,
    );
    return fs.readFileSync(file);
  };
  const meta = (file) => {
    const s = fs.lstatSync(file, { bigint: true });
    return {
      type: s.isDirectory()
        ? "directory"
        : s.isSymbolicLink()
          ? "symlink"
          : s.isFile()
            ? "file"
            : s.isFIFO()
              ? "fifo"
              : "special",
      inode: String(s.ino),
      links: String(s.nlink),
      size: String(s.size),
      mode: Number(s.mode & 0o7777n),
      uid: String(s.uid),
      gid: String(s.gid),
      mtime: String(s.mtimeNs),
      ctime: String(s.ctimeNs),
      ...(s.isSymbolicLink() ? { link: fs.readlinkSync(file) } : {}),
    };
  };
  const facts = (file) => ({ ...meta(file), ...(privateFile(file) ? {} : { sha256: hash(read(file)) }) });
  const put = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      file,
      typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  };
  const json = (file) => JSON.parse(read(file));
  function tree(root, metadataOnly = false) {
    const bytes = {},
      metadata = {};
    function walk(file, name) {
      const m = (metadata[name] = meta(file));
      // Shared-store link/ctime churn is recorded, but is not a write to an unopened leaf.
      const { type, size, mode, uid, gid, mtime, inode } = m;
      if (m.type === "directory") {
        for (const n of fs.readdirSync(file).sort()) walk(path.join(file, n), name ? name + "/" + n : n);
      } else
        bytes[name] =
          m.type === "symlink"
            ? { link: m.link }
            : m.type !== "file" || metadataOnly || privateFile(file)
              ? { metadataOnly: { type, size, mode, uid, gid, mtime, inode } }
              : { sha256: hash(read(file)) };
    }
    walk(root, "");
    return { bytes, metadata };
  }
  function rows(file, importer) {
    const yaml = require("node:module").createRequire(fs.realpathSync(importer))("js-yaml");
    const body = read(file).toString("utf8"),
      offset = body.startsWith("\uFEFF") ? 1 : 0,
      nodes = new Map(),
      stack = [];
    const schema = yaml.JSON_SCHEMA.extend(
      new yaml.Type("tag:yaml.org,2002:js", { kind: "scalar", construct: (value) => ({ inert: value }) }),
    );
    let data;
    try {
      data = yaml.load(body.slice(offset), {
        schema,
        onWarning: () => {},
        listener(event, state) {
          if (event === "open") {
            stack.push({ start: state.position + offset, children: [] });
            return;
          }
          const node = Object.assign(stack.pop(), {
            end: state.position + offset,
            kind: state.kind,
            value: state.result,
          });
          stack.at(-1)?.children.push(node);
          if (node.value && typeof node.value === "object" && node.kind !== "scalar") {
            const old = nodes.get(node.value);
            if (!old || node.end < old.end || (node.kind === "mapping" && node.children.length > old.children.length))
              nodes.set(node.value, node);
          }
        },
      });
    } catch {
      throw new Error("cannot silently parse profile patch");
    }
    insist(Array.isArray(data), "patch must be an array");
    const start = (n) => {
      const s = body.slice(n.start, n.end).search(/\S/u);
      return s < 0 ? n.end : n.start + s;
    };
    // Same tokenEnd/rowSpan boundaries as install.mjs:156-162,249-253,
    // copied read-only because its CLI does not export them. Never dump YAML.
    const end = (n) =>
      n.kind === null
        ? n.start + /^[ \t]*(?:\*[^\s,\[\]{}]+)?/u.exec(body.slice(n.start, n.end))[0].length
        : n.children.length &&
            ((n.kind === "mapping" && body[start(n)] !== "{") || (n.kind === "sequence" && body[start(n)] !== "["))
          ? Math.max(...n.children.map(end))
          : n.start + body.slice(n.start, n.end).trimEnd().length;
    const result = [];
    function visit(list) {
      for (const row of list) {
        const node = nodes.get(row);
        insist(node, "patch row has no source position");
        const begin = Math.max(offset, body.lastIndexOf("\n", start(node) - 1) + 1),
          newline = body.indexOf("\n", end(node) - 1),
          finish = newline < 0 ? body.length : newline + 1;
        result.push({ row, node, begin, finish, bytes: body.slice(begin, finish) });
        if (Array.isArray(row.insert)) visit(row.insert);
        if (row.group && Array.isArray(row.config)) visit(row.config);
      }
    }
    visit(data);
    return { body, result };
  }
  function patch(file, importer) {
    const parsed = rows(file, importer),
      spans = parsed.result;
    const owned = [];
    // Copy the installer's comment discipline too: marker-looking quoted text
    // is not ownership, and a marked insert does not own its unmarked children.
    function comment(line) {
      let quote;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote === '"' && c === "\\") {
          i++;
          continue;
        }
        if (quote === "'" && c === "'" && line[i + 1] === "'") {
          i++;
          continue;
        }
        if (quote) {
          if (c === quote) quote = undefined;
        } else if (c === "'" || c === '"') quote = c;
        else if (c === "#" && (i === 0 || /\s/u.test(line[i - 1]))) return line.slice(i);
      }
      return "";
    }
    for (const span of spans)
      for (let i = 0; i < span.node.children.length; i += 2) {
        const key = span.node.children[i];
        if (!["id", "insert"].includes(key.value)) continue;
        const begin = parsed.body.lastIndexOf("\n", key.start - 1) + 1,
          newline = parsed.body.indexOf("\n", key.start),
          finish = newline < 0 ? parsed.body.length : newline + 1;
        if (comment(parsed.body.slice(begin, finish)).includes("# sessionbus-dsh-install owned"))
          owned.push(key.value === "id" ? span : { begin, finish });
      }
    let outside = parsed.body;
    for (const x of [...owned].sort((a, b) => b.begin - a.begin))
      outside = outside.slice(0, x.begin) + outside.slice(x.finish);
    return {
      file: facts(file),
      outside: hash(outside),
      owners: spans
        .filter((x) => ["llm-pi-ai", "agent-default-model"].includes(x.row.id))
        .map((x) => ({ id: x.row.id, sha256: hash(x.bytes) })),
    };
  }
  function native(events, input, answer, route) {
    const users = events.filter((x) => x.type === "user/message"),
      relay = users.filter((x) => x.data.source?.kind === "plugin:sessionbus-dsh" && x.data.source.form === "relay");
    const starts = events.filter((x) => x.type === "turn/start"),
      ends = events.filter((x) => x.type === "turn/end"),
      headers = events.filter((x) => x.type === "request/header");
    insist(
      relay.length === 1 &&
        relay[0].data.content
          .filter((x) => x.type === "text")
          .map((x) => x.text)
          .join("")
          .split(input).length === 2,
      "exactly one attributable relay input required",
    );
    insist(
      starts.length === 1 &&
        ends.length === 1 &&
        ends[0].data.reason.kind === "completed" &&
        starts[0].data.turn === ends[0].data.turn,
      "one completed native turn required",
    );
    insist(
      events.indexOf(starts[0]) < events.indexOf(relay[0]) && events.indexOf(relay[0]) < events.indexOf(ends[0]),
      "relay not bound inside turn",
    );
    insist(
      headers.length === 1 && events.every((x) => x.type !== "model/selection"),
      "one header and no selection required",
    );
    const selected = headers[0].data.header.config;
    for (const key of ["provider", "model", "reasoningEffort"])
      insist(selected[key] === route[key], "native request changed profile default");
    insist(
      JSON.stringify(events.filter((x) => x.type === "assistant/message")).includes(answer),
      "answer missing from native log",
    );
    return {
      relay: relay.length,
      userSources: users.map((x) => x.data.source?.kind ?? "absent"),
      turns: starts.length,
      defaultRouteHash: hash(JSON.stringify(route)),
    };
  }
  return { fs, path, hash, read, meta, facts, put, json, tree, rows, patch, native, privateFile };
}

async function captureCommand(p, label, argv, milliseconds) {
  const { fs, path, put, read, hash } = local(),
    { spawn } = require("node:child_process");
  const group = await import(require("node:url").pathToFileURL(path.join(p.packet, "proof-process-group.mjs")).href);
  const base = path.join(p.packet, label);
  put(base + ".request.json", {
    argv,
    cwd: p.packet,
    at: new Date().toISOString(),
    milliseconds: milliseconds ?? null,
    environmentNames: ["DSH_HOME"],
    environmentSource: "parameters.dshHome",
  });
  const stdout = fs.openSync(base + ".stdout", "wx", 0o600),
    stderr = fs.openSync(base + ".stderr", "wx", 0o600);
  beforeCommand ??= group.installInterruptCleanup(commandChildren);
  beforeCommand();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: p.packet,
    env: { ...process.env, DSH_HOME: p.dshHome },
    detached: true,
    stdio: ["ignore", stdout, stderr],
  });
  commandChildren.add(child);
  child.once("exit", () => {
    child.hasEnded = true;
    commandChildren.delete(child);
  });
  child.ended = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const stop = (signal) => {
    if (!child.hasEnded) group.signalOwnedGroup(child, signal);
  };
  const bound = milliseconds ? setTimeout(() => stop("SIGTERM"), milliseconds) : undefined;
  const hard = milliseconds ? setTimeout(() => stop("SIGKILL"), milliseconds + 5000) : undefined;
  let result, error;
  try {
    result = await child.ended;
    clearTimeout(bound);
    clearTimeout(hard);
    const end = Date.now() + 1000; // Observation-only drain; no signal after the parent's exit.
    while (!group.emptyGroup(child) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 25));
    group.assertEmptyGroup(child);
  } catch (e) {
    error = e;
  } finally {
    clearTimeout(bound);
    clearTimeout(hard);
    if (child.pid && !child.hasEnded) {
      try {
        await group.stopOwnedChild(child, child.pid, true);
      } catch (e) {
        error ??= e;
      }
    }
    commandChildren.delete(child);
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    put(base + ".exit.json", {
      ...result,
      error: error ? String(error) : null,
      at: new Date().toISOString(),
      stdoutSha256: hash(read(base + ".stdout")),
      stderrSha256: hash(read(base + ".stderr")),
    });
  }
  insist(!error && result?.code === 0 && !result.signal, `${label}: command or owned-group failure`);
  return base + ".stdout";
}
const commandChildren = new Set();
let beforeCommand;

async function observation(kind, p, label, extra, system = nativeSystem) {
  const { fs, path, hash, read, facts, meta, put, json, tree, patch, rows, native } = local();
  const out = (name) => path.join(p.packet, name),
    importer = path.join(p.profileDir, "node_modules/@sessionbus/dsh/package.json"),
    patchFile = path.join(p.profileDir, "cordis.patch.yml");
  function packageMap(root) {
    const map = {};
    function walk(dir, prefix = "") {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name === "node_modules") continue;
        const name = prefix + e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), name + "/");
        else {
          insist(e.isFile(), "package content must be regular");
          map[name] = hash(read(path.join(dir, e.name)));
        }
      }
    }
    walk(root);
    return map;
  }
  function snap() {
    const manifest = read(path.join(p.profileDir, "package.json")),
      lock = read(path.join(p.profileDir, "pnpm-lock.yaml"));
    const protectedMaps = p.protected.map((entry, index) => {
      const value = tree(entry.path, entry.metadataOnly),
        file = out(`${label}-protected-${index}.json`);
      put(file, value);
      return { file, sha256: hash(read(file)), entries: Object.keys(value.metadata).length };
    });
    for (const [name, bytes] of [
      ["manifest", manifest],
      ["lock", lock],
    ])
      put(out(`${label}-${name}`), bytes);
    const manager = tree(path.join(p.profileDir, ".plugin-manager")),
      profile = tree(p.profileDir);
    put(out(`${label}-profile.json`), profile);
    put(out(`${label}-manager.json`), manager);
    const records = {};
    for (const name of ["node_modules/.modules.yaml", "node_modules/.pnpm-workspace-state-v1.json", "cordis.yml"]) {
      const file = path.join(p.profileDir, name);
      if (!fs.existsSync(file)) continue;
      let keys, builds;
      if (name.endsWith(".json")) {
        const value = json(file);
        keys = [];
        const visit = (entry, prefix = "") => {
          for (const k of Object.keys(entry).sort()) {
            const name = prefix + k;
            keys.push(name);
            if (entry[k] && typeof entry[k] === "object" && !Array.isArray(entry[k])) visit(entry[k], name + ".");
          }
        };
        visit(value);
      } else if (name.endsWith(".yaml")) {
        const yaml = require("node:module").createRequire(fs.realpathSync(importer))("js-yaml"),
          value = yaml.load(read(file).toString(), { onWarning: () => {} });
        keys = Object.keys(value).sort();
        builds = {
          packageManager: value.packageManager,
          ignoredBuilds: value.ignoredBuilds ?? null,
          pendingBuilds: value.pendingBuilds ?? null,
        };
      }
      // Open schema: capture, never assume a summary lists every key.
      records[name] = { ...facts(file), keys, builds };
    }
    const result = {
      manifest: hash(manifest),
      lock: hash(lock),
      patch: patch(patchFile, importer),
      files: packageMap(path.dirname(fs.realpathSync(importer))),
      protectedMaps,
      records,
      ...system.processes(p),
      managerHash: hash(JSON.stringify(manager.bytes)),
      profileMap: out(`${label}-profile.json`),
    };
    if (fs.existsSync(path.join(p.profileDir, "node_modules/.bin")))
      put(out(`${label}-bins.json`), tree(path.join(p.profileDir, "node_modules/.bin")));
    put(out(`${label}.snapshot.json`), result);
    return result;
  }
  function equal(a, b, what) {
    insist(JSON.stringify(a) === JSON.stringify(b), what);
  }
  function compare(current, previous, upgrade) {
    equal(current.processes, previous.processes, "protected process identity changed");
    current.protectedMaps.forEach((map, i) => {
      const a = json(map.file),
        b = json(previous.protectedMaps[i].file);
      const changed = Object.keys({ ...a.bytes, ...b.bytes }).filter(
        (n) => JSON.stringify(a.bytes[n]) !== JSON.stringify(b.bytes[n]),
      );
      insist(changed.length === 0, `protected bytes/links changed: ${p.protected[i].path}: ${changed.join(", ")}`);
      put(
        out(`${label}-metadata-${i}.json`),
        Object.keys(a.metadata)
          .filter((n) => JSON.stringify(a.metadata[n]) !== JSON.stringify(b.metadata[n]))
          .map((n) => ({ path: n, before: b.metadata[n], after: a.metadata[n] })),
      );
    });
    equal(current.patch.owners, previous.patch.owners, "owner row bytes changed");
    if (upgrade && current.files["install.mjs"] !== previous.files["install.mjs"])
      equal(current.patch.outside, previous.patch.outside, "bytes outside marked rows changed");
    else equal(current.patch, previous.patch, "patch hash/inode/mtime changed");
    if (extra.baseline === "installed") {
      for (const key of ["manifest", "lock", "files", "managerHash"])
        equal(current[key], previous[key], `installed ${key} changed`);
      const a = json(current.profileMap),
        b = json(previous.profileMap),
        changed = Object.keys({ ...a.bytes, ...b.bytes }).filter(
          (n) => JSON.stringify(a.bytes[n]) !== JSON.stringify(b.bytes[n]),
        );
      equal(changed, [], "profile bytes changed during native proof");
      put(
        out(`${label}-profile-metadata.json`),
        Object.keys(a.metadata)
          .filter((n) => JSON.stringify(a.metadata[n]) !== JSON.stringify(b.metadata[n]))
          .map((n) => ({ path: n, before: b.metadata[n], after: a.metadata[n] })),
      );
    } else {
      const a = json(current.profileMap),
        b = json(previous.profileMap),
        names = Object.keys({ ...a.metadata, ...b.metadata }).sort();
      put(
        out(`${label}-install-delta.json`),
        names
          .filter(
            (n) =>
              JSON.stringify(a.bytes[n]) !== JSON.stringify(b.bytes[n]) ||
              JSON.stringify(a.metadata[n]) !== JSON.stringify(b.metadata[n]),
          )
          .map((n) => ({
            path: n,
            bytesChanged: JSON.stringify(a.bytes[n]) !== JSON.stringify(b.bytes[n]),
            before: b.metadata[n],
            after: a.metadata[n],
          })),
      );
    }
  }
  if (kind === "boot") {
    validate(p);
    insist(!fs.existsSync(p.packet), "packet already exists: never resume a run");
    const source = read(__filename);
    insist(
      typeof extra.source === "string" && hash(extra.source) === hash(source),
      "executing source differs from copied source",
    );
    fs.mkdirSync(p.packet, { recursive: true, mode: 0o700 });
    put(out("prove-host.cjs"), source);
    put(out("running-source.json"), { sha256: hash(source), at: new Date().toISOString() }); // First capture.
    const helper = path.join(path.dirname(__filename), "proof-process-group.mjs"),
      bytes = read(helper);
    put(out("proof-process-group.mjs"), bytes);
    put(out("helper-source.json"), { sha256: hash(bytes) });
    // Explicit DSH data-home operand, not an inferred CLI install location. The
    // public DSH_HOME choice must address the same profile we observe.
    insist(fs.statSync(p.profileDir).isDirectory(), "profile directory missing");
    put(out("parameters.json"), p);
    fs.mkdirSync(out("workspace"));
    const references = (p.references ?? []).map((reference) => {
      insist(hash(read(reference.file)) === reference.sha256, "sealed evidence reference changed");
      return reference;
    });
    put(out("references.json"), references); // Hash anchors only; never rerun or import old calls.
    insist(hash(read(p.archive)) === p.archiveSha256, "archive checksum mismatch");
    const selected = selectExecutable(p.dsh[0], p.packet);
    insist(selected && selectExecutable(p.zstd, p.packet), "required executable not found");
    await system.command(p, "unpack", ["tar", "-xzf", p.archive, "-C", p.packet], 10000);
    const candidate = path.join(p.packet, "package"),
      files = packageMap(candidate);
    insist(json(path.join(candidate, "package.json")).version === p.version, "archive version mismatch");
    put(out("candidate.json"), {
      files,
      integrity: "sha512-" + require("node:crypto").createHash("sha512").update(read(p.archive)).digest("base64"),
    });
    const version = await system.command(p, "dsh-version", [...p.dsh, "--version"]); // Cold npx may acquire packages.
    put(out("executable.json"), { argv: p.dsh, executable: fs.realpathSync(selected), ...facts(selected) });
    return {
      sourceSha256: hash(source),
      dshVersion: read(version).toString().trim(),
      packedFiles: Object.keys(files).length,
    };
  }
  if (kind === "command") {
    // Rows-only local work is normally subsecond; 60 s allows a loaded host.
    // A timed-out mutation still stops, with atomic-file guarantees, never retry.
    await system.command(p, label, extra.argv, label === "install" ? 60000 : undefined);
    return { command: label };
  }
  if (kind === "snapshot" || kind === "settled" || kind === "native" || kind === "refusal-state") {
    if (kind === "settled") await system.settle(6500);
    const current = snap();
    if (extra.baseline) compare(current, json(out(extra.baseline + ".snapshot.json")), extra.upgrade);
    if (kind === "settled" || kind === "refusal-state" || extra.noWorkers)
      insist(current.workers === 0, "worker still present");
    if (kind === "refusal-state") {
      const cwd = out("workspace/" + extra.name);
      if (extra.initial) fs.mkdirSync(cwd, { recursive: true });
      const key = "--" + cwd.replace(/^\/+/, "").replace(/\/+/gu, "-").slice(0, 251) + "--",
        directory = path.join(p.sessionsDir, key);
      const names = fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
      put(out(`${label}-session-names.json`), { directory, names });
      insist(names.length === 0, "refused Open left a native session directory");
    }
    if (extra.validate) {
      const manifest = json(out(`${label}-manifest`)),
        candidate = json(out("candidate.json"));
      equal(current.files, candidate.files, "installed files differ from proven archive");
      const spec = manifest.dependencies?.["@sessionbus/dsh"];
      insist(
        p.operation === "registry"
          ? spec === p.version
          : spec === p.version ||
              (typeof spec === "string" &&
                spec.startsWith("file:") &&
                fs.realpathSync(path.resolve(p.profileDir, spec.slice(5))) === fs.realpathSync(p.archive)),
        "manifest candidate reference mismatch",
      );
      const lock = read(out(`${label}-lock`)).toString();
      const yaml = require("node:module").createRequire(fs.realpathSync(importer))("js-yaml"),
        parsed = yaml.load(lock, { onWarning: () => {} });
      const records = Object.entries(parsed.packages ?? {}).filter(
        ([name]) =>
          name.startsWith("@sessionbus/dsh@") &&
          (p.operation !== "registry" || name === `@sessionbus/dsh@${p.version}`),
      );
      insist(
        records.some(([, value]) => value.resolution?.integrity === candidate.integrity),
        "lock candidate integrity mismatch",
      );
      if (p.operation === "registry") {
        const tokens = [p.archive, path.basename(p.archive)],
          files = [out(`${label}-manifest`), out(`${label}-lock`)];
        const walk = (dir) => {
          for (const n of fs.readdirSync(dir)) {
            const f = path.join(dir, n);
            if (fs.lstatSync(f).isDirectory()) walk(f);
            else if (fs.lstatSync(f).isFile()) files.push(f);
          }
        };
        walk(path.join(p.profileDir, ".plugin-manager"));
        for (const file of files)
          insist(
            tokens.every((token) => !read(file).includes(Buffer.from(token))),
            `old archive reference remains: ${file}`,
          );
      }
    }
    if (kind !== "native")
      return { workers: current.workers, patch: current.patch.file, manifest: current.manifest, lock: current.lock };
    // Alpha.2 persistence:870-896 projectKey, copied for ASCII proof cwd only;
    // the published package has no export for this key. Native files are read only.
    const cwd = out("workspace"),
      key = "--" + cwd.replace(/^\/+/, "").replace(/\/+/gu, "-").slice(0, 251) + "--";
    const dir = path.join(p.sessionsDir, key, extra.id.split("@")[0]);
    const source = path.join(dir, "session.v4.jsonl.zstd");
    put(out("native-session.v4.jsonl.zstd"), read(source));
    const decoded = await system.command(p, "decode", [p.zstd, "-dc", out("native-session.v4.jsonl.zstd")], 10000),
      body = read(decoded).toString();
    insist(body.endsWith("\n"), "native log is not settled");
    const events = body
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line)),
      defaults = rows(patchFile, importer).result.find((x) => x.row.id === "agent-default-model")?.row.config;
    insist(
      typeof defaults?.provider === "string" && typeof defaults.model === "string",
      "literal owner default required for this proof",
    );
    return native(events, p.input, p.answer, defaults);
  }
  if (kind === "report") {
    const final = json(out("final.snapshot.json"));
    put(out("REPORT.json"), {
      operation: p.operation,
      acceptance: p.acceptance,
      profile: p.profile,
      mode: p.mode,
      result: "PASS",
      patch: final.patch.file,
      references: json(out("references.json")),
      limits: [
        "Profile proof only; without acceptance no fresh native lane/runtime observation is claimed.",
        "Protected ordinary metadata changes are reported, not hidden; credential files are metadata-only.",
        "An unopened file written in place with the same size and restored mtime is not detected; " +
          "link count and ctime changes are recorded, not equality requirements.",
        "No retries or cleanup of native session/cache history; stopped lanes follow native policy.",
      ],
    });
    return { report: "REPORT.json" };
  }
  if (kind === "seal") {
    if (extra.stopped) put(out("STOP.json"), extra.stopped);
    const files = [],
      walk = (dir) => {
        for (const n of fs.readdirSync(dir).sort()) {
          const f = path.join(dir, n);
          if (fs.lstatSync(f).isDirectory()) walk(f);
          else if (fs.lstatSync(f).isFile()) files.push(f);
        }
      };
    walk(p.packet);
    const body = files.map((file) => `${hash(read(file))}  ${path.relative(p.packet, file)}`).join("\n") + "\n";
    put(out("MANIFEST.sha256"), body);
    return { manifestSha256: hash(body), entries: files.length };
  }
  throw new Error("unknown observation");
}
function selectExecutable(file, cwd) {
  const { fs, path } = local();
  const candidates = file.includes("/")
    ? [path.resolve(cwd, file)]
    : (process.env.PATH ?? "").split(path.delimiter).map((dir) => path.resolve(cwd, dir, file));
  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}
const nativeSystem = {
  command: captureCommand,
  settle: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  processes(p) {
    const { fs, read, hash } = local();
    const processes = [p.ownerPid, p.daemonPid].filter(Boolean).map((pid) => {
      const stat = read(`/proc/${pid}/stat`).toString(),
        tail = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      return { pid, start: tail[19], commandHash: hash(read(`/proc/${pid}/cmdline`)) };
    });
    let workers = 0;
    for (const id of fs.readdirSync("/proc").filter((x) => /^\d+$/u.test(x))) {
      if (Number(id) === process.pid || Number(id) === p.ownerPid) continue;
      let args;
      try {
        args = read(`/proc/${id}/cmdline`).toString().split("\0");
      } catch (error) {
        if (["ENOENT", "EACCES", "ESRCH"].includes(error.code)) continue;
        throw error;
      }
      if (args.some((arg, i) => arg === `--profile=${p.profile}` || (arg === "--profile" && args[i + 1] === p.profile)))
        workers++;
    }
    return { processes, workers }; // Hash cmdline only; never environ.
  },
};
async function observeCommand(kind, p, label, extra, system) {
  const { put, hash } = local();
  const existing = require("node:fs").existsSync(p.packet);
  let result;
  try {
    result = { ok: true, facts: await observation(kind, p, label, extra, system) };
  } catch (error) {
    result = { ok: false, error: String(error?.message ?? error) };
  }
  // No file is added after sealing. Other observations have a complete artifact
  // and return only its digest/size plus named facts (never the map or native text).
  const bytes = JSON.stringify(result) + "\n";
  const created = kind === "boot" && !existing && require("node:fs").existsSync(p.packet);
  if (kind !== "seal" && (kind !== "boot" || created)) put(p.packet + "/" + label + ".observation.json", bytes);
  const facts = result.facts ?? {};
  insist(Buffer.byteLength(JSON.stringify(facts)) < 4096, "named facts exceed bound");
  return {
    ok: result.ok,
    ...(kind === "boot" ? { created } : {}),
    sha256: hash(bytes),
    bytes: Buffer.byteLength(bytes),
    facts,
  };
}
async function cli() {
  const [kind, config, label, more] = process.argv.slice(2);
  const result = await observeCommand(kind, JSON.parse(config), label, JSON.parse(more));
  process.stdout.write(JSON.stringify(result) + "\n");
}
if (typeof module !== "undefined") module.exports = { runProof, local, observeCommand, captureCommand };
if (typeof require !== "undefined" && require.main === module)
  cli().catch(() => {
    process.exitCode = 1;
  });
