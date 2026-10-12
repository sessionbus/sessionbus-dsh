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
fs.writeFileSync(path.join(work, 'running-source.sha256'), `${createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex')}  ${new URL(import.meta.url).pathname}\n`);
const sockets = fs.mkdtempSync('/tmp/sb-w126-');
const patch = path.join(home, 'profiles/sessionbus/cordis.patch.yml');
// Physical default row: an overlay would hide the old async configEditor save.
fs.appendFileSync(patch, '\n- id: agent-default-model\n  config: { provider: w126, model: default, reasoningEffort: low }\n');
const before = fs.readFileSync(patch);
fs.writeFileSync(path.join(work, 'profile-before.patch'), before);
const logRoot = path.join(work, 'sessions');
function start(argv, env, label) {
  beforeSpawn();
  fs.writeFileSync(path.join(work, `${label}.request.json`), JSON.stringify({ argv, cwd: work, time: new Date().toISOString() }));
  const child = spawn(argv[0], argv.slice(1), { cwd: work, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.errors = '';
  child.stdout.on('data', chunk => fs.appendFileSync(path.join(work, `${label}.stdout`), chunk));
  child.stderr.on('data', chunk => { child.errors += chunk; fs.appendFileSync(path.join(work, `${label}.stderr`), chunk); });
  child.ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { child.hasEnded = true; fs.writeFileSync(path.join(work, `${label}.exit.json`), JSON.stringify({ code, signal })); resolve({ code, signal }); });
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
  { name: 'invalid-model-effort', open: { model: 'w126/selected', reasoning_effort: 'invalid' }, failure: 'provider "w126" model "selected" does not support reasoning effort "invalid"' },
  { name: 'valid-after-invalid', open: {}, selected: defaults },
  { name: 'bound-error', open: {}, selected: defaults, turnError: true },
  { name: 'partial-bound-error', open: {}, selected: defaults, turnError: true, partial: true },
];
try {
  for (const test of cases) {
    console.log(`W-126 ${test.name}: starting native case`);
    const began = Date.now();
    const capture = path.join(work, `${test.name}-bus.json`), runtime = path.join(work, `${test.name}-native.json`);
    const requestFile = path.join(work, `${test.name}-request.json`), overlay = path.join(work, `${test.name}-overlay.yml`);
    const request = { open: test.open, ...(test.resume ? { resume_session_id: resumed } : {}) };
    fs.writeFileSync(requestFile, JSON.stringify(request));
    const override = path.join(work, `${test.name}-replay.override.json`);
    if (test.turnError) {
      const entries = [];
      if (test.partial) entries.push({ kind: 'chunks', chunks: [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'text-delta', index: 0, text: 'W128 partial answer' },
        { type: 'block-end', index: 0, block: { type: 'text', text: 'W128 partial answer' } },
        { type: 'block-start', index: 1, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 1, id: 'w128-list', name: 'sessionbus', argumentsDelta: '{"action":"list","arguments":{}}' },
        { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'w128-list', name: 'sessionbus', arguments: '{"action":"list","arguments":{}}' } },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ] });
      entries.push({ kind: 'throw', code: 'INVALID_CREDENTIAL', message: 'W128 native provider failure', chunks: [] });
      fs.writeFileSync(override, JSON.stringify(entries));
    }
    fs.writeFileSync(overlay, `- id: llm-deepseek\n  disabled: true\n- id: session-title-llm\n  disabled: true\n- id: session-persistence-jsonl\n  config:\n    root: ${JSON.stringify(logRoot)}\n    compression: none\n- insert:\n    - id: w126-replay\n      name: '@deepseek-ai/dsh-llm-replay'\n      config:\n        file: ${JSON.stringify(path.join(repo, '.github/fixtures/lane-options.jsonl'))}\n${test.turnError ? `        overrideFile: ${JSON.stringify(override)}\n` : ''}        providers:\n          - id: w126\n            models:\n              - id: default\n                reasoningEfforts: [low, medium, high]\n              - id: selected\n                reasoningEfforts: [low, medium, high]\n                defaultReasoningEffort: medium\n    - name: ${JSON.stringify(path.join(repo, '.github/fixtures/lane-options-proof/plugin.cjs'))}\n      config: { destination: ${JSON.stringify(runtime)} }\n`);
    const socket = path.join(sockets, `${test.name}.sock`);
    const daemon = start([process.execPath, path.join(repo, '.github/scripts/fake-lane-options-sessionbus.mjs'), socket, capture, requestFile, product], base, `${test.name}-daemon`);
    await wait(() => fs.existsSync(socket), `${test.name} socket`);
    const beforeFiles = fs.existsSync(logRoot) ? fs.readdirSync(logRoot, { recursive: true }).sort() : [];
    const child = start([...dsh, '--profile', 'sessionbus', '--patch', overlay], { ...base, SESSIONBUS_LAUNCH_TOKEN: 'w126-proof', SESSIONBUS_SOCKET: socket }, test.name);
    const opened = await wait(() => {
      const result = state(capture)?.open;
      if (!result && child.hasEnded) throw new Error(child.errors);
      return result;
    }, `${test.name} open`);
    assert.equal(state(capture).version, version);
    assert.equal(state(capture).openResponses, 1, 'one Open answer, never a second refusal');
    assert.deepEqual(fs.readFileSync(patch), before, `${test.name}: profile bytes after open`);
    if (test.failure) {
      assert.equal(opened.error?.code, -32009);
      assert.equal(opened.error?.message, 'spawn_failed');
      assert.deepEqual(opened.error?.data?.stderr_tail, [test.failure]);
      assert.equal(state(runtime).records.some(event => event.type === 'model/selection'), false);
      // A rejected open does not close a Worker: kit _open replies spawn_failed
      // and keeps the connection available. Stop our owned runtime normally.
      assert.deepEqual(await stop(child, state(runtime).nativePid), { code: 0, signal: null });
      if (version !== '0.1.0-pre.20' && version !== '0.1.0') {
        const afterFiles = fs.existsSync(logRoot) ? fs.readdirSync(logRoot, { recursive: true }).sort() : [];
        assert.deepEqual(afterFiles, beforeFiles, 'fresh invalid effort must leave no native session directory or log');
      }
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
      assert.equal(terminal.result.result.outcome, test.turnError ? 'failed' : 'completed', JSON.stringify(terminal));
      assert.equal(terminal.result.result.result, test.turnError
        ? `${test.partial ? 'W128 partial answer\n\nDSH turn error: ' : ''}INVALID_CREDENTIAL: W128 native provider failure`
        : 'W126_RECORDED_RESPONSE');
      const records = state(runtime).records;
      if (test.turnError) {
        const ended = records.filter(event => event.type === 'turn/end').at(-1);
        assert.equal(ended.data.reason.kind, 'error');
        assert.equal(ended.data.reason.error.code, 'INVALID_CREDENTIAL');
        assert.equal(ended.data.reason.error.message, 'W128 native provider failure');
        const lines = fs.readdirSync(logRoot, { recursive: true }).filter(file => /session(?:\.v\d+)?\.jsonl$/u.test(file))
          .flatMap(file => {
            const log = fs.readFileSync(path.join(logRoot, file), 'utf8').split('\n').slice(0, -1).map(line => JSON.parse(line));
            return log[0].id === id ? log.slice(1) : [];
          });
        const started = lines.findIndex(event => event.type === 'turn/start' && event.data.turn === ended.data.turn);
        const consumed = lines.findIndex(event => event.type === 'user/message' && event.data.content?.[0]?.text === 'W126_INPUT');
        const finished = lines.findIndex(event => event.type === 'turn/end' && event.data.turn === ended.data.turn);
        assert.ok(started >= 0 && started < consumed && consumed < finished, 'this exact native error turn is bound to its sent input');
        if (test.partial) assert.ok(lines.some(event => event.type === 'assistant/message'
          && event.data.message?.content?.some(part => part.type === 'text' && part.text === 'W128 partial answer')),
          'partial text must be a durable native assistant message, not raw stream deltas');
      }
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
