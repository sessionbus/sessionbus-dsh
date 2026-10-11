import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { assertNativeInGroup, assertEmptyGroup, signalOwnedGroup } from './.github/scripts/proof-process-group.mjs';
const { install, remove } = await import(process.env.W125_BASELINE_INSTALLER ?? './install.mjs');

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version;
const helper = '@antst/dsh-file-uploads-none';
const ownEntry = '@sessionbus/dsh/file-uploads-none';
const marker = '# sessionbus-dsh-install owned';

test('runtime oracle rejects wrong native facts, not harmless extra physical packages', async t => {
  const require = createRequire(import.meta.url);
  const { inspectRuntime } = require('./.github/scripts/runtime-oracle.cjs');
  const { pathToFileURL } = await import('node:url');
  const root = mkdtempSync(path.join(os.tmpdir(), 'sessionbus-runtime-oracle-unit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packageAt = (name, pkg) => {
    const dir = path.join(root, 'node_modules', name); mkdirSync(dir, { recursive: true });
    const manifest = { name, ...pkg }, manifestPath = path.join(dir, 'package.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    return { name, version: manifest.version, manifest, manifestPath, dir };
  };
  const cli = packageAt('@deepseek-ai/dsh', { version: '0.2.1-alpha.2' });
  const plugin = packageAt('@sessionbus/dsh', { version, peerDependencies: {
    '@deepseek-ai/dsh-agent': '>=0.2.1-alpha.2', '@deepseek-ai/cordis': '>=4.0.5-alpha.1' }, dependencies: {} });
  writeFileSync(path.join(plugin.dir, 'plugin.cjs'), 'exports.apply = function apply() {};\n');
  const producer = packageAt('@deepseek-ai/dsh-app-boot', { version: cli.version });
  mkdirSync(path.join(producer.dir, 'node_modules'), { recursive: true });
  const npm = process.env.npm_execpath;
  assert.ok(npm, 'npm test supplies its published semver resolver');
  symlinkSync(path.dirname(createRequire(npm).resolve('semver/package.json')), path.join(producer.dir, 'node_modules/semver'));
  const agent = packageAt('@deepseek-ai/dsh-agent', { version: cli.version });
  const cordis = packageAt('@deepseek-ai/cordis', { version: '4.0.5-alpha.1' });
  const module = require(path.join(plugin.dir, 'plugin.cjs'));
  const make = () => {
    const parent = { tree: { ctx: { baseUrl: pathToFileURL(path.join(root, 'cordis.yml')).href } } };
    const bus = { options: { name: '@sessionbus/dsh' }, fiber: { state: 2 }, parent, moduleNamespace: module };
    const owner = { options: { name: ownEntry }, fiber: { state: 2 }, parent };
    const entries = [bus, owner], records = new Map([[agent.name, agent], [cordis.name, cordis], [producer.name, producer]]);
    const ctx = { profileContext: { name: 'sessionbus', installAnchor: cli.manifestPath },
      loader: { entries: () => entries }, reflect: { store: { upload: { name: 'fileUploads', fiber: owner.fiber } } },
      pluginPackages: { current: { entries: [agent] }, packageOf(name, importer) {
        if (name === '@sessionbus/dsh' || name === ownEntry) return plugin;
        assert.equal(importer, pathToFileURL(path.join(plugin.dir, 'plugin.cjs')).href, 'peer reads use the native plugin importer');
        return records.get(name);
      } } };
    return { ctx, entries, bus, owner, records };
  };
  const check = state => inspectRuntime(state.ctx, { version, mode: 'lane' });
  assert.equal(check(make()).upload.registeredServices, 1);
  for (const phase of [0, 1, 3]) {
    const state = make(); state.bus.fiber.state = phase;
    assert.throws(() => check(state), /pending or failed Sessionbus row/u);
  }
  const disabled = make(); disabled.bus.options.disabled = true; assert.throws(() => check(disabled));
  const duplicate = make(); duplicate.entries.push(duplicate.bus); assert.throws(() => check(duplicate), /one mounted Sessionbus/u);
  const peer = make(); peer.records.set(cordis.name, { ...cordis, version: '4.0.4' }); assert.throws(() => check(peer), /does not satisfy/u);
  const missing = make(); missing.records.delete(agent.name); assert.throws(() => check(missing), /unresolved plugin peer/u);
  const mixed = make(); mixed.records.set(agent.name, { ...agent, version: '0.2.1-alpha.3' }); assert.throws(() => check(mixed), /mixed DSH peer/u);
  const floor = make(); floor.ctx.profileContext.installAnchor = packageAt('below-floor-cli', { version: '0.2.1-alpha.1' }).manifestPath; assert.throws(() => check(floor));
  const services = make(); services.ctx.reflect.store.second = { name: 'fileUploads', fiber: { state: 2 } }; assert.throws(() => check(services), /one registered upload provider/u);
  const wrongRow = make(), packageOf = wrongRow.ctx.pluginPackages.packageOf;
  wrongRow.owner.options.name = helper;
  wrongRow.ctx.pluginPackages.packageOf = (name, importer) => name === helper ? { ...plugin, name: helper } : packageOf(name, importer);
  assert.throws(() => check(wrongRow));
  // An unused package elsewhere is not consulted or counted by this oracle.
  packageAt(helper, { version: '0.1.3' }); assert.equal(check(make()).upload.name, '@sessionbus/dsh');
});

function fixture(t, names = ['sessionbus']) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'sessionbus-universal-rows-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  // Legacy implementation only: make its old floor guard pass without touching a real CLI.
  const cli = path.join(home, 'legacy-guard/node_modules/@deepseek-ai/dsh');
  const boot = path.join(home, 'legacy-guard/node_modules/@deepseek-ai/dsh-app-boot');
  mkdirSync(cli, { recursive: true }); mkdirSync(path.join(boot, 'node_modules'), { recursive: true });
  writeFileSync(path.join(cli, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-alpha.2' }));
  writeFileSync(path.join(boot, 'package.json'), '{"name":"@deepseek-ai/dsh-app-boot"}');
  const npm = process.env.npm_execpath || path.join(childProcess.spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim(), 'npm/package.json');
  symlinkSync(path.dirname(createRequire(npm).resolve('semver/package.json')), path.join(boot, 'node_modules/semver'));
  for (const name of names) {
    const profile = path.join(home, 'profiles', name);
    mkdirSync(profile, { recursive: true });
    writeFileSync(path.join(profile, 'package.json'), JSON.stringify({
      private: true, custom: { keep: true }, dependencies: { '@sessionbus/dsh': version, [helper]: '0.2.0-alpha.2', keeper: '1.2.3' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'], patchReload: 'startup' } },
    }, null, 2) + '\n');
    writeFileSync(path.join(profile, 'cordis.patch.yml'), '[]\n');
    writeFileSync(path.join(profile, 'pnpm-lock.yaml'), '# fixture lock must not change\n');
  }
  return { home, installAnchor: path.join(cli, 'package.json'), query: () => ({ status: 0, stdout: '["0.2.0-alpha.2"]' }),
    file: (name, file = 'cordis.patch.yml') => path.join(home, 'profiles', name, file) };
}

function noChildren(t) {
  t.mock.method(childProcess, 'spawnSync', () => assert.fail('rows-only installer must not spawn package operations or queries'));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test('rows-only install preserves all package bytes and leaves a legacy provider pin unused', t => {
  const f = fixture(t, ['sessionbus', 'web', 'custom']);
  const before = ['sessionbus', 'web', 'custom'].flatMap(name => ['package.json', 'pnpm-lock.yaml'].map(file => [f.file(name, file), readFileSync(f.file(name, file))]));
  noChildren(t);
  install(['sessionbus', 'web', 'custom'], { ...f, product: 'dashi' });
  for (const [file, bytes] of before) assert.deepEqual(readFileSync(file), bytes, file);
  for (const name of ['sessionbus', 'custom']) assert.match(readFileSync(f.file(name), 'utf8'), /name: '@sessionbus\/dsh\/file-uploads-none'/u);
  assert.doesNotMatch(readFileSync(f.file('web'), 'utf8'), /file-uploads-none/u);
  const patches = ['sessionbus', 'web', 'custom'].map(name => readFileSync(f.file(name)));
  install(['sessionbus', 'web', 'custom'], { ...f, product: 'dashi' });
  for (const [i, name] of ['sessionbus', 'web', 'custom'].entries()) assert.deepEqual(readFileSync(f.file(name)), patches[i]);
});

test('all manifest containers and serialized outputs are checked before the first profile write', t => {
  for (const invalid of ['{broken', 'null', '[]', JSON.stringify({ dependencies: { '@sessionbus/dsh': version }, dsh: [] }),
    JSON.stringify({ dependencies: { '@sessionbus/dsh': version }, dsh: { profile: 'not-an-object' } }),
    JSON.stringify({ dependencies: { '@sessionbus/dsh': version }, dsh: { profile: { bundles: 'not-an-array' } } })]) {
    const f = fixture(t, ['web', 'sessionbus']);
    writeFileSync(f.file('sessionbus', 'package.json'), invalid);
    const files = ['web', 'sessionbus'].flatMap(name => ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml'].map(file => f.file(name, file)));
    const before = files.map(file => readFileSync(file));
    assert.throws(() => install(['web', 'sessionbus'], { ...f, product: 'dashi' }), error => error.exitCode === 2 && error.message.includes('sessionbus') && error.message.includes('package.json'));
    files.forEach((file, index) => assert.deepEqual(readFileSync(file), before[index]));
  }
  for (const dsh of [undefined, null, {}, { profile: null }, { profile: {} }, { profile: { bundles: null } }]) {
    const f = fixture(t);
    writeFileSync(f.file('sessionbus', 'package.json'), JSON.stringify({ owner: { untouched: true }, dependencies: { '@sessionbus/dsh': version }, dsh }));
    install(['sessionbus'], f);
    const manifest = JSON.parse(readFileSync(f.file('sessionbus', 'package.json')));
    assert.deepEqual(manifest.owner, { untouched: true });
    assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base']);
  }
});

test('a write-loop I/O failure names completed, possibly partial and untouched profiles', t => {
  const f = fixture(t, ['web', 'sessionbus', 'custom']);
  const before = readFileSync(f.file('custom'));
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (file === f.file('sessionbus')) throw Object.assign(new Error('controlled EACCES'), { code: 'EACCES' });
    return write(file, ...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.throws(() => install(['web', 'sessionbus', 'custom'], { ...f, product: 'dashi' }), /failed writing profile "sessionbus".*completed profiles: web; this profile may be partially written; profiles not attempted: custom/u);
  assert.match(readFileSync(f.file('web'), 'utf8'), /id: sessionbus/u);
  assert.deepEqual(readFileSync(f.file('custom')), before);
});

test('pre.20 marked no-upload row upgrades to the own entry without touching dependency pins', t => {
  const f = fixture(t, ['custom']);
  const old = `# keep\n- insert:\n    - { id: keeper, name: keeper }\n    - { id: file-uploads-none, name: '${helper}' } ${marker}\n    - { id: sessionbus, name: '@sessionbus/dsh', config: { groups: [native], product: dsh } } ${marker}\n`;
  writeFileSync(f.file('custom'), old);
  const manifest = readFileSync(f.file('custom', 'package.json'));
  noChildren(t);
  install(['custom'], { ...f, product: 'dsh' });
  assert.equal(readFileSync(f.file('custom'), 'utf8'), old.replace(helper, ownEntry));
  assert.deepEqual(readFileSync(f.file('custom', 'package.json')), manifest);
});

test('rows-only remove is DSH-free, offline and preserves package pins even when plugin import is broken', t => {
  const f = fixture(t);
  const plugin = path.join(f.home, 'profiles/sessionbus/node_modules/@sessionbus/dsh/plugin.cjs');
  mkdirSync(path.dirname(plugin), { recursive: true }); writeFileSync(plugin, "throw new Error('broken import')\n");
  const patch = `# unrelated\n- insert:\n    - { id: keeper, name: keeper }\n    - { id: sessionbus, name: '@sessionbus/dsh' } ${marker}\n    - { id: file-uploads-none, name: '${ownEntry}' } ${marker}\n`;
  writeFileSync(f.file('sessionbus'), patch);
  const manifest = readFileSync(f.file('sessionbus', 'package.json')), lock = readFileSync(f.file('sessionbus', 'pnpm-lock.yaml'));
  noChildren(t);
  remove(['sessionbus'], { home: f.home });
  assert.equal(readFileSync(f.file('sessionbus'), 'utf8'), '# unrelated\n- insert:\n    - { id: keeper, name: keeper }\n');
  assert.deepEqual(readFileSync(f.file('sessionbus', 'package.json')), manifest);
  assert.deepEqual(readFileSync(f.file('sessionbus', 'pnpm-lock.yaml')), lock);
  assert.equal(readFileSync(plugin, 'utf8'), "throw new Error('broken import')\n");
});

test('a missing package phase refuses before any earlier profile row changes', t => {
  const f = fixture(t, ['web', 'custom']);
  const manifest = JSON.parse(readFileSync(f.file('custom', 'package.json')));
  delete manifest.dependencies['@sessionbus/dsh'];
  writeFileSync(f.file('custom', 'package.json'), JSON.stringify(manifest));
  const files = ['web', 'custom'].flatMap(name => ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml'].map(file => f.file(name, file)));
  const before = files.map(file => readFileSync(file));
  noChildren(t);
  assert.throws(() => install(['web', 'custom'], { ...f, product: 'dsh' }), error => error.exitCode === 2 && /dsh plugin.*add/u.test(error.message));
  files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
});

test('the package owns the exported provider, with no external provider edge', () => {
  const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
  assert.equal(manifest.dependencies?.[helper], undefined);
  assert.equal(manifest.peerDependencies?.[helper], undefined);
  assert.deepEqual(manifest.exports, { '.': './plugin.cjs', './file-uploads-none': './file-uploads-none.mjs' });
  assert.ok(manifest.files.includes('file-uploads-none.mjs'));
  assert.ok(existsSync(new URL('./file-uploads-none.mjs', import.meta.url)));
});

test('a later unmarked provider row refuses before any profile changes', t => {
  const f = fixture(t, ['web', 'custom']);
  writeFileSync(f.file('custom'), `- insert:\n    - { id: file-uploads-none, name: '${helper}' }\n`);
  const files = ['web', 'custom'].flatMap(name => ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml'].map(file => f.file(name, file)));
  const before = files.map(file => readFileSync(file));
  noChildren(t);
  assert.throws(() => install(['web', 'custom'], { ...f, product: 'dsh' }), error => error.exitCode === 2
    && /row "file-uploads-none" has no.*ownership marker; remove that row and rerun, or keep this profile outside/u.test(error.message));
  files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
});

test('profile-root bundle rows refuse string and ordered patch-list forms before writes', t => {
  for (const id of ['sessionbus', 'file-uploads-none']) for (const array of [false, true]) {
    const f = fixture(t, ['custom']);
    const bundleName = '@sessionbus/owned-app', bundle = path.join(f.home, 'profiles/custom/node_modules', bundleName);
    mkdirSync(bundle, { recursive: true });
    writeFileSync(path.join(bundle, 'package.json'), JSON.stringify({ name: bundleName, dsh: { bundle: { patch: array ? ['empty.yml', 'rows.yml'] : 'rows.yml' } } }));
    writeFileSync(path.join(bundle, 'empty.yml'), '[]\n');
    writeFileSync(path.join(bundle, 'rows.yml'), `- insert:\n    - { id: ${id}, name: 'owned-by-app' }\n`);
    const manifest = JSON.parse(readFileSync(f.file('custom', 'package.json')));
    manifest.dsh.profile.bundles.push(bundleName);
    writeFileSync(f.file('custom', 'package.json'), JSON.stringify(manifest));
    const before = readFileSync(f.file('custom', 'package.json'));
    assert.throws(() => install(['custom'], { ...f, product: 'dsh' }), error => error.exitCode === 2
      && error.message === `profile "custom" app "${bundleName}" already provides ${id === 'sessionbus' ? 'Sessionbus' : 'the upload provider'}; there is nothing to install`);
    assert.deepEqual(readFileSync(f.file('custom', 'package.json')), before);
    assert.equal(readFileSync(f.file('custom'), 'utf8'), '[]\n');
  }
});

test('the native stock comment header and bare empty array survive row installation', t => {
  const f = fixture(t, ['web']);
  const header = '# DSH profile patch\n# Entries override the profile bundles.\n# Edit this file to configure the profile.\n';
  writeFileSync(f.file('web'), `${header}[]\n# owner footer\n`);
  install(['web'], { ...f, product: 'dsh' });
  const after = readFileSync(f.file('web'), 'utf8');
  assert.ok(after.startsWith(header));
  assert.ok(after.endsWith('\n# owner footer\n'));
  assert.match(after, /id: sessionbus/u);
});

test('owner comments, inert expressions and id-looking persona text stay byte-identical', t => {
  const f = fixture(t, ['web', 'sessionbus']);
  const before = `# DSH owner patch\n- id: owner-model\n  name: owner-model\n  config:\n    route: !!js ctx.owner.model\n    hostile: !!js (globalThis.__sessionbusYamlExecuted = true)\n    persona: |\n      - id: sessionbus\n        product: persona-not-a-row\n      {id: file-uploads-none, name: persona-not-a-provider}\n# owner footer\n`;
  delete globalThis.__sessionbusYamlExecuted;
  for (const name of ['web', 'sessionbus']) {
    writeFileSync(f.file(name), before);
    install([name], { ...f, ...(name === 'web' ? { product: 'dsh' } : {}) });
    const after = readFileSync(f.file(name), 'utf8');
    assert.ok(after.startsWith(before), `${name}: every owner byte precedes appended owned rows`);
    assert.equal((after.match(/name: '@sessionbus\/dsh'/gu) ?? []).length, 1);
    assert.equal(globalThis.__sessionbusYamlExecuted, undefined);
  }
});

test('flow/JSON rows and name-before-id use semantic row ownership, not persona matches', t => {
  for (const body of [
    '- insert:\n    - name: keeper\n      id: keeper\n      config: {persona: "{id: file-uploads-none}"}\n',
    '[{"insert":[{"name":"keeper","id":"keeper","config":{"persona":"- id: sessionbus"}}]}]\n',
  ]) {
    const f = fixture(t, ['custom']);
    writeFileSync(f.file('custom'), body);
    install(['custom'], { ...f, product: 'dsh' });
    const after = readFileSync(f.file('custom'), 'utf8');
    assert.ok(after.includes('persona'));
    assert.match(after, /@sessionbus\/dsh\/file-uploads-none/u);
    assert.match(after, /@sessionbus\/dsh/u);
  }
});

test('every malformed or non-array patch refuses before any earlier profile changes', t => {
  for (const body of ['- id: broken\n  config: [\n', '{id: sessionbus}\n', 'null\n', '# comments only\n', 'scalar\n']) {
    const f = fixture(t, ['web', 'custom']);
    writeFileSync(f.file('custom'), body);
    const files = ['web', 'custom'].flatMap(name => ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml'].map(file => f.file(name, file)));
    const before = files.map(file => readFileSync(file));
    assert.throws(() => install(['web', 'custom'], { ...f, product: 'dsh' }), error => error.exitCode === 2 && error.message.includes(f.file('custom')));
    files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
  }
});

test('bundle YAML is parsed as a native array and expressions are never evaluated', t => {
  for (const [body, conflicts] of [
    ['- insert:\n    - name: app-bus\n      id: sessionbus\n', true],
    ['[{"insert":[{"name":"app-bus","id":"sessionbus"}]}]\n', true],
    ['- id: persona\n  config:\n    text: |\n      {id: sessionbus}\n    expression: !!js (globalThis.__sessionbusYamlExecuted = true)\n', false],
    ['- id: broken\n  config: [\n', true],
    ['{insert: []}\n', true],
  ]) {
    const f = fixture(t, ['web', 'custom']);
    const app = '@sessionbus/parser-app', directory = path.join(f.home, 'profiles/custom/node_modules', app);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: app, dsh: { bundle: { patch: 'rows.yml' } } }));
    writeFileSync(path.join(directory, 'rows.yml'), body);
    const manifest = JSON.parse(readFileSync(f.file('custom', 'package.json')));
    manifest.dsh.profile.bundles.push(app);
    writeFileSync(f.file('custom', 'package.json'), JSON.stringify(manifest));
    const before = readFileSync(f.file('web'));
    if (conflicts) {
      assert.throws(() => install(['web', 'custom'], { ...f, product: 'dsh' }), error => error.exitCode === 2 && (error.message.includes(app) || error.message.includes('rows.yml')));
      assert.deepEqual(readFileSync(f.file('web')), before);
    } else install(['web', 'custom'], { ...f, product: 'dsh' });
    assert.equal(globalThis.__sessionbusYamlExecuted, undefined);
  }
});

test('lane owner overrides are not shadowed, and only marked spans converge', t => {
  const f = fixture(t);
  const header = '# DSH comment header\n# Owner chooses the model.\n# Expressions stay inert.\n';
  const beforeRows = '- id: llm-pi-ai\n  config: { route: !!js ctx.owner.route }\n- id: agent-default-model\n  config: { provider: owner, model: owner-model }\n';
  const ownerOverrides = ['system-prompt', 'permission', 'workspace', 'session-controller', 'session-title-llm']
    .map(id => `- id: ${id}\n  config: { owner: true }\n`).join('');
  const between = '# owner between marked spans\n- id: owner-middle\n  config: { keep: yes }\n';
  const afterRows = '# owner footer\n- id: owner-last\n  config: { untouched: true }\n';
  const bus = `- id: sessionbus ${marker}\n  name: '@sessionbus/dsh'\n  config: { mode: lane, product: dashi }\n`;
  const provider = `- { name: '${helper}', id: file-uploads-none } ${marker}\n`;
  const before = header + beforeRows + ownerOverrides + bus + between + provider + afterRows;
  writeFileSync(f.file('sessionbus'), before);
  const output = [];
  t.mock.method(process.stderr, 'write', line => { output.push(String(line)); return true; });
  install(['sessionbus'], f);
  const after = readFileSync(f.file('sessionbus'), 'utf8');
  assert.ok(after.startsWith(header + beforeRows + ownerOverrides));
  assert.ok(after.includes(between));
  assert.ok(after.endsWith(afterRows));
  const rows = yaml.load(after, { schema: yaml.JSON_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar', resolve: value => typeof value === 'string', construct: value => ({ __jsExpr: value }),
  })) });
  for (const id of ['system-prompt', 'permission', 'workspace', 'session-controller', 'session-title-llm']) {
    assert.deepEqual(rows.filter(row => row.id === id), [{ id, config: { owner: true } }]);
    assert.ok(output.some(line => line.includes(`row "${id}" kept as yours, lane default not applied`)));
  }
  assert.equal(rows.find(row => row.id === 'sessionbus').config.product, 'sessionbus-dsh');
  assert.equal(rows.find(row => row.id === 'file-uploads-none').name, ownEntry);
  install(['sessionbus'], f);
  assert.equal(readFileSync(f.file('sessionbus'), 'utf8'), after);
});

test('an unmarked sessionbus mount is never adopted or repaired', t => {
  const f = fixture(t, ['web', 'custom']);
  writeFileSync(f.file('custom'), "- insert:\n    - { name: '@sessionbus/dsh', id: sessionbus, config: { product: dsh } }\n");
  const files = ['web', 'custom'].flatMap(name => ['package.json', 'cordis.patch.yml'].map(file => f.file(name, file)));
  const before = files.map(file => readFileSync(file));
  assert.throws(() => install(['web', 'custom'], { ...f, product: 'dashi' }), error => error.exitCode === 2
    && /row "sessionbus" has no.*ownership marker; remove that row and rerun, or keep this profile outside/u.test(error.message));
  files.forEach((file, i) => assert.deepEqual(readFileSync(file), before[i]));
});

test('marked peer repair preserves unrelated fields and surrounding comments', t => {
  for (const body of [
    `# header\n- insert:\n    - name: '@sessionbus/dsh'\n      id: sessionbus ${marker}\n      config:\n        groups: [native]\n        product: dashi\n        persona: |\n          product: not-a-field\n# footer\n`,
    `# header\n- insert:\n    - { name: '@sessionbus/dsh', config: { groups: [native], product: dashi }, id: sessionbus } ${marker}\n# footer\n`,
  ]) {
    const f = fixture(t, ['web']);
    writeFileSync(f.file('web'), body);
    install(['web'], { ...f, product: 'dsh' });
    assert.equal(readFileSync(f.file('web'), 'utf8'), body.replace('product: dashi', 'product: dsh'));
  }
});

test('flow arrays remain valid through install and rows-only removal', t => {
  const f = fixture(t, ['web']);
  const body = '# header\n[{"id":"keeper","config":{"text":"commas, # are data"}}] # footer\n';
  writeFileSync(f.file('web'), body);
  install(['web'], { ...f, product: 'dsh' });
  const installed = readFileSync(f.file('web'), 'utf8');
  assert.equal(yaml.load(installed).length, 2);
  remove(['web'], f);
  const removed = readFileSync(f.file('web'), 'utf8');
  assert.deepEqual(yaml.load(removed), yaml.load(body));
  assert.ok(removed.startsWith('# header\n[{"id":"keeper","config":{"text":"commas, # are data"}}'));
  assert.ok(removed.endsWith('] # footer\n'));
});

test('marked row repair fills missing and null fields without consuming an EOF comment', t => {
  for (const row of [
    `- id: sessionbus ${marker}\n  name: '@sessionbus/dsh' # owner end comment`,
    `- id: sessionbus ${marker}\n  name: '@sessionbus/dsh'\n  config: { product: null, groups: [kept] }\n`,
    `- id: sessionbus ${marker}\n  name: '@sessionbus/dsh'\n  config:\n    product:\n    groups: [kept]\n`,
    `- id: sessionbus ${marker}\n  name: '@sessionbus/dsh'\n  config: null\n`,
  ]) {
    const f = fixture(t, ['web']);
    writeFileSync(f.file('web'), row);
    install(['web'], { ...f, product: 'dsh' });
    const after = readFileSync(f.file('web'), 'utf8'), parsed = yaml.load(after);
    assert.equal(parsed[0].config.product, 'dsh');
    if (row.includes('groups:')) assert.deepEqual(parsed[0].config.groups, ['kept']);
    if (row.includes('# owner end comment')) assert.ok(after.includes('# owner end comment\n'));
  }
});

test('owned groups close wrapped native children and refuse a pid in another group', async () => {
  const children = [];
  const wrap = () => {
    const program = `const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"],{stdio:'inherit'});
      process.stdout.write(JSON.stringify({nativePid:child.pid})+'\\n');
      child.on('close',code=>process.exit(code));`;
    const child = childProcess.spawn(process.execPath, ['-e', program], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); child.text = '';
    child.stdout.on('data', bytes => { child.text += bytes; });
    child.exit = new Promise(resolve => child.on('exit', resolve));
    child.closed = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
    return child;
  };
  const native = async child => {
    for (let count = 0; count < 100; count++) { if (child.text.includes('\n')) return JSON.parse(child.text).nativePid; await delay(10); }
    assert.fail('wrapper did not report its owned child');
  };
  try {
    const negative = wrap(), pid = await native(negative);
    await delay(50); // Let the controlled child's SIGTERM handler attach.
    negative.kill('SIGTERM'); await negative.exit;
    assertNativeInGroup(negative, pid);
    await assert.rejects(Promise.race([negative.closed, delay(30).then(() => { throw new Error('inherited pipe remains open'); })]), /inherited pipe remains open/u);
    signalOwnedGroup(negative, 'SIGTERM'); await negative.closed; await delay(50); assertEmptyGroup(negative);

    const positive = wrap(), selected = await native(positive);
    const other = wrap(), outside = await native(other);
    await delay(50);
    assert.throws(() => assertNativeInGroup(positive, outside), /must belong to this owned proof group/u);
    assertNativeInGroup(other, outside); // The rejected request did not signal the other owned group.
    assertNativeInGroup(positive, selected); process.kill(selected, 'SIGTERM');
    assert.deepEqual(await positive.closed, { code: 0, signal: null }); assertEmptyGroup(positive);
    assertNativeInGroup(other, outside); process.kill(outside, 'SIGTERM');
    assert.deepEqual(await other.closed, { code: 0, signal: null }); assertEmptyGroup(other);
  } finally {
    for (const child of children) {
      signalOwnedGroup(child, 'SIGTERM');
      const bound = setTimeout(() => signalOwnedGroup(child, 'SIGKILL'), 5000);
      try { await child.closed; await delay(50); assertEmptyGroup(child); } finally { clearTimeout(bound); }
    }
  }
});
