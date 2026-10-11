import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertEmptyGroup, stopOwnedChild, installInterruptCleanup } from './proof-process-group.mjs';

const [work, command, home, repo] = process.argv.slice(2);
assert.ok(work && command && home && repo);
const began = Date.now();
fs.mkdirSync(work, { recursive: true });
const controlHome = path.join(work, 'home');
const baselinePatch = fs.readFileSync(path.join(home, 'profiles/sessionbus/cordis.patch.yml'));
// The old native editor rewrites the patch. Preserve the in-place-upgrade
// baseline by running its actual installed packages in a separate owned copy.
fs.cpSync(path.join(home, 'profiles/sessionbus'), path.join(controlHome, 'profiles/sessionbus'), { recursive: true });
const pluginFile = path.join(controlHome, 'profiles/sessionbus/node_modules/@sessionbus/dsh/package.json');
assert.equal(JSON.parse(fs.readFileSync(pluginFile)).version, '0.1.0-pre.20');
const children = new Set(), beforeSpawn = installInterruptCleanup(children);
beforeSpawn();
const child = spawn(process.execPath, [path.join(repo, '.github/scripts/prove-lane-options.mjs'),
  path.join(work, 'proof'), command, controlHome, repo], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
children.add(child);
let errors = '', primary;
child.stdout.on('data', bytes => fs.appendFileSync(path.join(work, 'before.stdout'), bytes));
child.stderr.on('data', bytes => { errors += bytes; fs.appendFileSync(path.join(work, 'before.stderr'), bytes); });
child.ended = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); });
});
try {
  assert.deepEqual(await child.ended, { code: 1, signal: null }, errors);
  assertEmptyGroup(child); children.delete(child);
  assert.match(errors, /AssertionError.*model-effort: profile bytes after (?:open|turn \(async default-save control\)|shutdown)/su);
  const original = fs.readFileSync(path.join(work, 'proof/profile-before.patch'));
  const changed = fs.readFileSync(path.join(controlHome, 'profiles/sessionbus/cordis.patch.yml'));
  assert.equal(original.equals(changed), false, 'the expected failure must be the real native async patch write');
  assert.deepEqual(fs.readFileSync(path.join(home, 'profiles/sessionbus/cordis.patch.yml')), baselinePatch, 'the original upgrade baseline stays untouched');
  console.log(`W-126 published pre.20 failing-first: native async profile mutation caught by the SAME options proof: PASS (${Date.now() - began} ms)`);
} catch (error) { primary = error; throw error; }
finally {
  const cleanup = await Promise.allSettled([...children].map(child => stopOwnedChild(child, child.pid, true)));
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'old-source proof cleanup failed');
}
