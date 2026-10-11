import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { assertEmptyGroup, signalOwnedGroup, stopOwnedChild } from './proof-process-group.mjs';

const [work, commandJSON, candidate, repo] = process.argv.slice(2);
assert.ok(work && commandJSON && candidate && repo);
const cli = JSON.parse(commandJSON), home = path.join(work, 'home'), workspace = path.join(work, 'workspace');
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
const env = { ...process.env, DSH_HOME: home };
for (const key of Object.keys(env)) if (key.startsWith('SESSIONBUS_')) delete env[key];
const children = new Set();
let primary;
function start(argv, label) {
  const child = spawn(argv[0], argv.slice(1), { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child); child.output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { child.output += chunk; fs.appendFileSync(path.join(work, `${label}.log`), chunk); });
  child.ended = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); }); });
  return child;
}
async function run(argv, label) {
  const child = start(argv, label), acquisition = argv.includes('add');
  const bound = acquisition ? undefined : setTimeout(() => signalOwnedGroup(child, 'SIGTERM'), 120_000);
  const hardBound = acquisition ? undefined : setTimeout(() => signalOwnedGroup(child, 'SIGKILL'), 125_000);
  try { const result = await child.ended; assertEmptyGroup(child); children.delete(child); return { ...result, output: child.output }; }
  finally { clearTimeout(bound); clearTimeout(hardBound); }
}
try {
  const stock = await run([...cli, '--profile', 'headless', '--help'], 'stock-alpha1');
  assert.equal(stock.code, 0, stock.output);
  const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'))).version;
  const added = await run([...cli, 'plugin', '--profile', 'sessionbus', 'add', '--save-exact', candidate], 'native-add-refusal');
  assert.notEqual(added.code, 0, added.output);
  assert.ok(added.output.includes(`Plugin @sessionbus/dsh@${version} is incompatible with dsh 0.2.1-alpha.1`), added.output);
  const profile = path.join(home, 'profiles/sessionbus');
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'package.json'))).dependencies?.['@sessionbus/dsh'], undefined);

  // Labelled forced-install control: bypass ONLY DSH's add, never grant an exemption.
  const forced = await run(['pnpm', '--dir', profile, 'add', '--save-exact', '--ignore-scripts', candidate], 'forced-package-control');
  assert.equal(forced.code, 0, forced.output);
  const rows = await run([process.execPath, path.join(profile, 'node_modules/@sessionbus/dsh/bin.mjs')], 'rows-only-control');
  assert.equal(rows.code, 0, rows.output);
  const manifest = fs.readFileSync(path.join(profile, 'package.json')), patch = fs.readFileSync(path.join(profile, 'cordis.patch.yml'));
  const boot = start([...cli, '--profile', 'sessionbus'], 'forced-native-refusal');
  const wanted = `Plugin @sessionbus/dsh@${version} is incompatible with dsh 0.2.1-alpha.1`;
  let observed = false;
  for (let count = 0; count < 300; count++) {
    if (boot.output.includes(wanted) && boot.output.includes('disabling profile plugin row')) { observed = true; break; }
    await delay(100);
  }
  assert.equal(observed, true, boot.output);
  const stopped = await stopOwnedChild(boot); children.delete(boot);
  assert.deepEqual(fs.readFileSync(path.join(profile, 'package.json')), manifest);
  assert.deepEqual(fs.readFileSync(path.join(profile, 'cordis.patch.yml')), patch);
  fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify({ nativeAddRefused: true, forcedBootDisabledRows: true,
    stop: stopped, profileBytesUnchanged: true, version: '0.2.1-alpha.1', candidate: version }, null, 2));
  console.log('native alpha.1 add refuses the declared floor; forced boot disables rows readably; no installer CLI inference: PASS');
} catch (error) { primary = error; throw error; }
finally {
  const outcomes = await Promise.allSettled([...children].map(async child => {
    await stopOwnedChild(child, child.pid, true);
  }));
  const failures = outcomes.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'owned floor-proof cleanup failed');
}
