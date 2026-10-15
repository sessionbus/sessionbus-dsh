import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { assertEmptyGroup, signalOwnedGroup, stopOwnedChild, installInterruptCleanup } from './proof-process-group.mjs';

const [work, cli, home, archive, repo] = process.argv.slice(2);
assert.equal(process.argv.length, 7, 'usage: prove-stock-peers.mjs WORK DSH_BIN DSH_HOME ARCHIVE REPO');
fs.mkdirSync(work, { recursive: true });
const require = createRequire(fs.realpathSync(path.join(repo, 'package.json')));
const yaml = require('js-yaml');
const schema = yaml.JSON_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', construct: value => ({ expression: value }),
}));
const children = new Set(), beforeSpawn = installInterruptCleanup(children);
const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-w150-'));
const socket = path.join(socketDir, 'bus.sock');
const env = { ...process.env, DSH_HOME: home, SESSIONBUS_SOCKET: socket, SESSIONBUS_GROUPS: '["stock-peer-proof"]' };
delete env.SESSIONBUS_LAUNCH_TOKEN;
const captures = [], wire = [], streams = new Set();
const save = () => fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify({ captures, wire }, null, 2) + '\n');
function walk(value, visit, disabled = false) {
  if (!value || typeof value !== 'object') return;
  const off = disabled || value.disabled === true; visit(value, off);
  for (const child of Object.values(value)) walk(child, visit, off);
}
async function run(args, label, native = false) {
  beforeSpawn();
  const child = spawn(cli, args, { cwd: work, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; fs.appendFileSync(path.join(work, label + '.stdout'), c); });
  child.stderr.on('data', c => { stderr += c; fs.appendFileSync(path.join(work, label + '.stderr'), c); });
  const end = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); });
  });
  const ms = args.includes('add') ? 180000 : 30000;
  const soft = setTimeout(() => signalOwnedGroup(child, 'SIGTERM'), ms);
  const hard = setTimeout(() => signalOwnedGroup(child, 'SIGKILL'), ms + 5000);
  try {
    const result = await end;
    captures.push({ label, argv: [cli, ...args], ...result }); save();
    assert.deepEqual(result, { code: 0, signal: null }, label + ': ' + stderr);
    assertEmptyGroup(child); children.delete(child);
    if (native) assert.equal(/sessionbus pending/u.test(stderr), false, 'a pending plugin is not runtime success');
    return stdout;
  } finally { clearTimeout(soft); clearTimeout(hard); }
}
const server = net.createServer(stream => {
  streams.add(stream); stream.on('close', () => streams.delete(stream));
  stream.on('error', () => {});
  let buffer = '', pendingList;
  stream.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const at = buffer.indexOf('\n'); if (at < 0) return;
      const frame = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
      wire.push(frame); save();
      const send = value => stream.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
      if (frame.method === 'session.hello') send({ id: frame.id, result: {} });
      else if (frame.method === 'session.list') {
        pendingList = frame.id;
        send({ id: 150, method: 'message.deliver', params: { message_id: 'stock-peer-delivery',
          from: { session_id: 'fixture-sender', product: 'dsh', groups: ['stock-peer-proof'] }, body: 'W150_INBOUND' } });
      } else if (frame.id === 150) {
        send({ id: pendingList, result: { sessions: [] } });
      }
    }
  });
});
let primary;
try {
  for (const profile of ['acp', 'headless', 'sdk']) {
    await run(['plugin', '--profile', profile, 'add', '--save-exact', archive], profile + '-add');
    const patch = path.join(home, 'profiles', profile, 'cordis.patch.yml');
    const before = fs.readFileSync(patch, 'utf8');
    await run(['plugin', '--profile', profile, 'exec', 'sessionbus-dsh-install', '--product', 'dsh', profile], profile + '-exec');
    const after = fs.readFileSync(patch, 'utf8');
    const stock = yaml.load(before);
    assert.deepEqual(stock, [], 'this case starts from the empty stock override, not a manufactured profile');
    const dump = await run(['--profile', profile, '--dump-config'], profile + '-dump');
    const plugins = [], controllers = [];
    walk(yaml.load(dump, { schema }), (row, disabled) => {
      if (row.name === '@sessionbus/dsh') plugins.push({ row, disabled });
      if (row.name === '@deepseek-ai/dsh-api-session-controller' && !disabled) controllers.push(row);
    });
    assert.equal(controllers.length, 0, profile + ': test must not add a controller to make the plugin work');
    assert.equal(plugins.length, 1); assert.equal(plugins[0].disabled, false);
    assert.equal(plugins[0].row.config.product, 'dsh');
    await run(['plugin', '--profile', profile, 'exec', 'sessionbus-dsh-install', '--product', 'dsh', profile], profile + '-idempotent-exec');
    assert.equal(fs.readFileSync(patch, 'utf8'), after);
    console.log('stock ' + profile + ': ordinary add/exec, composition without controller, owner bytes and idempotence: PASS');
  }
  const version = JSON.parse(fs.readFileSync(path.join(home, 'node_modules/@deepseek-ai/dsh/package.json'))).version;
  await run(['plugin', '--profile', 'headless', 'add', '--save-exact', '@deepseek-ai/dsh-llm-replay@' + version], 'headless-replay-fixture');
  const lines = fs.readFileSync(path.join(repo, '.github/fixtures/sessionbus-tool-call.jsonl'), 'utf8').trim().split('\n');
  // Retain its recorded list tool call, then a recorded final text; no real provider.
  const records = [lines[0], ...lines.slice(1, 5), ...lines.slice(8, 12)].map(line => JSON.parse(line));
  for (const [i, record] of records.entries()) {
    if (record.data?.step === 3) record.data.step = 2;
    if (i) record.seq = i - 1;
  }
  for (const record of records) if (record.type === 'assistant/attempt') {
    for (const chunk of record.data.stream) {
      if (chunk.type === 'text-chunks') chunk.texts = ['{{fromRequest:(W150_INBOUND)}}'];
      if (chunk.type === 'chunk' && chunk.chunk?.block?.type === 'text') chunk.chunk.block.text = '{{fromRequest:(W150_INBOUND)}}';
    }
  }
  const replay = path.join(work, 'replay.jsonl'), overlay = path.join(work, 'headless-fixture.yml');
  fs.writeFileSync(replay, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(overlay, yaml.dump([
    { id: 'llm-deepseek', disabled: true }, { id: 'llm-pi-ai', disabled: true },
    { id: 'session-title-llm', disabled: true }, { id: 'session-telemetry-otel', disabled: true },
    { id: 'agent-default-model', config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
    { insert: [{ id: 'llm-replay', name: '@deepseek-ai/dsh-llm-replay', config: { file: replay, paceMs: 30,
      providers: [{ id: 'deepseek-official', name: 'Replay', models: [{ id: 'deepseek-v4-flash', name: 'Recorded', contextWindow: 100000 }] }] } }] },
  ]));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
  const out = await run(['--profile', 'headless', '--patch', overlay, '--json', 'W150_INPUT'], 'headless-turn', true);
  const final = out.trim().split('\n').map(l => JSON.parse(l)).findLast(r => r.type === 'final');
  assert.match(final?.text || '', /W150_INBOUND/u);
  const hello = wire.find(f => f.method === 'session.hello');
  assert.equal(hello?.params.product, 'dsh'); assert.ok(hello.params.session_id);
  assert.ok(wire.some(f => f.method === 'session.list'));
  assert.deepEqual(wire.find(f => f.id === 150)?.result, { disposition: 'injected' });
  for (let i = 0; i < 100 && streams.size; i++) await delay(10);
  assert.equal(streams.size, 0, 'the exited native peer must leave no attachment');
  console.log('stock headless: real native root, list tool, injected inbound message, answer and disconnected peer: PASS (synthetic bus/replay)');
} catch (error) { primary = error; throw error; }
finally {
  const results = await Promise.allSettled([...children].map(c => stopOwnedChild(c, c.pid, true)));
  for (const stream of streams) stream.destroy();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  fs.rmSync(socketDir, { recursive: true, force: true });
  const failures = results.filter(r => r.status === 'rejected').map(r => r.reason);
  if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'stock-peer cleanup failed');
}
