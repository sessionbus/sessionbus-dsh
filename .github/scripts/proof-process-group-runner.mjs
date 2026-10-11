import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { assertNativeInGroup, assertEmptyGroup, emptyGroup, signalOwnedGroup, stopOwnedChild } from './proof-process-group.mjs';

// Shell proofs use the same portable detached-spawn/group checks as Node proofs.
const [action, file, role, ...argv] = process.argv.slice(2);
assert.ok(file && ['run', 'stop', 'cleanup', 'signal'].includes(action));
if (action === 'run') {
  assert.ok(['native', 'fixture'].includes(role) && argv.length);
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'inherit' });
  child.ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); });
  });
  let primary;
  try {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ pid: child.pid, role }), { flag: 'wx' });
    fs.renameSync(`${file}.tmp`, file);
    const result = await child.ended;
    await stopOwnedChild(child); // No normal-stop cleanup kill: leaked descendants fail.
    assert.equal(result.code, 0, `owned ${role} must exit 0 (signal=${result.signal})`);
  } catch (error) { primary = error; throw error; }
  finally {
    try { await stopOwnedChild(child, child.pid, true); }
    catch (cleanup) { throw new AggregateError(primary ? [primary, cleanup] : [cleanup], 'owned shell proof cleanup failed'); }
  }
} else {
  const child = JSON.parse(fs.readFileSync(file));
  if (action === 'signal') {
    assertNativeInGroup(child, child.pid); signalOwnedGroup(child, role);
  } else if (action === 'stop') {
    if (!emptyGroup(child)) { assertNativeInGroup(child, child.pid); process.kill(child.pid, 'SIGTERM'); }
    // Native shutdown grace 5000 + margin 5000 (profile-boot:11-12,43-46).
    const end = Date.now() + 5000 + 5000;
    while (!emptyGroup(child) && Date.now() < end) await delay(25);
    assertEmptyGroup(child); // Failure stays failure even if the runner cleans up later.
  } else {
    signalOwnedGroup(child, 'SIGTERM');
    const end = Date.now() + 5000;
    while (!emptyGroup(child) && Date.now() < end) await delay(25);
    if (!emptyGroup(child)) signalOwnedGroup(child, 'SIGKILL');
    const killed = Date.now() + 1500;
    while (!emptyGroup(child) && Date.now() < killed) await delay(25);
    assertEmptyGroup(child);
  }
}
