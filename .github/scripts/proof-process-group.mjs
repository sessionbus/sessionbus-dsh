import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/** Diagnostic process membership, never CLI/package identity or a name lookup. */
export function assertNativeInGroup(child, nativePid) {
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0);
  assert.ok(Number.isSafeInteger(nativePid) && nativePid > 0);
  const result = spawnSync('ps', ['-p', String(nativePid), '-o', 'pgid='], { encoding: 'utf8' });
  assert.equal(result.status, 0, `native pid ${nativePid} must still exist`);
  assert.equal(result.stdout.trim(), String(child.pid), 'reported native pid must belong to this owned proof group');
}

/** Only a group created by the proof child's detached spawn is signalled. */
export function signalOwnedGroup(child, signal) {
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0);
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

/** An exited wrapper is not evidence that its native descendants are gone. */
export function emptyGroup(child) {
  const result = spawnSync('ps', ['-axo', 'pgid='], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return !result.stdout.split('\n').some(line => line.trim() === String(child.pid));
}
export function assertEmptyGroup(child) {
  assert.equal(emptyGroup(child), true, `owned proof group ${child.pid} must be empty`);
}

/** Native stop fails on leaked descendants BEFORE cleanup is allowed to kill. */
export async function stopOwnedChild(child, nativePid = child.pid, cleanup = false) {
  if (cleanup) signalOwnedGroup(child, 'SIGTERM');
  else if (!child.hasEnded) { assertNativeInGroup(child, nativePid); process.kill(nativePid, 'SIGTERM'); }
  let bound;
  try {
    const result = await Promise.race([child.ended, new Promise((_, reject) => {
      // DSH alpha.1/alpha.2 profile-boot createProcessShutdown:11-12,43-46:
      // native shutdown grace 5000 + margin 5000; cleanup escalation stays 5000.
      bound = setTimeout(() => {
        if (cleanup) signalOwnedGroup(child, 'SIGKILL');
        else reject(new Error(`native stop timed out in owned proof group ${child.pid}`));
      }, cleanup ? 5000 : 5000 + 5000);
    })]);
    const end = Date.now() + (cleanup ? 6500 : 1000);
    while (!emptyGroup(child) && Date.now() < end) await delay(25);
    assertEmptyGroup(child);
    return result;
  } finally { clearTimeout(bound); }
}
