import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

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
