import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { providerInventory } from './prove-upload-provider.mjs';

const [home, appVersion, candidateVersion] = process.argv.slice(2);
assert.ok(home && appVersion && candidateVersion, 'pass HOME APP_VERSION CANDIDATE_VERSION');
const discovery = createRequire(fs.realpathSync(path.join(home, 'package.json')));
const anchor = fs.realpathSync(discovery.resolve('@deepseek-ai/dsh/package.json'));
const native = createRequire(anchor);
const { Context } = await import(native.resolve('@deepseek-ai/cordis'));
const { PluginPackages, createRuntimeResolution, loadProfileDirectory } = await import(native.resolve('@deepseek-ai/dsh-app-boot'));
const profile = loadProfileDirectory('dsh', path.join(home, 'profiles/dashi'), anchor);
const resolution = await createRuntimeResolution({ installAnchor: anchor, profile, home });
const ctx = new Context();
try {
  await ctx.plugin(PluginPackages, { resolution });
  const importer = pathToFileURL(path.join(profile.dir, 'cordis.yml')).href;
  const app = ctx.pluginPackages.packageOf('@antst/dashi-app', importer);
  assert.equal(app.version, appVersion);
  const direct = ctx.pluginPackages.packageOf('@sessionbus/dsh', importer);
  const bundled = ctx.pluginPackages.packageOf('@sessionbus/dsh', pathToFileURL(fs.realpathSync(path.join(app.dir, 'cordis.patch.yml'))).href);
  assert.equal(direct.version, candidateVersion);
  assert.equal(bundled.version, app.manifest.dependencies['@sessionbus/dsh']);
  const paths = new Set([direct, bundled].map(pkg => fs.realpathSync(pkg.manifestPath)));
  const expectedCopies = candidateVersion === app.manifest.dependencies['@sessionbus/dsh'] ? 1 : 2;
  assert.equal(paths.size, expectedCopies, 'equal plugin versions must share a canonical path; different versions must coexist');
  const provider = '@antst/dsh-file-uploads-none';
  const providers = [app, direct, bundled].map(pkg => {
    const owner = createRequire(fs.realpathSync(pkg.manifestPath));
    const entry = fs.realpathSync(owner.resolve(provider));
    const manifestPath = fs.realpathSync(path.resolve(path.dirname(entry), '../package.json'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(manifest.name, provider);
    return { importer: fs.realpathSync(pkg.manifestPath), path: entry, manifestPath, version: manifest.version };
  });
  const inventory = providerInventory(profile.dir), providerPin = app.manifest.dependencies[provider];
  for (const selected of providers) assert.equal(selected.version, providerPin, 'app owns the exact provider pin');
  assert.equal(new Set(providers.map(selected => selected.path)).size, 1, 'all three importers must share the provider');
  assert.deepEqual(inventory.lockVersions, [providerPin]);
  assert.equal(inventory.physical.length, 1, 'stale or second physical provider is a failure; no cleanup');
  assert.equal(inventory.physical[0].version, providerPin);
  for (const selected of providers) assert.equal(selected.manifestPath, inventory.physical[0].path);
  console.log(JSON.stringify({
    dashiApp: app.version,
    profileImporter: { version: direct.version, path: fs.realpathSync(direct.manifestPath) },
    dashiAppImporter: { version: bundled.version, path: fs.realpathSync(bundled.manifestPath) },
    distinctResolvedCopies: paths.size,
    expectedPluginCopies: expectedCopies,
    overrides: false,
    providers,
    providerInventory: inventory,
  }));
  console.log(expectedCopies === 1
    ? `dashi shared plugin: candidate ${direct.version} equals app pin ${bundled.version}; ONE canonical copy selected by profile and app importers: PASS (resolution, not TUI boot)`
    : `dashi coexistence: direct ${direct.version} beside app pin ${bundled.version}; TWO resolved copies required: PASS; candidate-inside-dashi not claimed`);
  console.log(`dashi upload provider ${providerPin}: ONE lock record and physical copy, shared by app and both plugin importers: PASS`);
} finally {
  await ctx.fiber.dispose();
}
