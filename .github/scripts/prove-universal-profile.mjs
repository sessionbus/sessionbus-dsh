import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { assertEmptyGroup, signalOwnedGroup, stopOwnedChild } from './proof-process-group.mjs';

const [work, commandJSON, candidate, repo] = process.argv.slice(2);
assert.ok(work && commandJSON && candidate && repo, 'usage: prove-universal-profile.mjs WORK DSH_ARGV_JSON TARBALL REPO');
const dsh = JSON.parse(commandJSON);
assert.ok(Array.isArray(dsh) && dsh.length && dsh.every(arg => typeof arg === 'string'));
const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'))).version;
const profiles = ['sessionbus', 'web', ...(process.platform === 'linux' && process.env.W125_INSTALL_MODE === 'project' ? ['custom'] : [])];
const home = path.join(work, 'home'), workspace = path.join(work, 'workspace');
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
const base = { ...process.env, DSH_HOME: home };
for (const key of Object.keys(base)) if (key.startsWith('SESSIONBUS_')) delete base[key];
const children = new Set(), timings = [];
let primary;
const sockets = fs.mkdtempSync('/tmp/sb-w125-');
const redact = value => String(value).replace(/([?&]token=)[^\s]+/gu, '$1<redacted>');
function start(argv, env, label) {
  const child = spawn(argv[0], argv.slice(1), { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stdoutText = ''; child.stderrText = '';
  child.stdout.on('data', chunk => { child.stdoutText += chunk; fs.appendFileSync(path.join(work, `${label}.stdout`), redact(chunk)); });
  child.stderr.on('data', chunk => { child.stderrText += chunk; fs.appendFileSync(path.join(work, `${label}.stderr`), redact(chunk)); });
  child.ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); });
  });
  return child;
}
async function wait(read, label, milliseconds = 30_000) {
  const until = performance.now() + milliseconds;
  while (performance.now() < until) { const value = await read(); if (value) return value; await delay(25); }
  throw new Error(`observation timeout: ${label}`);
}
async function operation(args, label, expected = 0, acquisition = false) {
  const began = performance.now(), child = start([...dsh, ...args], base, label);
  const milliseconds = args.includes('exec') ? 10_000 : 60_000;
  const bound = acquisition ? undefined : setTimeout(() => signalOwnedGroup(child, 'SIGTERM'), milliseconds);
  const hardBound = acquisition ? undefined : setTimeout(() => signalOwnedGroup(child, 'SIGKILL'), milliseconds + 5000);
  try {
    const result = await child.ended;
    assert.equal(result.signal, null, `${label}: a signal is not a native policy refusal`);
    if (expected === 'refusal') assert.notEqual(result.code, 0, `${label}: expected native refusal`);
    else assert.equal(result.code, expected, `${label}: ${redact(child.stderrText)}`);
    assertEmptyGroup(child); children.delete(child);
    timings.push({ label, milliseconds: Math.round(performance.now() - began) });
    return child;
  } finally { clearTimeout(bound); clearTimeout(hardBound); }
}
async function stop(child, nativePid = child.pid, cleanup = false) {
  const result = await stopOwnedChild(child, nativePid, cleanup);
  children.delete(child); return result;
}
const state = capture => fs.existsSync(capture) && JSON.parse(fs.readFileSync(capture, 'utf8'));
const alive = child => { if (child.hasEnded) throw new Error(`native process exited: ${redact(child.stderrText)}`); };
function events(root) {
  return fs.readdirSync(root, { recursive: true }).filter(file => /session(?:\.v\d+)?\.jsonl$/u.test(file))
    .flatMap(file => fs.readFileSync(path.join(root, file), 'utf8').trim().split('\n').slice(1).map(line => JSON.parse(line)));
}
try {
  // The same documented version command absorbs cold npx acquisition first;
  // registry waits are bounded by CI's 25-minute leg, not native-state timers.
  const selected = await operation(['--version'], 'executing-version', 0, true);
  assert.equal(selected.stdoutText.trim(), '0.2.1-alpha.2');
  // EXACT README order. No hook, cutoff, provider lookup, cleanup or companion preparation.
  for (const profile of profiles) {
    await operation(['plugin', '--profile', profile, 'add', '--save-exact', candidate], `${profile}-readme-add`, 0, true);
    const packageFile = path.join(home, 'profiles', profile, 'package.json');
    const lockFile = path.join(home, 'profiles', profile, 'pnpm-lock.yaml');
    const before = [packageFile, lockFile].map(file => fs.readFileSync(file));
    await operation(['plugin', '--profile', profile, 'exec', 'sessionbus-dsh-install',
      ...(profile !== 'sessionbus' ? ['--product', 'dsh', profile] : [])], `${profile}-readme-exec`);
    [packageFile, lockFile].forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i], 'installer cannot change package state'));
    const manifest = JSON.parse(fs.readFileSync(packageFile));
    assert.equal(manifest.dependencies['@antst/dsh-file-uploads-none'], undefined);
    const policy = fs.readFileSync(path.join(home, 'profiles', profile, 'pnpm-workspace.yaml'), 'utf8');
    assert.match(policy, /nodeLinker: hoisted/u); assert.match(policy, /autoInstallPeers: false/u);
    console.log(`${profile}: exact README add/exec, native fresh defaults, package bytes preserved: PASS`);
  }
  // Only now add test-only replay/approval fixtures. They are not install prerequisites.
  for (const profile of ['sessionbus', 'web']) await operation(['plugin', '--profile', profile, 'add', '--save-exact',
    '@deepseek-ai/dsh-llm-replay@0.2.1-alpha.2', path.join(repo, '.github/fixtures/ask-all-plugin')], `${profile}-proof-fixtures`, 0, true);

  for (const [profile, mode] of [['sessionbus', 'lane'], ['web', 'web']]) {
    const runtime = path.join(work, `${mode}-runtime.json`), capture = path.join(work, `${mode}-bus.json`);
    const logRoot = path.join(work, `${mode}-sessions`), overlay = path.join(work, `${mode}-proof.yml`);
    const fixture = path.join(repo, `.github/fixtures/${mode === 'lane' ? 'sessionbus-tool-call' : 'sessionbus-peer-rehello'}.jsonl`);
    const replay = fs.readFileSync(path.join(repo, '.github/fixtures/sessionbus-tool-call.patch.yml'), 'utf8');
    fs.writeFileSync(overlay, `${replay}\n- id: agent-default-model\n  config: { provider: deepseek-official, model: deepseek-v4-flash }\n- insert:\n    - name: ${JSON.stringify(path.join(repo, '.github/fixtures/runtime-proof-plugin/plugin.cjs'))}\n      config: ${JSON.stringify({ destination: runtime, version, mode })}\n`);
    const runtimeDir = path.join(sockets, mode);
    fs.mkdirSync(path.join(runtimeDir, 'sessionbus'), { recursive: true });
    const socket = path.join(runtimeDir, 'sessionbus/presence.sock');
    const server = start([process.execPath, path.join(repo, '.github/scripts/fake-permission-sessionbus.mjs'), socket, capture,
      mode === 'lane' ? 'sessionbus-dsh' : 'dsh', mode === 'lane' ? 'worker' : 'peer'], base, `${mode}-daemon-fixture`);
    await wait(() => fs.existsSync(socket), 'fake daemon socket');
    const env = { ...base, DSH_SNAPSHOT_FILE: fixture, DSH_W081_SESSION_ROOT: logRoot, XDG_RUNTIME_DIR: runtimeDir,
      SESSIONBUS_GROUPS: mode === 'lane' ? 'ignored-malformed-lane-value' : '["web-proof"]' };
    if (mode === 'lane') { env.SESSIONBUS_LAUNCH_TOKEN = 'w125-lane'; env.SESSIONBUS_SOCKET = socket; }
    // Web deliberately discovers XDG_RUNTIME_DIR without SESSIONBUS_SOCKET.
    const args = ['--profile', profile, '--patch', overlay,
      ...(mode === 'web' ? ['--no-open', '--host', '127.0.0.1', '--port', '0'] : [])];
    const child = start([...dsh, ...args], env, `${mode}-native`);
    await wait(() => { alive(child); return state(runtime); }, `${mode} native runtime oracle`);
    assert.equal(state(runtime).ok, true, JSON.stringify(state(runtime)));
    let rpc, id;
    if (mode === 'web') {
      const url = await wait(() => { alive(child); return /dsh web: (http:\/\/\S+)/u.exec(child.stdoutText)?.[1]; }, 'real web launch');
      const login = await fetch(url, { redirect: 'manual' });
      assert.equal(login.status, 303);
      const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]; assert.ok(cookie);
      rpc = async (method, args) => {
        const response = await fetch(`${new URL(url).origin}/api/${method}`, { method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) });
        const answer = await response.json(); assert.equal(answer.result?.ok, true, JSON.stringify(answer)); return answer.result.value;
      };
      id = (await rpc('session/create', { request: {} })).sessionId;
      await rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: 'W087_INPUT_SENTINEL' }] } });
      await wait(() => { alive(child); return state(capture)?.peerDeliveryReceipt && events(logRoot).some(event => event.type === 'turn/end'); }, 'web real delivery/reply');
      assert.equal(state(capture).listedIdentity.session_id, id);
      assert.deepEqual(state(capture).listedIdentity.groups, ['web-proof']);
      assert.deepEqual(state(capture).peerDeliveryReceipt, { disposition: 'injected' });
      server.kill('SIGUSR1');
      await wait(() => { alive(child); return state(capture)?.idleDeliveryReceipt && events(logRoot).filter(event => event.type === 'turn/end').length >= 2; }, 'web idle wake');
    } else {
      await wait(() => { alive(child); return state(capture)?.ready; }, 'lane round trip');
      assert.equal(state(capture).helloParams.launch_token, 'w125-lane');
      assert.equal(Object.hasOwn(state(capture).helloParams, 'groups'), false);
      for (const result of [state(capture).run, state(capture).deliveryRun]) {
        assert.equal(result.state, 'done'); assert.equal(result.result.outcome, 'completed');
      }
    }
    const records = events(logRoot);
    assert.ok(records.some(event => event.type === 'user/message' && event.data.content?.[0]?.text === 'W087_INPUT_SENTINEL'));
    assert.ok(records.some(event => event.type === 'assistant/message' && JSON.stringify(event.data).includes('W087_DELIVERY_SENTINEL')));
    assert.ok(records.some(event => event.type === 'tool/result'));
    assert.equal(records.some(event => event.type === 'approval/asked' && event.data.toolName === 'sessionbus'), false);
    assert.equal(records.some(event => event.type === 'approval/asked' && event.data.toolName === 'w081_dummy'), true);
    assert.deepEqual(await stop(child, state(runtime).nativePid), { code: 0, signal: null });
    await stop(server);
    console.log(`${mode}: executing native resolution, mounted provider, round trip, durable text, permission control${mode === 'web' ? ', cookie HTTP empty-request root and idle wake without socket override' : ''}: PASS`);
  }
  for (const profile of profiles) {
    await operation(['plugin', '--profile', profile, 'exec', 'sessionbus-dsh-install', '--remove', profile], `${profile}-remove-rows`);
    const directory = path.join(home, 'profiles', profile);
    assert.doesNotMatch(fs.readFileSync(path.join(directory, 'cordis.patch.yml'), 'utf8'), /id:\s*sessionbus|id:\s*file-uploads-none/u);
    assert.ok(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).dependencies['@sessionbus/dsh'], 'rows-only removal preserves the package');
    await operation(['plugin', '--profile', profile, 'remove', '@sessionbus/dsh'], `${profile}-remove-package`);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).dependencies?.['@sessionbus/dsh'], undefined);
    console.log(`${profile}: native rows removal then native package removal: PASS`);
  }
  fs.writeFileSync(path.join(work, 'timings.json'), JSON.stringify(timings, null, 2));
} catch (error) { primary = error; throw error; }
finally {
  const cleanup = await Promise.allSettled([...children].map(child => stop(child, child.pid, true)));
  fs.rmSync(sockets, { recursive: true, force: true });
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'owned proof process cleanup failed');
}
