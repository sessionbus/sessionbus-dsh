import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const [home, work, daemonBin, root] = process.argv.slice(2);
assert.ok(home && work && daemonBin && root, 'usage: prove-session-groups.mjs HOME WORK DAEMON_BIN REPO');
const { connectPeer } = createRequire(path.join(home, 'profiles/web/node_modules/@sessionbus/dsh/plugin.cjs'))('@sessionbus/kit');
const socket = path.join(work, 'groups.sock'), bin = path.join(work, 'groups-bin');
const sessionRoot = path.join(work, 'groups-sessions');
fs.mkdirSync(bin);
fs.symlinkSync(path.join(root, '.github/fixtures/groups-worker/worker.cjs'), path.join(bin, 'w120-worker'));
const cleanEnv = { ...process.env, PATH: `${bin}:${home}/node_modules/.bin:${process.env.PATH}`, W120_WORK: work };
for (const key of Object.keys(cleanEnv)) if (key.startsWith('SESSIONBUS_')) delete cleanEnv[key];
const processes = new Set(), peers = new Set();
const groupResponses = { immediate: 0, progress: 0 };
const run = (command, args, env, label) => {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: work });
  processes.add(child);
  child.output = ''; child.errors = '';
  child.stdout.on('data', chunk => { child.output += chunk; fs.appendFileSync(path.join(work, `${label}.stdout`), chunk); });
  child.stderr.on('data', chunk => { child.errors += chunk; fs.appendFileSync(path.join(work, `${label}.stderr`), chunk); });
  child.once('exit', () => processes.delete(child));
  return child;
};
const stop = async child => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([ended, delay(5000).then(() => { if (processes.has(child)) child.kill('SIGKILL'); })]);
  await ended;
};
// Bounded observation waits are harness-only; native calls and changes are never replayed.
const until = async (read, label) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await read();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`timed out: ${label}`);
};
const attach = async (id, groups, deliveries = []) => {
  const peer = connectPeer({ product: 'w120-observer', session_id: id, groups, info: {} }, async (_signal, value) => {
    deliveries.push(value); return { disposition: 'injected' };
  }, { SESSIONBUS_SOCKET: socket });
  peers.add(peer);
  await Promise.race([peer.ready, delay(5000).then(() => { throw new Error('observer ready timeout'); })]);
  const listed = await peer.caller.list({}, AbortSignal.timeout(5000));
  assert.ok(listed.self_info, 'real daemon admitted identity');
  return peer;
};
const readEvents = id => {
  if (!fs.existsSync(sessionRoot)) return [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /session(?:\.v\d+)?\.jsonl$/u.test(entry.name) ? [file] : [];
  });
  return walk(sessionRoot).flatMap(file => {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    return lines[0]?.id === id ? lines.slice(1) : [];
  });
};
const launchWeb = async label => {
  const child = run(path.join(home, 'node_modules/.bin/dsh'), [
    '--profile', 'web', '--patch', path.join(root, '.github/fixtures/sessionbus-groups.patch.yml'),
    '--no-open', '--host', '127.0.0.1', '--port', '0',
  ], { ...cleanEnv, DSH_HOME: home, SESSIONBUS_SOCKET: socket, SESSIONBUS_GROUPS: '["default"]',
    DSH_SNAPSHOT_FILE: path.join(root, '.github/fixtures/sessionbus-groups.jsonl'), DSH_W081_SESSION_ROOT: sessionRoot }, label);
  const launch = await until(() => {
    if (!processes.has(child)) throw new Error(`web exited: ${child.errors}`);
    return /dsh web: (http:\/\/\S+)/u.exec(child.output)?.[1];
  }, 'web launch URL');
  const login = await fetch(launch, { redirect: 'manual' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie);
  const rpc = async (method, args, signal = AbortSignal.timeout(10000)) => {
    const response = await fetch(`${new URL(launch).origin}/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }), signal,
    });
    const body = await response.json();
    assert.equal(body.result?.ok, true, `${method}: ${JSON.stringify(body)}`);
    return body.result.value;
  };
  const command = async (id, line) => {
    const diagnostics = child.errors.length;
    const execution = await rpc('commands/execute', { agentId: id, line, submittedAttachments: [] });
    assert.equal(execution.result.kind, 'success', JSON.stringify(execution));
    const progress = 'change in progress; `/sessionbus-groups` with no argument shows the result';
    if (execution.result.text !== progress) {
      if (line.startsWith('/sessionbus-groups ')) groupResponses.immediate++;
      return JSON.parse(execution.result.text);
    }
    assert.ok(line.startsWith('/sessionbus-groups '), 'only a groups mutation can report progress');
    groupResponses.progress++;
    const input = line.slice('/sessionbus-groups '.length).trim();
    const wanted = input === '-' ? ['default'] : input.split(',').map(value => value.trim());
    const record = path.join(home, 'storages/sessionbus_groups/groups', `${id}.json`);
    const bound = AbortSignal.timeout(10000);
    // Observe live AND durable state for at most 10s. Never replay the mutation.
    for (;;) {
      bound.throwIfAborted();
      assert.equal(/^sessionbus: /mu.test(child.errors.slice(diagnostics)), false, child.errors.slice(diagnostics));
      const shown = await rpc('commands/execute', { agentId: id, line: '/sessionbus-groups', submittedAttachments: [] }, bound);
      assert.equal(shown.result.kind, 'success', JSON.stringify(shown));
      assert.equal(/^sessionbus: /mu.test(child.errors.slice(diagnostics)), false, child.errors.slice(diagnostics));
      const live = JSON.stringify(JSON.parse(shown.result.text)) === JSON.stringify(wanted);
      const durable = input === '-' ? !fs.existsSync(record)
        : fs.existsSync(record) && JSON.stringify(JSON.parse(fs.readFileSync(record)).record) === JSON.stringify(wanted);
      if (live && durable) return wanted;
      await delay(50, undefined, { signal: bound });
    }
  };
  return { child, rpc, command };
};

try {
  const daemon = run(daemonBin, ['-socket', socket, '-table', path.join(work, 'groups-table.json'), '-host', 'w120', '-products', 'w120-worker'], {
    ...cleanEnv, XDG_STATE_HOME: path.join(work, 'groups-state'),
  }, 'groups-daemon');
  await until(() => fs.existsSync(socket), 'isolated released daemon socket');
  const observer = await attach('observer', ['default', 'one', 'two', 'after']);
  let web = await launchWeb('groups-web');
  const first = (await web.rpc('session/create', { request: {} })).sessionId;
  const second = (await web.rpc('session/create', { request: {} })).sessionId;
  await until(async () => (await observer.caller.list()).sessions.filter(row => [first, second].includes(row.session_id.split('@')[0])).length === 2, 'two published roots');
  assert.deepEqual(await web.command(first, '/sessionbus-groups one'), ['one']);
  assert.deepEqual(await web.command(second, '/sessionbus-groups two'), ['two']);
  for (const [id, declared] of [[first, 'one'], [second, 'two']]) {
    const row = (await observer.caller.list()).sessions.find(row => row.session_id.split('@')[0] === id);
    assert.equal(row.product, 'dsh');
    assert.deepEqual(row.groups, [declared, `session:${row.session_id}`]);
  }
  const oldGroup = await attach('old-group-observer', ['one']);
  const newGroup = await attach('new-group-observer', ['after']);
  const visible = async peer => (await peer.caller.list()).sessions.some(row => row.session_id.split('@')[0] === first);
  assert.equal(await visible(oldGroup), true);
  assert.equal(await visible(newGroup), false);
  const stored = id => path.join(home, 'storages/sessionbus_groups/groups', `${id}.json`);
  assert.deepEqual(JSON.parse(fs.readFileSync(stored(first))).record, ['one']);
  assert.deepEqual(JSON.parse(fs.readFileSync(stored(second))).record, ['two']);
  const zod = await web.command(first, '/w120-zod');
  console.log(`producer/plugin zod ${zod.version} equal; producer=${zod.producerZod}; plugin=${zod.actual}: PASS`);

  const tool = (id, action, args) => web.command(id, `/w120-call ${JSON.stringify({ action, arguments: args })}`);
  const owned = await tool(first, 'spawn', { product: 'w120-worker', name: 'overlap', open: {}, auto_close_ms: 0 });
  assert.equal(owned.policy.persistent, false);
  const gate = path.join(work, 'release-owned');
  const reference = await tool(first, 'start', { session_id: owned.session_id, input: gate });
  assert.deepEqual(await web.command(first, '/sessionbus-groups after'), ['after']);
  assert.equal(await visible(oldGroup), false, 'replaces, never merges, prior declared groups');
  assert.equal(await visible(newGroup), true);
  const self = (await tool(first, 'list', {})).self_info;
  assert.deepEqual(self.groups, ['after', `session:${self.session_id}`]);
  assert.equal(self.session_id.split('@')[0], first);
  const direct = await observer.caller.send({ target: self.session_id, message: 'W120_DIRECT_AFTER_SWAP' });
  assert.equal(direct.deliveries[0].disposition, 'injected', JSON.stringify(direct));
  fs.writeFileSync(gate, 'release');
  const terminal = await tool(first, 'wait', { ...reference, timeout_ms: 10000 });
  assert.equal(terminal.state, 'done');
  assert.equal(terminal.result.outcome, 'completed');
  assert.equal(terminal.result.result, 'W120_OWNED_RESULT');
  await tool(first, 'ack', reference);
  await web.rpc('session/selectModel', { request: { sessionId: first, provider: 'deepseek-official', model: 'deepseek-v4-flash' } });
  await web.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId: first, mode: 'queue', content: [{ type: 'text', text: 'W120_NATIVE_MODEL_REFUSAL' }] } });
  const events = await until(() => { const events = readEvents(first); return events.some(event => event.type === 'turn/end') && events; }, 'model refusal turn');
  assert.ok(events.some(event => event.type === 'tool/call' && event.data.name === 'sessionbus-groups'));
  assert.ok(events.some(event => event.type === 'tool/result' && JSON.stringify(event).includes('UNKNOWN_TOOL')));
  assert.ok(events.some(event => event.type === 'user/message' && JSON.stringify(event).includes('W120_DIRECT_AFTER_SWAP')));
  assert.ok(events.some(event => event.type === 'user/message' && JSON.stringify(event).includes('W120_CHILD_DIRECT_AFTER_SWAP')), 'child sharing only the private group addresses the same session id');
  assert.ok(events.some(event => event.type === 'user/message' && JSON.stringify(event).includes(reference.run_id)), 'completion pointer reaches new attachment');
  assert.deepEqual(await web.command(first, '/sessionbus-groups'), ['after']);
  assert.deepEqual(JSON.parse(fs.readFileSync(stored(first))).record, ['after']);
  await tool(first, 'close', { session_id: owned.session_id, forget: true });
  console.log('native web two roots; replacement, model refusal, direct session message, owned lane result and completion pointer: PASS');

  // Negative control: detaching first must retire the non-persistent child.
  const negative = await attach('detach-control', ['default']);
  const lost = await negative.caller.spawn({ product: 'w120-worker', name: 'detach-control', open: {}, auto_close_ms: 0 });
  negative.shutdown();
  const replacement = await attach('detach-control', ['after']);
  await assert.rejects(replacement.caller.status({ session_id: lost.session_id }), error => [-32001, -32002, -32010].includes(error.code));
  console.log('detach-first non-persistent ownership loss negative control: PASS');

  await stop(web.child);
  web = await launchWeb('groups-web-resumed');
  // Native lookup resumes each exact root; it does not create a new id or seed it from a parent.
  for (const sessionId of [first, second]) await web.rpc('session/selectModel', { request: { sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash' } });
  assert.deepEqual(await web.command(first, '/sessionbus-groups'), ['after']);
  assert.deepEqual(await web.command(second, '/sessionbus-groups'), ['two']);
  assert.deepEqual(await web.command(first, '/sessionbus-groups -'), ['default']);
  assert.equal(fs.existsSync(stored(first)), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(stored(second))).record, ['two']);
  console.log('native process restart/resume reads separate records; reset deletes only selected override: PASS');
  await stop(web.child);

  // Well-formed native record, invalid plugin-owned value: strict activation refusal, no fallback.
  const invalid = { version: 1, record: ['invalid', 'invalid'] };
  fs.writeFileSync(stored(second), JSON.stringify(invalid));
  const bad = run(path.join(home, 'node_modules/.bin/dsh'), ['--profile', 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
    ...cleanEnv, DSH_HOME: home, SESSIONBUS_SOCKET: socket,
  }, 'groups-invalid-record');
  await until(() => !processes.has(bad), 'invalid record refuses profile');
  assert.equal(bad.exitCode, 1, bad.errors);
  assert.equal(bad.errors, `sessionbus: domain 'sessionbus_groups': stored record '${second}' in table 'groups' does not match its schema\n`);
  assert.deepEqual(JSON.parse(fs.readFileSync(stored(second))), invalid, 'invalid state never rewritten or skipped');
  console.log('invalid stored table/key refuses activation unchanged: PASS');
  await stop(daemon);
} finally {
  console.log(`group command responses: immediate=${groupResponses.immediate} progress=${groupResponses.progress}; observation bound=10000ms`);
  for (const peer of peers) peer.shutdown();
  await Promise.all([...processes].map(stop));
}
