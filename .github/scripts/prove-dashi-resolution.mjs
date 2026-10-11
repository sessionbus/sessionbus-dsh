import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { providerInventory } from './prove-upload-provider.mjs';

const [home, appVersion, candidateVersion] = process.argv.slice(2);
assert.ok(home && appVersion && candidateVersion, 'pass HOME APP_VERSION CANDIDATE_VERSION');
const native = createRequire(fs.realpathSync(path.join(home, 'package.json')));
const anchor = fs.realpathSync(native.resolve('@deepseek-ai/dsh/package.json'));
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
  const provider = '@antst/dsh-file-uploads-none';
  const providers = [app, direct, bundled].map(pkg => {
    const owner = createRequire(fs.realpathSync(pkg.manifestPath));
    const entry = fs.realpathSync(owner.resolve(provider));
    return { importer: fs.realpathSync(pkg.manifestPath), path: entry,
      version: JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry), '../package.json'))).version };
  });
  console.log(JSON.stringify({
    dashiApp: app.version,
    profileImporter: { version: direct.version, path: fs.realpathSync(direct.manifestPath) },
    dashiAppImporter: { version: bundled.version, path: fs.realpathSync(bundled.manifestPath) },
    distinctResolvedCopies: paths.size,
    overrides: false,
    providers,
    providerInventory: providerInventory(profile.dir),
  }));
  console.log(`dashi coexistence: direct @sessionbus/dsh ${direct.version} beside dashi-app's pinned ${bundled.version}; ${paths.size} resolved copies; candidate-inside-dashi not claimed`);
  console.log('dashi uploads-provider coexistence/negative control: importer paths and total counts reported; ONE-provider PASS not claimed until dashi-app re-pins');
} finally {
  await ctx.fiber.dispose();
}
