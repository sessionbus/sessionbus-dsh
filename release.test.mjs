import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { metadata, registryState } from './.github/scripts/release-archive.mjs';

const manifest = { name: '@sessionbus/dsh', version: '0.1.1' };
const sha = '1'.repeat(64), file = 'sessionbus-dsh-0.1.1.tgz', line = `${sha}  ${file}`;
test('release validator rejects nonplain versions, wrong tags and checksum annotations', () => {
  assert.equal(metadata('v0.1.1', manifest, `release\n${line}`, 'tag').archive, file);
  for (const version of ['0.1.1-pre.1', '0.1.1+build', '00.1.1', '0.01.1', '0.1.01', '1.1', 'garbage']) {
    assert.throws(() => metadata(`v${version}`, { ...manifest, version }, line, 'tag'), /plain/u);
  }
  assert.throws(() => metadata('v0.1.2', manifest, line, 'tag'), /plain/u);
  assert.throws(() => metadata('v0.1.1', manifest, line, 'commit'), /annotated/u);
  for (const message of ['', 'invalid  archive.tgz', `${line}\n${line}`]) assert.throws(() => metadata('v0.1.1', manifest, message, 'tag'), /exactly one/u);
  assert.throws(() => metadata('v0.1.1', manifest, `${sha}  other.tgz`, 'tag'), /archive must/u);
});

test('actual validator reads an annotated tag; actual checksum rejects changed packed bytes', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionbus-release-script-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = argv => spawnSync(argv[0], argv.slice(1), { cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: path.join(directory, 'outputs') } });
  const git = (...args) => { const result = run(['git', ...args]); assert.equal(result.status, 0, result.stderr); };
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  git('init', '-q'); git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture');
  fs.writeFileSync(path.join(directory, file), 'prepared archive');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'tag', '-a', 'v0.1.1', '-m', `release\n${hash}  ${file}`);
  const script = path.resolve('.github/scripts/release-archive.mjs');
  assert.equal(run([process.execPath, script, 'validate', 'v0.1.1']).status, 0);
  assert.equal(run(['sha256sum', '-c', '.release.sha256']).status, 0);
  fs.appendFileSync(path.join(directory, file), 'tampered');
  assert.notEqual(run(['sha256sum', '-c', '.release.sha256']).status, 0);
  git('tag', 'v0.1.2');
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ ...manifest, version: '0.1.2' }));
  assert.notEqual(run([process.execPath, script, 'validate', 'v0.1.2']).status, 0);
});

test('existing registry versions must equal prepared integrity; only npm E404 means absence', () => {
  const integrity = 'sha512-exact';
  assert.equal(registryState({ status: 0, stdout: JSON.stringify(integrity) }, integrity), 'equal');
  assert.equal(registryState({ status: 1, stdout: JSON.stringify({ error: { code: 'E404' } }) }, integrity), 'absent');
  assert.throws(() => registryState({ status: 0, stdout: '"sha512-other"' }, integrity), /different/u);
  for (const code of ['E401', 'E403', 'ETIMEDOUT', 'ECONNRESET', 'E500']) {
    assert.throws(() => registryState({ status: 1, stdout: JSON.stringify({ error: { code } }) }, integrity), /absence not established/u);
  }
  for (const stdout of ['', '<html>proxy error</html>', 'null']) assert.throws(() => registryState({ status: 1, stdout }, integrity));
  assert.throws(() => registryState({ error: new Error('spawn failed'), status: null, stdout: '' }, integrity));
});
