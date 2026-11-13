import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Official v0.5.16 release assets, not a mutable latest selector or local cache.
export const manifestHash = 'ea2447b581a024d870c0c2d0b3833b168b793ea98cbb44649c8533b4ddff748a';
export const hostHashes = {
  'darwin-amd64': '8796b443495bcfae57a6518f88fa9566dce73288fdc619a94e88939d20eb292f',
  'darwin-arm64': '1ae2659c038f32c63b06eec6f798d3e9eaaf630743d7d5e39985cb82ec0a8b62',
  'linux-amd64': 'e183d3f2ad8b999c612238e921fcdb093a6b52342c2ba7509c47e6551c7f0a03',
  'linux-arm64': '82f81f351e4705d123d1fcb137966d9835cd401c8405a26f0a9c8905a2c74f3d',
};
export function verify(bytes, expected) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, 'published daemon release checksum');
}
async function main(directory) {
  assert.ok(directory && path.isAbsolute(directory));
  const host = `${process.platform}-${process.arch === 'x64' ? 'amd64' : process.arch}`;
  assert.ok(hostHashes[host], 'supported published host asset');
  fs.mkdirSync(directory, { recursive: true });
  const base = 'https://github.com/sessionbus/sessionbus/releases/download/v0.5.16';
  const get = async (name, expected) => {
    const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(60000) });
    assert.equal(response.ok, true, `release asset ${name}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer()); verify(bytes, expected);
    fs.writeFileSync(path.join(directory, name), bytes); return bytes;
  };
  const sums = (await get('SHA256SUMS', manifestHash)).toString('utf8'), archive = `sessionbus-host-${host}.tar.gz`;
  assert.ok(sums.split('\n').includes(`${hostHashes[host]}  ${archive}`));
  await get(archive, hostHashes[host]);
  execFileSync('tar', ['-xzf', path.join(directory, archive), '-C', directory]);
  const bin = path.join(directory, 'bin/sessionbus');
  assert.match(execFileSync(bin, ['--version'], { encoding: 'utf8' }), /^sessionbus v0\.5\.16 /u);
  process.stdout.write(bin + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
