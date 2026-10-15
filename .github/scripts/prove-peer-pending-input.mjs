import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { installInterruptCleanup, stopOwnedChild } from './proof-process-group.mjs';

function checkDaemonSocketPaths(socket, platform) {
  assert.equal(platform, 'linux', `Linux-only proof; socket limit is not established for ${platform}`);
  const limit = 107; // Linux sockaddr_un.sun_path: 108 bytes including the terminating NUL.
  const main = { path: socket, bytes: Buffer.byteLength(socket) };
  const lanePath = path.join(path.dirname(socket), 'lanes', '0'.repeat(32) + '.sock');
  const lane = { path: lanePath, bytes: Buffer.byteLength(lanePath) };
  for (const [kind, entry] of [['main', main], ['derived lane', lane]]) {
    assert.ok(entry.bytes <= limit,
      `private daemon ${kind} socket path is ${entry.bytes} bytes; Linux limit is ${limit} bytes`);
  }
  return { platform, limit, main, lane };
}
function daemonSocketReady(daemon, socket, stderrFile) {
  if (daemon.hasEnded) {
    const tail = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, 'utf8').slice(-2048) : '';
    throw new Error(`private released daemon exited during readiness: code=${daemon.exitCode} signal=${daemon.signalCode}; stderr tail:\n${tail}`);
  }
  return fs.existsSync(socket);
}

const [dshManifest, pluginManifest, work, daemonBin] = process.argv.slice(2);
assert.equal(process.argv.length, 6, 'usage: prove-peer-pending-input.mjs DSH_MANIFEST PLUGIN_MANIFEST WORK DAEMON_BIN');
for (const file of [dshManifest, pluginManifest, work, daemonBin]) assert.ok(path.isAbsolute(file));
assert.equal(fs.existsSync(work), false, 'use a fresh private capture directory; do not append to earlier evidence');
fs.mkdirSync(work, { recursive: true, mode: 0o700 });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(work, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const append = (name, value) => fs.appendFileSync(path.join(work, name),
  JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n', { mode: 0o600 });
const source = fileURLToPath(import.meta.url);
save('running-source.json', { sha256: hash(fs.readFileSync(source)), at: new Date().toISOString() });
fs.copyFileSync(source, path.join(work, 'proof-source.mjs'));
save('inputs.json', { dshManifest, pluginManifest, work, daemonBin });
const fixtureSource = fileURLToPath(new URL('../fixtures/pending-input-model/plugin.cjs', import.meta.url));
const fixtureFile = path.join(work, 'adapter-source.cjs');
fs.copyFileSync(fixtureSource, fixtureFile);
const env = { PATH: process.env.PATH, HOME: path.join(work, 'home'), DSH_HOME: path.join(work, 'dsh'),
  XDG_CONFIG_HOME: path.join(work, 'config'), XDG_STATE_HOME: path.join(work, 'state'),
  XDG_CACHE_HOME: path.join(work, 'cache'), DSH_TELEMETRY_DISABLED: '1',
  SESSIONBUS_SOCKET: path.join(path.dirname(work), 'pending-peer.sock') };
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
const workspace = path.join(work, 'workspace');
fs.mkdirSync(workspace);
process.chdir(workspace);
const requireDSH = createRequire(fs.realpathSync(dshManifest));
const requirePlugin = createRequire(fs.realpathSync(pluginManifest));
const { connectPeer } = requirePlugin('@sessionbus/kit');
const fixture = requirePlugin(fixtureFile);
const pluginFile = requirePlugin.resolve('@sessionbus/dsh');
const version = JSON.parse(fs.readFileSync(pluginManifest)).version;
const expectedVersion = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url))).version;
assert.equal(version, expectedVersion, 'the proof must mount the packed candidate, not another plugin copy');
const sources = { plugin: { version, file: pluginFile, sha256: hash(fs.readFileSync(pluginFile)) },
  fixture: { file: fixtureFile, sha256: hash(fs.readFileSync(fixtureFile)) } };
for (const name of ['@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-retry',
  '@deepseek-ai/dsh-api-session-controller']) {
  const file = requireDSH.resolve(name), manifest = JSON.parse(fs.readFileSync(requireDSH.resolve(name + '/package.json')));
  assert.equal(manifest.version, '0.2.1-alpha.3',
    `Known-gap proof pins ${name} to DSH 0.2.1-alpha.3; found ${manifest.version}. Re-run the known-gap cases against the new DSH version and update the pin.`);
  sources[name] = { file, version: manifest.version, sha256: hash(fs.readFileSync(file)) };
}
save('sources.json', sources);
const load = name => import(pathToFileURL(requireDSH.resolve(name)));
const { runProfile } = await load('@deepseek-ai/dsh/profile-boot');
const { loadLayeredEnv } = await load('@deepseek-ai/dsh-app-boot');
const { SessionId } = await load('@deepseek-ai/dsh-session');
const profile = path.join(env.DSH_HOME, 'profiles/pending-proof');
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'pending-input-private-peer', private: true,
  type: 'module', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }, null, 2) + '\n');
fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), [
  '- id: session-title-llm', '  disabled: true', '- id: session-telemetry-otel', '  disabled: true',
  '- id: agent-default-model', '  config: { provider: pending-proof, model: controlled }', '- insert:',
  "    - { id: workspace, name: '@deepseek-ai/dsh-workspace' }",
  `    - { id: uploads, name: ${JSON.stringify(path.join(path.dirname(pluginManifest), 'file-uploads-none.mjs'))} }`,
  "    - { id: session-controller, name: '@deepseek-ai/dsh-api-session-controller' }",
  `    - { id: controlled-adapter, name: ${JSON.stringify(fixtureFile)}, config: ${JSON.stringify({ manifest: dshManifest, capture: work })} }`,
  `    - { id: sessionbus, name: ${JSON.stringify(pluginFile)}, config: ${JSON.stringify({ product: 'dashi', socket: env.SESSIONBUS_SOCKET, groups: ['pending-proof'] })} }`,
].join('\n') + '\n');

const children = new Set(), beforeSpawn = installInterruptCleanup(children);
const results = [];
let boot, sender, serial = 0, current = 'setup', primary;
async function until(read, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await delay(10);
  }
  throw new Error('fixture observation timed out: ' + label);
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('fixture observation timed out: ' + label)), 10000);
    })]);
  } finally { clearTimeout(timer); }
}
async function call(label, request, run) {
  const stem = String(++serial).padStart(4, '0') + '-' + label;
  save(stem + '.request.json', { at: new Date().toISOString(), request });
  try {
    const value = await run();
    save(stem + '.result.json', { at: new Date().toISOString(), value });
    return value;
  } catch (error) {
    save(stem + '.error.json', { at: new Date().toISOString(), name: error?.name,
      message: error?.message, code: error?.code, failure: error?.failure });
    throw error;
  }
}
const turnStarts = agent => agent.session.snapshotEvents().filter(event => event.type === 'turn/start').length;
const requests = model => fixture.plans.get(model).requests;
const includes = (request, text) => request.messages.some(message =>
  message.content?.some(part => part.type === 'text' && part.text.includes(text)));
function snapshot(agent, label) {
  const phase = agent.phase; // Read-only diagnostic of this published test Agent, never a product dependency.
  const value = { case: current, label, status: agent.status, phase: { kind: phase.kind, turn: phase.turn,
    lastTurn: phase.lastTurn, step: phase.step, wakeRequested: phase.wakeRequested,
    aborted: phase.abort?.signal.aborted, abortReason: phase.abort?.signal.reason },
  nextStep: agent.inbox.nextStep, nextTurn: agent.inbox.nextTurn, turnStarts: turnStarts(agent),
  events: agent.session.snapshotEvents() };
  save(current + '-' + label + '.json', value);
  return value;
}
async function quiet(agent, label) {
  await bounded(agent.whenIdle(), current + ' idle');
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return snapshot(agent, label);
}
async function prompt(agent, text) {
  const request = { sessionId: String(agent.session.id), requestId: crypto.randomUUID(), mode: 'queue',
    content: [{ type: 'text', text }] };
  const result = await call(current + '-prompt', request,
    () => boot.ctx.sessionController.prompt(request, new AbortController().signal));
  assert.equal(result.accepted, true);
  return result;
}
async function peer(agent, text) {
  const roster = await call(current + '-list', {}, () => sender.caller.list({}, AbortSignal.timeout(5000)));
  const row = roster.sessions.find(row => row.session_id.split('@')[0] === String(agent.session.id));
  assert.ok(row?.connected, 'exact root must be attached before delivery; roster running is not native activity');
  const request = { target: row.session_id, message: text };
  const receipt = await call(current + '-send', request, () => sender.caller.send(request, AbortSignal.timeout(5000)));
  assert.equal(receipt.deliveries?.length, 1);
  assert.equal(receipt.deliveries[0].disposition, 'injected');
  return receipt;
}
async function rootAgent(model, actions) {
  fixture.plans.set(model, { actions: [...actions], attempts: 0, held: null, requests: [] });
  const cwd = path.join(workspace, model);
  fs.mkdirSync(cwd);
  const id = SessionId('session-' + crypto.randomUUID());
  let agent;
  await call(model + '-create', { id, provider: 'pending-proof', model, cwd }, async () => {
    agent = await boot.ctx.agentLoop.create(id, { provider: 'pending-proof', model }, { cwd });
    return { sessionId: String(agent.session.id), status: agent.status, options: agent.options };
  });
  await until(async () => {
    const roster = await call(model + '-publication-list', {}, () => sender.caller.list({}, AbortSignal.timeout(5000)));
    return roster.sessions.some(row => row.session_id.split('@')[0] === String(id) && row.connected);
  }, 'peer root publication');
  return agent;
}
async function held(model, attempt) {
  await until(() => fixture.plans.get(model).held?.attempt === attempt, 'controlled request ' + model + '/' + attempt);
}
async function release(model) {
  return call(model + '-release', { model, attempt: fixture.plans.get(model).held?.attempt }, () => {
    fixture.release(model);
    return { released: true };
  });
}
function knownGap(ended, pending, turns, count, ending) {
  const consumed = ended.events.some(event => event.type === 'user/message' && event.data.id === pending.id);
  if (consumed && ended.turnStarts > turns && requests(current).length > count) {
    assert.fail(`Upstream DSH now wakes pending input after ${ending}; update this known-gap assertion and documentation, not the plugin scheduler.`);
  }
  assert.equal(ended.status, 'idle', 'known-gap observation must be at native idle');
  assert.equal(ended.phase.kind, 'idle');
  assert.deepEqual(ended.nextStep, [pending], 'known-gap pending state changed without evidence of an automatic wake');
  assert.equal(ended.nextTurn.length, 0);
  assert.equal(ended.turnStarts, turns, 'known-gap turn count changed');
  assert.equal(requests(current).length, count, 'known-gap request count changed');
}
function reported(facts) {
  results.push(facts);
  console.log(`${facts.case}: PASS`);
}
try {
  save('daemon-socket-paths.json', checkDaemonSocketPaths(env.SESSIONBUS_SOCKET, process.platform));
  const versionResult = spawnSync(daemonBin, ['-version'], { env, encoding: 'utf8' });
  save('daemon-version.json', { argv: [daemonBin, '-version'], stdout: versionResult.stdout,
    stderr: versionResult.stderr, code: versionResult.status, signal: versionResult.signal });
  assert.equal(versionResult.status, 0);
  assert.match(versionResult.stdout, /0\.5\.12/u);
  const args = ['-socket', env.SESSIONBUS_SOCKET, '-table', path.join(work, 'daemon-table.json'), '-host', 'pending-proof',
    '-hub', '', '-products', '', '-comms-log', 'content', '-comms-log-dir', path.join(work, 'comms')];
  save('daemon.request.json', { argv: [daemonBin, ...args], environmentKeys: Object.keys(env) });
  beforeSpawn();
  const daemon = spawn(daemonBin, args, { env, cwd: work, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(daemon);
  daemon.stdout.on('data', bytes => fs.appendFileSync(path.join(work, 'daemon.stdout'), bytes));
  daemon.stderr.on('data', bytes => fs.appendFileSync(path.join(work, 'daemon.stderr'), bytes));
  daemon.ended = new Promise((resolve, reject) => {
    daemon.once('error', reject);
    daemon.once('close', (code, signal) => { daemon.hasEnded = true; resolve({ code, signal }); });
  });
  await until(() => daemonSocketReady(daemon, env.SESSIONBUS_SOCKET, path.join(work, 'daemon.stderr')),
    'private released daemon socket');
  sender = connectPeer({ product: 'pending-input-sender', session_id: 'proof-sender', groups: ['pending-proof'], info: {} },
    async () => ({ disposition: 'injected' }), { SESSIONBUS_SOCKET: env.SESSIONBUS_SOCKET });
  await bounded(sender.ready, 'sender admission');
  await call('sender-list', {}, () => sender.caller.list({}, AbortSignal.timeout(5000)));
  boot = await runProfile({ environment: loadLayeredEnv('dsh', workspace), profile: 'pending-proof', patchFiles: [], args: [] });
  await bounded(fixture.ready, 'controlled adapter mount');
  boot.ctx.on('session/event', (session, event) => append('session-events.jsonl', { session: String(session.id), event }), { global: true });
  boot.ctx.on('agent/error', payload => append('agent-errors.jsonl', { turn: payload.turn, step: payload.step,
    error: { name: payload.error?.name, message: payload.error?.message, failure: payload.error?.failure } }), { global: true });
  for (const arrival of ['active', 'idle-after-error']) {
    for (const ending of ['error', 'cancel', 'normal']) {
      for (const recovery of ['peer', 'prompt']) {
        const gap = arrival === 'active' && ending !== 'normal';
        current = `${gap ? 'known-gap' : 'positive-control'}-${arrival}-${ending}-${recovery}`;
        const primaryAction = ending === 'error' ? 'error' : 'normal';
        const agent = await rootAgent(current, arrival === 'active' ? [primaryAction] : ['error', primaryAction]);
        const first = current + ' FIRST_PEER';
        if (arrival === 'idle-after-error') {
          await prompt(agent, current + ' SEED');
          await held(current, 1);
          await release(current);
          const seed = await quiet(agent, 'seed-error-idle');
          assert.equal(seed.status, 'idle');
          assert.equal(seed.nextStep.length, 0);
          assert.equal(seed.events.filter(event => event.type === 'turn/end').at(-1).data.reason.kind, 'error');
          await peer(agent, first);
          await held(current, 2);
          assert.ok(includes(requests(current)[1], first), 'idle-after-error relay must enter the new request');
        } else {
          await prompt(agent, current + ' INITIAL_TYPED');
          await held(current, 1);
          await peer(agent, first);
          assert.equal(includes(requests(current)[0], first), false, 'held request predates peer input');
        }
        const admitted = snapshot(agent, 'after-first-peer');
        const inserted = admitted.events.filter(event => event.type === 'agent/inbox/spliced')
          .flatMap(event => event.data.inserted ?? []).find(message => message.content?.some(part => part.text?.includes(first)));
        assert.ok(inserted, 'native splice observed independently of model consumption');
        if (ending === 'cancel') {
          const request = { sessionId: String(agent.session.id) };
          await call(current + '-cancel', request, () => boot.ctx.sessionController.cancel(request));
        }
        await release(current);
        const ended = await quiet(agent, 'after-primary-end');
        // Name an upstream automatic wake before inspecting the last end: the
        // new recovery turn may already have completed and changed that reason.
        if (gap) knownGap(ended, inserted, 1, 1, ending === 'cancel' ? 'keepInbox cancellation' : 'an error-ended turn');
        assert.equal(ended.events.filter(event => event.type === 'turn/end').at(-1).data.reason.kind,
          ending === 'cancel' ? 'aborted' : ending === 'error' ? 'error' : 'completed');
        if (!gap) {
          assert.equal(ended.nextStep.length, 0);
          assert.equal(ended.nextTurn.length, 0);
          assert.equal(ended.turnStarts, arrival === 'active' ? 1 : 2);
          if (arrival === 'active') assert.ok(includes(requests(current)[1], first), 'active input reaches next step of same turn');
        }
        const wake = current + (recovery === 'peer' ? ' SECOND_PEER' : ' RECOVERY_TYPED');
        if (recovery === 'peer') await peer(agent, wake);
        else await prompt(agent, wake);
        const recovered = await quiet(agent, 'after-recovery');
        assert.equal(recovered.nextStep.length, 0);
        assert.equal(recovered.nextTurn.length, 0);
        assert.equal(recovered.turnStarts, ended.turnStarts + 1);
        assert.equal(recovered.events.filter(event => event.type === 'user/message' && event.data.id === inserted.id).length, 1);
        assert.ok(includes(requests(current).at(-1), first));
        assert.ok(includes(requests(current).at(-1), wake));
        assert.equal(recovered.events.filter(event => event.type === 'turn/end').at(-1).data.reason.kind, 'completed');
        await boot.ctx.sessions.flush(agent.session);
        reported({ case: current, admitted: { nextStep: admitted.nextStep.length, turnStarts: admitted.turnStarts },
          ended: { nextStep: ended.nextStep.length, turnStarts: ended.turnStarts },
          recovered: { nextStep: recovered.nextStep.length, turnStarts: recovered.turnStarts } });
      }
    }
  }
  current = 'known-gap-timeout-retry-exhaustion';
  const agent = await rootAgent(current, ['timeout', 'timeout']);
  await prompt(agent, current + ' INITIAL_TYPED');
  await held(current, 1);
  const first = current + ' FIRST_PEER';
  await peer(agent, first);
  const admitted = snapshot(agent, 'after-first-peer'), pending = admitted.nextStep[0];
  assert.ok(pending);
  await release(current);
  await held(current, 2);
  const retry = snapshot(agent, 'during-retry');
  if (retry.events.some(event => event.type === 'user/message' && event.data.id === pending.id)) {
    assert.fail('Upstream DSH now claims pending input during retry; update this known-gap assertion and documentation.');
  }
  assert.deepEqual(retry.nextStep, [pending]);
  assert.equal(retry.turnStarts, 1);
  for (const request of requests(current)) assert.equal(includes(request, first), false);
  await release(current);
  const exhausted = await quiet(agent, 'after-exhaustion');
  knownGap(exhausted, pending, 1, 2, 'retry exhaustion');
  const last = exhausted.events.filter(event => event.type === 'turn/end').at(-1);
  assert.equal(last.data.reason.kind, 'error');
  assert.equal(last.data.reason.error.code, 'TIMEOUT');
  const retries = exhausted.events.filter(event => event.type === 'llm/retry');
  assert.equal(retries.length, 1);
  assert.equal(retries[0].data.delayMs, 1);
  const wake = current + ' SECOND_PEER';
  await peer(agent, wake);
  const recovered = await quiet(agent, 'after-recovery');
  assert.equal(recovered.nextStep.length, 0);
  assert.equal(recovered.nextTurn.length, 0);
  assert.equal(recovered.turnStarts, 2);
  assert.equal(requests(current).length, 3);
  assert.ok(includes(requests(current)[2], first));
  assert.ok(includes(requests(current)[2], wake));
  assert.equal(recovered.events.filter(event => event.type === 'user/message' && event.data.id === pending.id).length, 1);
  assert.equal(recovered.events.filter(event => event.type === 'turn/end').at(-1).data.reason.kind, 'completed');
  await boot.ctx.sessions.flush(agent.session);
  reported({ case: current, retries: 1, pendingAtExhaustion: exhausted.nextStep.length, recovered: true });
  save('RESULTS.json', results);
} catch (error) {
  primary = error;
  save('STOP.json', { case: current, name: error?.name, message: error?.message });
} finally {
  const cleanupErrors = [];
  try { sender?.shutdown(); } catch (error) { cleanupErrors.push(error); }
  // A failed observation may leave our adapter held. Dispose the private roots
  // before releasing those gates, so cleanup cannot turn a failure into recovery.
  try {
    if (boot) for (const agent of boot.ctx.agents.roots()) {
      if (agent.status === 'running') agent.cancel({ kind: 'disposed' });
    }
    for (const plan of fixture.plans.values()) plan.held?.gate.resolve();
  } catch (error) { cleanupErrors.push(error); }
  try { if (boot) await boot.shutdown.shutdown(primary ? 1 : 0); } catch (error) { cleanupErrors.push(error); }
  for (const child of children) {
    try {
      const result = await stopOwnedChild(child);
      children.delete(child); // stopOwnedChild proved the group empty, even when its exit code is unexpected.
      save('daemon.exit.json', result);
      assert.equal(result.code, 0);
      assert.equal(result.signal, null);
    } catch (error) {
      cleanupErrors.push(error);
      try { if (children.has(child)) { await stopOwnedChild(child, child.pid, true); children.delete(child); } }
      catch (failure) { cleanupErrors.push(failure); }
    }
  }
  save('cleanup.json', { ownedGroupsEmpty: children.size === 0, errors: cleanupErrors.map(error => error?.message) });
  if (cleanupErrors.length) primary = new AggregateError([...(primary ? [primary] : []), ...cleanupErrors], 'proof and cleanup failures');
}
const files = [];
function walk(directory) {
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isDirectory()) walk(file);
    else if (stat.isFile()) files.push(file);
  }
}
walk(work);
fs.writeFileSync(path.join(work, 'MANIFEST.sha256'), files.map(file => hash(fs.readFileSync(file)) + '  ' + path.relative(work, file)).join('\n') + '\n');
if (primary) {
  console.error(`peer pending-input STOP: ${current}; ${primary.message}`);
  throw primary;
}
console.log(`DSH ${sources['@deepseek-ai/dsh-agent-loop'].version} peer pending-input known gaps and recovery: ${results.length}/13 PASS; evidence=${work}`);
