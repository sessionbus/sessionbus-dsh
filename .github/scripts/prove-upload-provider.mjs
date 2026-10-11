import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const helper = '@antst/dsh-file-uploads-none';
export function providerInventory(profile) {
  const modules = path.join(profile, 'node_modules');
  const files = fs.readdirSync(modules, { recursive: true })
    .filter(file => file.endsWith(path.join('@antst', 'dsh-file-uploads-none', 'package.json')));
  const paths = [...new Set(files.map(file => fs.realpathSync(path.join(modules, file))))].sort();
  const lock = fs.readFileSync(path.join(profile, 'pnpm-lock.yaml'), 'utf8').split('\nsnapshots:\n')[0];
  return { physical: paths.map(file => ({ path: file, version: JSON.parse(fs.readFileSync(file)).version })),
    lockVersions: [...lock.matchAll(/^  '@antst\/dsh-file-uploads-none@([^']+)':$/gm)].map(match => match[1]) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [home, name] = process.argv.slice(2);
  assert.ok(home && name, 'usage: prove-upload-provider.mjs HOME PROFILE');
  const profileDir = path.join(home, 'profiles', name), inventory = providerInventory(profileDir);
  console.log(JSON.stringify({ profile: name, ...inventory }));
  const wanted = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'))).dependencies[helper];
  assert.equal(inventory.physical.length, 1, 'ordinary add must leave one physical provider: no cleanup');
  assert.deepEqual(inventory.lockVersions, [wanted]);
  assert.equal(inventory.physical[0].version, wanted);
  const native = createRequire(fs.realpathSync(path.join(home, 'package.json')));
  const anchor = fs.realpathSync(native.resolve('@deepseek-ai/dsh/package.json'));
  const { Context } = await import(native.resolve('@deepseek-ai/cordis'));
  const { PluginPackages, createRuntimeResolution, loadProfileDirectory } = await import(native.resolve('@deepseek-ai/dsh-app-boot'));
  const profile = loadProfileDirectory('dsh', profileDir, anchor);
  const resolution = await createRuntimeResolution({ installAnchor: anchor, profile, home });
  const ctx = new Context();
  try {
    await ctx.plugin(PluginPackages, { resolution });
    const importer = pathToFileURL(path.join(profileDir, 'cordis.yml')).href;
    const plugin = ctx.pluginPackages.packageOf('@sessionbus/dsh', importer);
    const selected = ctx.pluginPackages.packageOf(helper, importer);
    const peer = ctx.pluginPackages.packageOf(helper, pathToFileURL(fs.realpathSync(path.join(plugin.dir, 'plugin.cjs'))).href);
    assert.equal(selected.name, helper);
    assert.equal(peer.name, helper);
    assert.equal(selected.version, wanted);
    assert.equal(peer.version, wanted);
    assert.equal(fs.realpathSync(selected.manifestPath), fs.realpathSync(peer.manifestPath));
    assert.equal(fs.realpathSync(selected.manifestPath), inventory.physical[0].path);
    console.log(`${name}: one provider ${wanted}; native profile/plugin importers ${fs.realpathSync(peer.manifestPath)}: PASS`);
  } finally { await ctx.fiber.dispose(); }
}
