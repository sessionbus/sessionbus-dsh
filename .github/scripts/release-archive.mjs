import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function metadata(tag, manifest, message, type) {
  const plain = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
  if (!plain.test(manifest.version) || tag !== `v${manifest.version}`) throw new Error('release tag must match the plain package version (no prerelease or build metadata)');
  if (type !== 'tag') throw new Error('release requires an annotated tag');
  if (message.includes('\r')) throw new Error('annotated tag message must not contain a carriage return');
  const hashes = message.match(/(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])/giu) ?? [];
  const lines = message.split('\n').filter(line => /^[a-f0-9]{64}  [a-zA-Z0-9._-]+\.tgz$/iu.test(line));
  if (hashes.length !== 1 || lines.length !== 1) throw new Error('annotated tag must contain exactly one SHA256 archive line and one 64-hex token');
  const [, archive] = lines[0].split('  ');
  const expected = `${manifest.name.replace(/^@/u, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
  if (archive !== expected) throw new Error(`tag archive must be ${expected}`);
  return { version: manifest.version, archive, checksum: `${lines[0]}\n` };
}

export function registryState(result, integrity) {
  if (result.error || result.signal) throw result.error ?? new Error('registry query interrupted');
  let value;
  try { value = JSON.parse(result.stdout); } catch { throw new Error('registry query did not return valid JSON; absence not established'); }
  if (result.status !== 0) {
    // npm view --json documents E404 for an absent package/version. No other
    // error (including auth, transport, or malformed output) means absence.
    if (value?.error?.code === 'E404') return 'absent';
    throw new Error(`registry query failed (${value?.error?.code ?? result.status}); absence not established`);
  }
  if (value !== integrity) throw new Error('existing registry version has different archive integrity');
  return 'equal';
}

function command(argv) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${argv[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, value] = process.argv.slice(2);
  try {
    if (mode === 'validate') {
      const ref = `refs/tags/${value}`;
      const type = command(['git', 'cat-file', '-t', ref]).trim();
      const object = command(['git', 'cat-file', '-p', ref]);
      const message = object.slice(object.indexOf('\n\n') + 2);
      const info = metadata(value, JSON.parse(fs.readFileSync('package.json', 'utf8')), message, type);
      fs.writeFileSync('.release.sha256', info.checksum);
      const outputs = `version=${info.version}\narchive=${info.archive}\n`;
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs);
      process.stdout.write(outputs);
    } else if (mode === 'registry') {
      const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(value)).digest('base64')}`;
      const result = spawnSync('npm', ['view', `${manifest.name}@${manifest.version}`, 'dist.integrity', '--json'], { encoding: 'utf8' });
      fs.writeFileSync('.release-view.stdout', result.stdout ?? '');
      fs.writeFileSync('.release-view.stderr', result.stderr ?? '');
      const state = registryState(result, integrity);
      process.stdout.write(`Registry archive: ${state}\n`);
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${state}\n`);
    } else throw new Error('usage: release-archive.mjs validate TAG | registry ARCHIVE');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
