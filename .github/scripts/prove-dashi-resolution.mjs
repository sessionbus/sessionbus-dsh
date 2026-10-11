import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Metadata-only coexistence oracle; dashi's own matrix proves its mounted provider. */
export function inspectDashiResolution(ctx, profile, appVersion, candidateVersion) {
  const importer = pathToFileURL(path.join(profile.dir, 'cordis.yml')).href;
  const app = ctx.pluginPackages.packageOf('@antst/dashi-app', importer);
  assert.equal(app?.version, appVersion);
  const direct = ctx.pluginPackages.packageOf('@sessionbus/dsh', importer);
  const patch = app.manifest.dsh.bundle.patch;
  assert.equal(typeof patch, 'string', 'published app owns the composition importer');
  const bundled = ctx.pluginPackages.packageOf('@sessionbus/dsh', pathToFileURL(fs.realpathSync(path.join(app.dir, patch))).href);
  assert.equal(direct?.version, candidateVersion);
  const pin = app.manifest.dependencies['@sessionbus/dsh'];
  assert.equal(bundled?.version, pin);
  const paths = new Set([direct, bundled].map(pkg => fs.realpathSync(pkg.manifestPath)));
  const expectedCopies = candidateVersion === pin ? 1 : 2;
  assert.equal(paths.size, expectedCopies, 'equal versions must share a canonical path; different versions coexist');
  assert.equal(direct.manifest.dependencies?.['@antst/dsh-file-uploads-none'], undefined);
  assert.equal(direct.manifest.peerDependencies?.['@antst/dsh-file-uploads-none'], undefined);
  return {
    dashiApp: app.version,
    profileImporter: { version: direct.version, path: fs.realpathSync(direct.manifestPath) },
    dashiAppImporter: { version: bundled.version, path: fs.realpathSync(bundled.manifestPath) },
    distinctResolvedCopies: paths.size, expectedPluginCopies: expectedCopies, overrides: false,
    providerPackageFromCandidate: false,
    appProviderPin: app.manifest.dependencies['@antst/dsh-file-uploads-none'],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Prepared project operations regression. This explicit test operand is NOT a universal CLI locator.
  const [home, appVersion, candidateVersion] = process.argv.slice(2);
  assert.ok(home && appVersion && candidateVersion, 'pass PROJECT_INSTALL APP_VERSION CANDIDATE_VERSION');
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
    const report = inspectDashiResolution(ctx, profile, appVersion, candidateVersion);
    console.log(JSON.stringify(report));
    console.log(report.expectedPluginCopies === 1
      ? `dashi shared plugin: candidate ${candidateVersion} equals app pin ${report.dashiAppImporter.version}; ONE canonical copy: PASS (metadata, not TUI boot)`
      : `dashi coexistence: direct ${candidateVersion} beside app pin ${report.dashiAppImporter.version}; TWO resolved copies: PASS; candidate-inside-dashi not claimed`);
    console.log('candidate contributes no external provider package; dashi provider mounting is owned by the dashi matrix, not this metadata proof');
  } finally { await ctx.fiber.dispose(); }
}
