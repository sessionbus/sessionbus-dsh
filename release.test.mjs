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

test('release validator refuses every second 64-hex token and every carriage return', () => {
  const other = 'A'.repeat(64);
  for (const extra of [`${other} ${file}`, `${other} *${file}`, ` ${other}  ${file}`, `checksum=${other}`]) {
    assert.throws(() => metadata('v0.1.1', manifest, `${line}\n${extra}`, 'tag'), /exactly one/u);
  }
  for (const message of [`${line}\r`, `release\r\n${line}`, `release\rtext\n${line}`]) {
    assert.throws(() => metadata('v0.1.1', manifest, message, 'tag'), /carriage return/u);
  }
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
  const validated = run([process.execPath, script, 'validate', 'v0.1.1']);
  assert.equal(validated.status, 0);
  const outputs = `version=0.1.1\narchive=${file}\n`;
  assert.equal(validated.stdout, outputs);
  assert.equal(fs.readFileSync(path.join(directory, 'outputs'), 'utf8'), outputs);
  assert.equal(fs.readFileSync(path.join(directory, '.release.sha256'), 'utf8'), `${hash}  ${file}\n`);
  assert.equal(run(['sha256sum', '-c', '.release.sha256']).status, 0);
  fs.appendFileSync(path.join(directory, file), 'tampered');
  assert.notEqual(run(['sha256sum', '-c', '.release.sha256']).status, 0);
  git('tag', 'v0.1.2');
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ ...manifest, version: '0.1.2' }));
  assert.notEqual(run([process.execPath, script, 'validate', 'v0.1.2']).status, 0);
});

test('actual validator preserves a terminal CR in the annotated tag and refuses it', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionbus-release-cr-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = (argv, input) => spawnSync(argv[0], argv.slice(1), { cwd: directory, input, encoding: 'utf8' });
  const git = (...args) => { const result = run(['git', ...args]); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  git('init', '-q'); git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture');
  const object = `object ${git('rev-parse', 'HEAD')}\ntype commit\ntag v0.1.1\ntagger fixture <fixture@example.invalid> 1 +0000\n\n${line}\r\n`;
  const stored = run(['git', 'hash-object', '-t', 'tag', '-w', '--stdin'], object);
  assert.equal(stored.status, 0, stored.stderr); git('update-ref', 'refs/tags/v0.1.1', stored.stdout.trim());
  const result = run([process.execPath, path.resolve('.github/scripts/release-archive.mjs'), 'validate', 'v0.1.1']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /carriage return/u);
  assert.equal(fs.existsSync(path.join(directory, '.release.sha256')), false);
});

test('existing registry versions must equal prepared integrity; only npm E404 means absence', () => {
  const record = name => JSON.parse(fs.readFileSync(new URL(`./.github/fixtures/release-registry/${name}.json`, import.meta.url)));
  const success = record('success'), integrity = JSON.parse(success.stdout);
  assert.equal(registryState(success, integrity), 'equal');
  assert.equal(registryState(record('not-found'), integrity), 'absent');
  assert.throws(() => registryState(success, 'sha512-other'), /different/u);
  assert.throws(() => registryState(record('unreachable'), integrity), /ECONNREFUSED.*absence not established/u);
  assert.throws(() => registryState({ ...success, stdout: success.stdout.slice(0, -2) }, integrity), /valid JSON/u);
  for (const code of ['E401', 'E403', 'ETIMEDOUT', 'ECONNRESET', 'E500']) {
    assert.throws(() => registryState({ status: 1, stdout: JSON.stringify({ error: { code } }) }, integrity), /absence not established/u);
  }
  for (const stdout of ['', '<html>proxy error</html>', 'null']) assert.throws(() => registryState({ status: 1, stdout }, integrity));
  assert.throws(() => registryState({ error: new Error('spawn failed'), status: null, stdout: '' }, integrity));
});

test('actual registry script replays recorded npm outcomes and emits only verified state', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionbus-release-registry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, 'bin'); fs.mkdirSync(bin);
  const npm = path.join(bin, 'npm');
  fs.writeFileSync(npm, `#!/usr/bin/env node\nconst fs=require('node:fs'),assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),['view','@sessionbus/dsh@0.1.1','dist.integrity','--json']);const record=JSON.parse(fs.readFileSync(process.env.NPM_RECORDED_RESULT));process.stdout.write(record.stdout);process.exitCode=record.status;\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
  const archive = path.join(directory, file), bytes = Buffer.from('private prepared archive fixture');
  fs.writeFileSync(archive, bytes);
  const integrity = `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
  const record = name => JSON.parse(fs.readFileSync(new URL(`./.github/fixtures/release-registry/${name}.json`, import.meta.url)));
  const success = record('success');
  // Equal case retains the recorded successful output shape but binds the
  // integrity to our private bytes; no registry-existence claim is made.
  for (const [name, response, state, error] of [
    ['equal', { ...success, stdout: JSON.stringify(integrity) + '\n' }, 'equal'],
    ['different', success, undefined, /different archive integrity/u],
    ['not-found', record('not-found'), 'absent'],
    ['unreachable', record('unreachable'), undefined, /ECONNREFUSED.*absence not established/u],
    ['malformed', { ...success, stdout: success.stdout.slice(0, -2) }, undefined, /valid JSON/u],
  ]) {
    const replay = path.join(directory, name + '.json'), outputs = path.join(directory, name + '.outputs');
    fs.writeFileSync(replay, JSON.stringify(response));
    const result = spawnSync(process.execPath, [path.resolve('.github/scripts/release-archive.mjs'), 'registry', file], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, NPM_RECORDED_RESULT: replay, GITHUB_OUTPUT: outputs },
    });
    if (state) {
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, `Registry archive: ${state}\n`);
      assert.equal(fs.readFileSync(outputs, 'utf8'), `state=${state}\n`);
    } else {
      assert.notEqual(result.status, 0); assert.match(result.stderr, error); assert.equal(fs.existsSync(outputs), false);
    }
    assert.equal(fs.readFileSync(path.join(directory, '.release-view.stdout'), 'utf8'), response.stdout);
    assert.deepEqual(fs.readFileSync(archive), bytes);
  }
});
