import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assertEmptyGroup, signalOwnedGroup } from './proof-process-group.mjs';

const [work, commandJSON, candidate] = process.argv.slice(2);
assert.ok(work && commandJSON && candidate);
const cli = JSON.parse(commandJSON), home = path.join(work, 'home');
fs.mkdirSync(home, { recursive: true });
const env = { ...process.env, DSH_HOME: home };
for (const key of Object.keys(env)) if (key.startsWith('SESSIONBUS_')) delete env[key];
async function run(args, label) {
  const child = spawn(cli[0], [...cli.slice(1), ...args], { cwd: work, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; fs.appendFileSync(path.join(work, `${label}.log`), chunk); });
  const bound = setTimeout(() => signalOwnedGroup(child, 'SIGTERM'), 60000);
  const hard = setTimeout(() => signalOwnedGroup(child, 'SIGKILL'), 65000);
  try {
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null }, output); assertEmptyGroup(child); return output;
  } finally { clearTimeout(bound); clearTimeout(hard); }
}
await run(['plugin', '--profile', 'policy-proof', 'list'], 'native-create');
const directory = path.join(home, 'profiles/policy-proof');
fs.writeFileSync(path.join(directory, '.npmrc'), 'node-linker=isolated\nauto-install-peers=false\nstrict-peer-dependencies=true\n');
fs.writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: isolated\nautoInstallPeers: false\nstrictPeerDependencies: true\n');
const patch = fs.readFileSync(path.join(directory, 'cordis.patch.yml'));
const output = await run(['plugin', '--profile', 'policy-proof', 'add', '--save-exact', '--strict-peer-dependencies', candidate], 'native-add');
assert.ok(output.includes('Issues with peer dependencies found'), output);
assert.ok(output.includes('missing peer @deepseek-ai/dsh-agent@>=0.2.1-alpha.2'), output);
assert.deepEqual(fs.readFileSync(path.join(directory, 'cordis.patch.yml')), patch);
fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify({ settings: { nodeLinker: 'isolated', autoInstallPeers: false, strictPeerDependencies: true }, command: 'dsh plugin add --save-exact --strict-peer-dependencies <candidate>', exit: 0, missingPeerWarning: true, patchUnchanged: true }, null, 2));
console.log('Linux operator isolated/auto-install-off/strict policy: ordinary native add warns about missing DSH peers and exits 0; no installer/pin/remedy invoked: PASS');

// Stock upstream reporting gap: no changed CLI, fixture plugin or diagnostic overlay.
await run(['plugin', '--profile', 'headless', 'list'], 'gap-native-create');
const manifestFile = path.join(home, 'profiles/headless/package.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile));
manifest.dsh.profile.bundles.push('@sessionbus/w125-not-installed');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const gap = await run(['--profile', 'headless', '--help'], 'stock-missing-bundle');
assert.ok(gap.includes('skipping profile bundle "@sessionbus/w125-not-installed"'), gap);
fs.writeFileSync(path.join(work, 'missing-bundle-result.json'), JSON.stringify({ missingBundle: '@sessionbus/w125-not-installed', exit: 0, skippedDiagnostic: true }, null, 2));
console.log('stock DSH missing profile bundle: skipped diagnostic with exit 0 reproduced for upstream (not runtime PASS)');
