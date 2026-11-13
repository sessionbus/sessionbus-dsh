import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { assertEmptyGroup, signalOwnedGroup, stopOwnedChild, installInterruptCleanup } from './proof-process-group.mjs';

const [work, commandJSON, candidate] = process.argv.slice(2);
assert.ok(work && commandJSON && candidate);
const cli = JSON.parse(commandJSON), home = path.join(work, 'home');
fs.mkdirSync(home, { recursive: true });
const env = { ...process.env, DSH_HOME: home };
for (const key of Object.keys(env)) if (key.startsWith('SESSIONBUS_')) delete env[key];
const children = new Set();
const beforeSpawn = installInterruptCleanup(children);
let primary;
async function run(args, label, observedFile) {
  beforeSpawn();
  // Native stdio apps exit on EOF at readiness. Keep our observer input open
  // until the public inventory is collected, rather than racing host disposal.
  const child = spawn(cli[0], [...cli.slice(1), ...args], { cwd: work, env, detached: true, stdio: [observedFile ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  children.add(child); let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; fs.appendFileSync(path.join(work, `${label}.log`), chunk); });
  child.ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { child.hasEnded = true; resolve({ code, signal }); }); });
  const acquisition = args[0] === 'plugin' && args.includes('add');
  const milliseconds = args.includes('exec') ? 10_000 : 60_000;
  const bound = acquisition ? undefined : setTimeout(() => signalOwnedGroup(child, 'SIGTERM'), milliseconds);
  const hard = acquisition ? undefined : setTimeout(() => signalOwnedGroup(child, 'SIGKILL'), milliseconds + 5000);
  try {
    if (observedFile) {
      for (let count = 0; count < 300 && !fs.existsSync(observedFile); count++) await delay(100);
      assert.ok(fs.existsSync(observedFile), output);
      const { nativePid } = JSON.parse(fs.readFileSync(observedFile));
      await stopOwnedChild(child, nativePid);
    }
    const result = await child.ended; assert.equal(result.signal, null, output); assertEmptyGroup(child); children.delete(child); return { ...result, output };
  }
  finally { clearTimeout(bound); clearTimeout(hard); }
}
const observer = path.join(work, 'observe.cjs');
fs.writeFileSync(observer, `const fs=require('node:fs');
const path=require('node:path'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
exports.inject=['loader','pluginPackages','profileContext','fileUploads','appReady'];
exports.apply=async(ctx,config)=>{
 const native=createRequire(ctx.profileContext.installAnchor);
 const {readPluginInventory}=await import(pathToFileURL(native.resolve('@deepseek-ai/dsh-host-plugin-inventory')));
 const {composeEntries,readProfilePatches}=await import(pathToFileURL(native.resolve('@deepseek-ai/dsh-app-boot')));
 ctx.appReady.onReady(async()=>{
 const composed=composeEntries(readProfilePatches('dsh',ctx.profileContext)), buses=[];
 const walk=value=>{if(!value||typeof value!=='object')return;if(value.id==='sessionbus')buses.push(value);for(const child of Object.values(value))walk(child);};
 walk(composed);
 const rows=(await readPluginInventory(ctx)).entries;
 const providers=rows.filter(row=>row.enabled&&row.fiberPhase==='active'&&['@antst/dsh-file-uploads-none','@sessionbus/dsh/file-uploads-none'].includes(row.moduleName));
 if(providers.length!==1)throw Error('expected sole active configured upload row');
 for(const method of ['registerAgentResolver','resolve','bindPrompt','retirePrompt'])if(typeof ctx.fileUploads[method]!=='function')throw Error('missing native upload behavior '+method);
 const provider=providers[0],importer=pathToFileURL(path.join(ctx.profileContext.dir,'cordis.yml')).href;
 const owner=ctx.pluginPackages.packageOf(provider.moduleName,importer);
 fs.writeFileSync(config.destination+'.tmp',JSON.stringify({nativePid:process.pid,product:buses.at(-1)?.config?.product,provider:provider.moduleName,owner:{name:owner.name,version:owner.version,path:owner.manifestPath},services:providers.length,productEvidence:'public composition; actual hello covered by native lane/peer gates'}));
 fs.renameSync(config.destination+'.tmp',config.destination);
 });
};\n`);
try {
  for (const kind of ['sessionbus', 'file-uploads-none']) {
    const name = `overlap-${kind}`, bundle = path.join(work, `${kind}-bundle`);
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, 'package.json'), JSON.stringify({ name: `@sessionbus/w125-${kind}-app`, version: '1.0.0',
      dsh: { bundle: { patch: kind === 'sessionbus' ? ['plugin.yml', 'provider.yml'] : ['provider.yml', 'plugin.yml'] } } }));
    fs.writeFileSync(path.join(bundle, 'provider.yml'), JSON.stringify([{ insert: [
      { id: 'file-uploads-none', name: '@antst/dsh-file-uploads-none' },
      { id: 'workspace', name: '@deepseek-ai/dsh-workspace' },
      { id: 'session-controller', name: '@deepseek-ai/dsh-api-session-controller' },
    ] }]));
    fs.writeFileSync(path.join(bundle, 'plugin.yml'), JSON.stringify(kind === 'sessionbus' ? [{ insert: [
      { id: 'sessionbus', name: '@sessionbus/dsh', config: { product: 'app-peer' } },
    ] }] : []));
    const added = await run(['plugin', '--profile', name, 'add', '--save-exact', candidate, bundle, '@antst/dsh-file-uploads-none@0.2.0-alpha.2'], `${kind}-native-add`);
    assert.equal(added.code, 0, added.output);
    const directory = path.join(home, 'profiles', name), patchFile = path.join(directory, 'cordis.patch.yml');
    const files = ['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml'].map(file => path.join(directory, file));
    const before = files.map(file => fs.readFileSync(file));
    assert.match(before[2].toString(), /\[\]/u, 'this is the stock array patch DSH itself wrote');
    async function observe(label) {
      const destination = path.join(work, `${kind}-${label}.json`), overlay = path.join(work, `${kind}-${label}.yml`);
      fs.writeFileSync(overlay, `- id: headless-startup\n  disabled: true\n- id: headless-runner\n  disabled: true\n- insert:\n    - name: ${JSON.stringify(observer)}\n      config: ${JSON.stringify({ destination })}\n`);
      // --help disposes the host while this async public inventory is reading.
      // Observe an ordinary live composition, then stop our own process below.
      const result = await run(['--profile', name, '--patch', overlay], `${kind}-${label}`, destination);
      assert.equal(result.code, 0, result.output);
      return { ...JSON.parse(fs.readFileSync(destination)), output: result.output };
    }
    const original = await observe('original');
    assert.equal(original.provider, '@antst/dsh-file-uploads-none');
    if (kind === 'sessionbus') assert.equal(original.product, 'app-peer');
    const refused = await run(['plugin', '--profile', name, 'exec', 'sessionbus-dsh-install', '--product', 'dsh', name], `${kind}-guard`);
    assert.notEqual(refused.code, 0, refused.output);
    assert.ok(refused.output.includes(`profile "${name}" app "@sessionbus/w125-${kind}-app" already provides ${kind === 'sessionbus' ? 'Sessionbus' : 'the upload provider'}; there is nothing to install`), refused.output);
    files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index], 'guard refusal is byte-identical'));
    // Failing-first control: put the would-be profile rows after the bundle,
    // bypassing only our guard, to observe DSH's designed collapse-by-id.
    fs.writeFileSync(patchFile, JSON.stringify([{ insert: [
      ...(kind === 'sessionbus' ? [{ id: 'sessionbus', name: '@sessionbus/dsh', config: { product: 'dsh' } }] : []),
      { id: 'file-uploads-none', name: '@sessionbus/dsh/file-uploads-none' },
    ] }]));
    const shadowed = await observe('without-guard');
    assert.equal(shadowed.provider, '@sessionbus/dsh/file-uploads-none');
    assert.equal(shadowed.services, 1);
    if (kind === 'sessionbus') assert.equal(shadowed.product, 'dsh');
    assert.doesNotMatch(shadowed.output, /duplicate loader entry|already provides/u, 'native override is silent');
    fs.writeFileSync(patchFile, before[2]);
    fs.writeFileSync(path.join(work, `${kind}-result.json`), JSON.stringify({ original, shadowed, guardRefused: true, profileByteIdentical: true }, null, 2));
    console.log(`native ${kind} overlap: without guard silent replacement; with guard refusal and unchanged native-array profile: PASS`);
  }
} catch (error) { primary = error; throw error; }
finally {
  const cleanup = await Promise.allSettled([...children].map(async child => {
    await stopOwnedChild(child, child.pid, true);
  }));
  const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'owned conflict-proof cleanup failed');
}
