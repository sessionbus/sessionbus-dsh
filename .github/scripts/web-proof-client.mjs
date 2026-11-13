import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

// Line buffering is intentional: a login link may be split across stream chunks.
export const redactWebOutput = value => String(value)
  .replace(/https?:\/\/[^\s"'<>]*[?&]token=[^\s"'<>]*/gu, '[login redacted]')
  .replace(/[?&]token=[^\s"'<>]*/gu, '[login redacted]');
export function captureRedacted(stream, write) {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  lines.on('line', line => write(redactWebOutput(line) + '\n'));
  return lines;
}
export const nativeArguments = (patch, port) => [
  '--profile', 'web', '--patch', patch, '--no-open', '--host', '127.0.0.1', '--port', port,
];

// Own native stdout is consumed in RAM. Neither the launch URL nor cookie is an
// argument or an evidence file. The surrounding proof still owns this group.
async function main([dsh, patch, port, sessionFile, capture]) {
  assert.ok(dsh && patch && port && sessionFile && capture);
  const child = spawn(dsh, nativeArguments(patch, port), { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', ended = false;
  child.stdout.on('data', chunk => { output += chunk; });
  captureRedacted(child.stdout, text => process.stdout.write(text));
  captureRedacted(child.stderr, text => process.stderr.write(text));
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { ended = true; resolve({ code, signal }); });
  });
  const stop = () => { if (!ended) child.kill('SIGTERM'); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const until = async read => {
    for (let attempt = 0; attempt < 600; attempt++) {
      assert.equal(ended, false, 'native web process ended before proof input');
      const value = read(); if (value) return value;
      await delay(50);
    }
    throw new Error('native web proof observation timed out');
  };
  try {
    const launch = await until(() => /dsh web: (http:\/\/[^\r\n\s]+)\r?\n/u.exec(output)?.[1]);
    const login = await fetch(launch, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    assert.equal(login.status, 303);
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie, 'native login supplies its session cookie');
    const origin = new URL(launch).origin;
    const rpc = async (method, args) => {
      const response = await fetch(`${origin}/api/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      assert.equal(body.result?.ok, true, `${method}: native RPC refused`);
      return body.result.value;
    };
    const created = await rpc('session/create', { request: {} });
    fs.writeFileSync(sessionFile, created.sessionId);
    await rpc('session/selectModel', { request: { sessionId: created.sessionId, provider: 'deepseek-official', model: 'deepseek-v4-flash' } });
    await until(() => fs.existsSync(capture) && JSON.parse(fs.readFileSync(capture, 'utf8')).hello);
    await rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId: created.sessionId,
      mode: 'queue', content: [{ type: 'text', text: 'W087_INPUT_SENTINEL' }] } });
    const result = await closed;
    assert.equal(result.signal, null, 'native web must exit normally');
    assert.equal(result.code, 0);
  } finally {
    stop(); await closed;
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(redactWebOutput(error.stack)); process.exitCode = 1; });
}
