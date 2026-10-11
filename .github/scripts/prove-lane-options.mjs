import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { assertEmptyGroup, stopOwnedChild, installInterruptCleanup } from './proof-process-group.mjs';

const [work, command, home, repo, product = 'sessionbus-dsh'] = process.argv.slice(2);
assert.ok(work && command && home && repo, 'usage: prove-lane-options.mjs WORK DSH_ARGV_JSON DSH_HOME REPO');
const dsh = JSON.parse(command), children = new Set();
const beforeSpawn = installInterruptCleanup(children);
const version = JSON.parse(fs.readFileSync(path.join(home, 'profiles/sessionbus/node_modules/@sessionbus/dsh/package.json'))).version;
const base = { ...process.env, DSH_HOME: home };
for (const key of Object.keys(base)) if (key.startsWith('SESSIONBUS_')) delete base[key];
fs.mkdirSync(work, { recursive: true });
const sockets = fs.mkdtempSync('/tmp/sb-w126-');
const patch = path.join(home, 'profiles/sessionbus/cordis.patch.yml');
// Physical default row: an overlay would hide the old async configEditor save.
fs.appendFileSync(patch, '\n- id: agent-default-model\n  config: { provider: w126, model: default, reasoningEffort: low }\n');
const before = fs.readFileSync(patch);
fs.writeFileSync(path.join(work, 'profile-before.patch'), before);
const logRoot = path.join(work, 'sessions');
function start(argv, env, label) {
  beforeSpawn();
  const child = spawn(argv[0], argv.slice(1), { cwd: work, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.errors = '';
  child.stdout.on('data', chunk => fs.appendFileSync(path.join(work, `${label}.stdout`), chunk));
  child.stderr.on('data', chunk => { child.errors += chunk; fs.appendFileSync(path.join(work, `${label}.stderr`), chunk); });
  child.ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); });
  });
  return child;
}
async function stop(child, nativePid = child.pid, cleanup = false) {
  const result = await stopOwnedChild(child, nativePid, cleanup); children.delete(child); return result;
}
const state = file => fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8'));
async function wait(read, label) {
  const end = Date.now() + 30_000;
  while (Date.now() < end) { const result = read(); if (result) return result; await delay(25); }
  throw new Error(`W-126 observation timeout: ${label}`);
}
const defaults = { provider: 'w126', model: 'default', reasoningEffort: 'low' };
let primary, resumed;
const verified = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = [
  { name: 'model-effort', open: { model: 'w126/selected', reasoning_effort: 'high' }, selected: { provider: 'w126', model: 'selected', reasoningEffort: 'high' } },
  { name: 'second-default', open: {}, selected: defaults },
  { name: 'model-only', open: { model: 'w126/selected' }, selected: { provider: 'w126', model: 'selected' }, adapterDefault: true },
  { name: 'effort-only', open: { reasoning_effort: 'high' }, selected: { provider: 'w126', model: 'default', reasoningEffort: 'high' } },
  { name: 'resume-seed', open: { model: 'w126/selected', reasoning_effort: 'low' }, selected: { provider: 'w126', model: 'selected', reasoningEffort: 'low' } },
  { name: 'resume-effort', resume: true, open: { reasoning_effort: 'high' }, selected: { provider: 'w126', model: 'selected', reasoningEffort: 'high' } },
  { name: 'resume-no-options', resume: true, open: {}, selected: { provider: 'w126', model: 'selected', reasoningEffort: 'high' } },
  { name: 'unadvertised', open: { model: 'w126/unadvertised' }, selected: { provider: 'w126', model: 'unadvertised' } },
  { name: 'invalid-effort', open: { reasoning_effort: 'invalid' }, failure: 'provider "w126" model "default" does not support reasoning effort "invalid"' },
  { name: 'valid-after-invalid', open: {}, selected: defaults },
];
try {
  for (const test of cases) {
    console.log(`W-126 ${test.name}: starting native case`);
    const began = Date.now();
    const capture = path.join(work, `${test.name}-bus.json`), runtime = path.join(work, `${test.name}-native.json`);
    const requestFile = path.join(work, `${test.name}-request.json`), overlay = path.join(work, `${test.name}-overlay.yml`);
    const request = { open: test.open, ...(test.resume ? { resume_session_id: resumed } : {}) };
    fs.writeFileSync(requestFile, JSON.stringify(request));
    fs.writeFileSync(overlay, `- id: llm-deepseek\n  disabled: true\n- id: session-title-llm\n  disabled: true\n- id: session-persistence-jsonl\n  config:\n    root: ${JSON.stringify(logRoot)}\n    compression: none\n- insert:\n    - id: w126-replay\n      name: '@deepseek-ai/dsh-llm-replay'\n      config:\n        file: ${JSON.stringify(path.join(repo, '.github/fixtures/lane-options.jsonl'))}\n        providers:\n          - id: w126\n            models:\n              - id: default\n                reasoningEfforts: [low, medium, high]\n              - id: selected\n                reasoningEfforts: [low, medium, high]\n                defaultReasoningEffort: medium\n    - name: ${JSON.stringify(path.join(repo, '.github/fixtures/lane-options-proof/plugin.cjs'))}\n      config: { destination: ${JSON.stringify(runtime)} }\n`);
    const socket = path.join(sockets, `${test.name}.sock`);
    const daemon = start([process.execPath, path.join(repo, '.github/scripts/fake-lane-options-sessionbus.mjs'), socket, capture, requestFile, product], base, `${test.name}-daemon`);
    await wait(() => fs.existsSync(socket), `${test.name} socket`);
    const child = start([...dsh, '--profile', 'sessionbus', '--patch', overlay], { ...base, SESSIONBUS_LAUNCH_TOKEN: 'w126-proof', SESSIONBUS_SOCKET: socket }, test.name);
    const opened = await wait(() => {
      const result = state(capture)?.open;
      if (!result && child.hasEnded) throw new Error(child.errors);
      return result;
    }, `${test.name} open`);
    assert.equal(state(capture).version, version);
    assert.deepEqual(fs.readFileSync(patch), before, `${test.name}: profile bytes after open`);
    if (test.failure) {
      assert.equal(opened.error?.code, -32009);
      assert.equal(opened.error?.message, 'spawn_failed');
      assert.deepEqual(opened.error?.data?.stderr_tail, [test.failure]);
      assert.equal(state(runtime).records.some(event => event.type === 'model/selection'), false);
      // A rejected open does not close a Worker: kit _open replies spawn_failed
      // and keeps the connection available. Stop our owned runtime normally.
      assert.deepEqual(await stop(child, state(runtime).nativePid), { code: 0, signal: null });
    } else {
      assert.equal(opened.error, undefined, JSON.stringify(opened));
      const id = opened.result.session_id;
      if (test.resume) assert.equal(id, resumed);
      if (test.name === 'resume-seed') resumed = id;
      const observed = await wait(() => state(runtime)?.roots.find(root => root.id === id), `${test.name} native selection`);
      assert.deepEqual(observed.selection, test.selected);
      daemon.kill('SIGUSR1');
      const terminal = await wait(() => {
        if (child.hasEnded) throw new Error(child.errors);
        if (state(capture)?.executed?.error) throw new Error(JSON.stringify(state(capture).executed.error));
        return state(capture)?.terminal;
      }, `${test.name} recorded turn`);
      assert.equal(terminal.result?.state, 'done', JSON.stringify(terminal));
      assert.equal(terminal.result.result.outcome, 'completed', JSON.stringify(terminal));
      assert.equal(terminal.result.result.result, 'W126_RECORDED_RESPONSE');
      const records = state(runtime).records;
      const header = records.filter(event => event.type === 'request/header').at(-1)?.data.header;
      assert.ok(header);
      assert.equal(header.config.provider, test.selected.provider); assert.equal(header.config.model, test.selected.model);
      assert.equal(header.config.reasoningEffort, test.adapterDefault ? 'medium' : test.selected.reasoningEffort);
      assert.equal(header.adapterDefaults?.reasoningEffort === true, Boolean(test.adapterDefault));
      assert.equal(records.some(event => event.type === 'model/selection'), Object.keys(test.open).length !== 0);
      assert.deepEqual(fs.readFileSync(patch), before, `${test.name}: profile bytes after turn (async default-save control)`);
      assert.deepEqual(state(runtime).defaultSelection, defaults);
      assert.deepEqual(await stop(child, state(runtime).nativePid), { code: 0, signal: null });
    }
    assert.deepEqual(fs.readFileSync(patch), before, `${test.name}: profile bytes after shutdown`);
    await stop(daemon);
    verified.push({ name: test.name, milliseconds: Date.now() - began, patchBefore: hash(before), patchAfter: hash(fs.readFileSync(patch)),
      ...(test.failure ? { refusal: opened.error } : { selected: test.selected }) });
    console.log(`W-126 ${test.name}: ${test.failure ? 'native refusal/no selection, patch bytes after open/shutdown' : 'native open/selection/request, patch bytes after open/turn/shutdown'}: PASS (${Date.now() - began} ms)`);
  }
  fs.writeFileSync(path.join(work, 'verification.json'), JSON.stringify(verified, null, 2));
} catch (error) { primary = error; throw error; }
finally {
  const cleanup = await Promise.allSettled([...children].map(child => stop(child, child.pid, true)));
  fs.rmSync(sockets, { recursive: true, force: true });
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'W-126 owned proof cleanup failed');
}
