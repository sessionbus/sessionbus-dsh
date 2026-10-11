import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const [installation] = process.argv.slice(2);
assert.ok(installation && process.argv.length === 3, 'usage: prove-runtime-resolution.mjs INSTALL_DIR');
const installDir = resolve(installation);
const anchor = realpathSync(join(installDir, 'node_modules/@deepseek-ai/dsh/package.json'));
const require = createRequire(anchor);
const expected = JSON.parse(readFileSync(require.resolve('@deepseek-ai/cordis/package.json'), 'utf8'));
const negativeVersion = '4.0.4';
assert.notEqual(expected.version, negativeVersion, 'negative candidate must differ from the installation');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runbook = readFileSync(join(root, 'docs/HOST-INSTALL.md'), 'utf8');
const matches = [...runbook.matchAll(/cat >"\$ROLLBACK_ROOT\/check-profile-closure.mjs" <<'NODE'\n([\s\S]*?)\nNODE/g)];
assert.equal(matches.length, 1, 'extract exactly one documented native checker');
const fixture = mkdtempSync(join(tmpdir(), 'sessionbus-runtime-oracle-'));
try {
  const checker = join(fixture, 'check.mjs');
  writeFileSync(checker, matches[0][1]);
  for (const version of [expected.version, negativeVersion]) {
    const home = join(fixture, version);
    const profile = join(home, 'profiles/web');
    const candidate = join(profile, 'node_modules/@deepseek-ai/cordis');
    mkdirSync(candidate, { recursive: true });
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      private: true, dependencies: { '@deepseek-ai/cordis': version, '@sessionbus/dsh': '0.1.0-pre.21' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }));
    const plugin = join(profile, 'node_modules/@sessionbus/dsh');
    mkdirSync(plugin, { recursive: true });
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: '@sessionbus/dsh', version: '0.1.0-pre.21',
      main: './plugin.cjs', peerDependencies: { '@deepseek-ai/cordis': '>=4.0.5-alpha.1' } }));
    writeFileSync(join(plugin, 'plugin.cjs'), 'exports.apply = () => {};\n');
    writeFileSync(join(candidate, 'package.json'), JSON.stringify({ ...expected, version }));
    const path = realpathSync(candidate);
    const checked = spawnSync(process.execPath, [checker, 'web', installDir], {
      env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(checked.error, undefined, checked.error?.message);
    assert.equal(checked.signal, null, 'a signal is not oracle rejection');
    if (version === expected.version) {
      assert.equal(checked.status, 0, checked.stderr);
      assert.ok(checked.stdout.includes(`runtime plugin peer @deepseek-ai/cordis@${version} -> ${path}: PASS`), checked.stdout);
    } else {
      assert.equal(checked.status, 1, checked.stderr);
      assert.ok(checked.stderr.includes(`unresolved or incompatible plugin peer @deepseek-ai/cordis@${version}: >=4.0.5-alpha.1`), checked.stderr);
    }
    console.log(`native plugin importer @deepseek-ai/cordis@${version}: ${version === expected.version ? 'compatible local peer accepted' : 'below-range peer rejected'}: PASS`);
  }
} finally { rmSync(fixture, { recursive: true, force: true }); }
