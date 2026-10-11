import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { storageZod } from './dsh-cli-pins.mjs';

const [installation] = process.argv.slice(2);
assert.ok(installation, 'usage: prove-domain-schema.mjs INSTALL_DIR');
const native = storageZod(installation);
const requireNative = createRequire(fs.realpathSync(native.producer));
const [StorageDomain, Storage, StorageJson, { Context }] = await Promise.all([
  import(pathToFileURL(requireNative.resolve('@deepseek-ai/dsh-storage-domain')).href),
  import(pathToFileURL(requireNative.resolve('@deepseek-ai/dsh-storage')).href),
  import(pathToFileURL(requireNative.resolve('@deepseek-ai/dsh-storage-json')).href),
  import(pathToFileURL(requireNative.resolve('@deepseek-ai/cordis')).href),
]);
const own = createRequire(fs.realpathSync(fileURLToPath(import.meta.url))).resolve('zod/package.json');
assert.equal(JSON.parse(fs.readFileSync(own)).version, '4.5.4', 'exact test dev pin');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionbus-domain-schema-'));
const foreignManifest = path.join(root, 'foreign-zod/package.json');
fs.cpSync(fs.realpathSync(path.dirname(own)), path.dirname(foreignManifest), { recursive: true });
const foreign = createRequire(fs.realpathSync(foreignManifest))('./index.cjs');
const producerZod = requireNative('zod');
assert.notEqual(foreignManifest, native.zod);
assert.notEqual(foreign.z.ZodType, producerZod.z.ZodType, 'different physical factories');
const valid = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0
  && item.trim() === item && !/[\0\r\n]/u.test(item)) && new Set(value).size === value.length;
const schema = foreign.z.custom(valid, 'groups are invalid');
const spec = StorageDomain.defineDomain({
  name: 'w120_schema_probe', version: 1, layout: 'per-record',
  tables: {
    groups: StorageDomain.domainTable(schema),
    parsed: StorageDomain.domainTable(foreign.z.object({ name: foreign.z.string() }).transform(value => ({ name: value.name.toUpperCase() }))),
  },
});
const backendRoot = path.join(root, 'storage');
const record = path.join(backendRoot, spec.name, 'groups/session-example.json');
const transformed = path.join(backendRoot, spec.name, 'parsed/transform-control.json');
fs.mkdirSync(path.dirname(record), { recursive: true });
fs.mkdirSync(path.dirname(transformed), { recursive: true });
fs.writeFileSync(record, JSON.stringify({ version: 1, record: ['initial'] }));
fs.writeFileSync(transformed, JSON.stringify({ version: 1, record: { name: 'hello', ignored: true } }));
let ctx, domain;
try {
  ctx = new Context();
  await ctx.plugin(Storage.default);
  await ctx.plugin(StorageJson, { root: backendRoot });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  domain = await ctx.storageDomain.open(spec);
  assert.deepEqual(domain.table('groups').get('session-example'), ['initial']);
  assert.deepEqual(domain.table('parsed').get('transform-control'), { name: 'HELLO' }, 'native open executes the foreign parser');
  assert.equal(domain.table('groups').get('missing'), undefined);
  const value = schema.parse(['one', 'two']);
  await domain.table('groups').put('session-example', value);
  assert.deepEqual(domain.table('groups').get('session-example'), value);
  assert.deepEqual(JSON.parse(fs.readFileSync(record)).record, value);
  await domain.close();
  domain = await ctx.storageDomain.open(spec);
  assert.deepEqual(domain.table('groups').get('session-example'), value, 'durable close/reopen');
  for (const invalid of [['duplicate', 'duplicate'], [1], [''], ['\n'], 'not-an-array']) assert.throws(() => schema.parse(invalid));
  assert.deepEqual(schema.parse([]), [], 'empty declared list is valid');
  // Native put is typed, not runtime-validated; the plugin validates before put.
  await domain.table('groups').put('session-example', ['bad', 'bad']);
  const invalidBytes = fs.readFileSync(record);
  await domain.close();
  domain = undefined;
  await assert.rejects(ctx.storageDomain.open(spec), error => error.code === 'invalid-record'
    && error.detail?.table === 'groups' && error.detail?.key === 'session-example');
  assert.deepEqual(fs.readFileSync(record), invalidBytes, 'strict open does not mutate or skip invalid state');
  // A failed open releases its reservation; an explicit valid repair recovers normally.
  fs.writeFileSync(record, JSON.stringify({ version: 1, record: ['repaired'] }));
  domain = await ctx.storageDomain.open(spec);
  assert.deepEqual(domain.table('groups').get('session-example'), ['repaired']);
  await domain.table('groups').delete('session-example');
  assert.equal(fs.existsSync(record), false);
  console.log(JSON.stringify({
    dsh: JSON.parse(fs.readFileSync(native.producer)).version,
    nativeZod: { path: native.zod, version: native.version },
    foreignZod: { path: foreignManifest, version: '4.5.4' },
    factoriesDistinct: true,
  }));
  console.log('native domain foreign Zod: open, parsed read, durable write/reopen, invalid-record rejection, repair, delete: PASS');
  console.log('native put does not parse; invalid values reject on subsequent open: OBSERVED');
} finally {
  if (domain) await domain.close();
  if (ctx) await ctx.fiber.dispose();
  fs.rmSync(root, { recursive: true, force: true });
}
