import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const [dshManifest, pluginManifest] = process.argv.slice(2);
assert.equal(process.argv.length, 4, 'usage: prove-mode-controller.mjs DSH_MANIFEST PLUGIN_MANIFEST');
const native = createRequire(fs.realpathSync(dshManifest));
const own = createRequire(fs.realpathSync(pluginManifest));
const { Context } = await import(pathToFileURL(native.resolve('@deepseek-ai/cordis')));
const { defineTool, ToolRuntime, renderToolsSdk, renderToolsSdkPy } = await import(pathToFileURL(native.resolve('@deepseek-ai/dsh-tools')));
const plugin = own('./plugin.cjs');
const tick = () => new Promise(setImmediate);
async function settled() { for (let i = 0; i < 5; i++) await tick(); }
function fixture(mode) {
  const ctx = new Context(), state = { exits: [], stderr: [], peers: 0, stopped: 0, workers: 0, shutdowns: 0 };
  const listeners = new Set();
  let ready = false;
  const appReady = { onReady(call) { if (ready) call(); else listeners.add(call); return () => listeners.delete(call); } };
  const root = { session: { id: 'controller-scope-root', header: { cwd: '/synthetic-workspace' } }, options: {} };
  const provide = (name = 'sessionController', value = {}) => ctx.plugin(scope => scope.provide(name, value));
  const titleProvider = provide('sessionTitle', { get() {} });
  for (const [name, value] of Object.entries({
    appReady, appExit: code => state.exits.push(code),
    agents: { roots: () => [root] }, sessions: { flush: async () => {} },
    storageDomain: {}, permissionPresets: {},
    commands: { register: () => () => {} }, skills: { register: () => () => {} },
    tools: { register: () => () => {} },
  })) ctx.provide(name, value);
  const deps = {
    ambient: mode === 'lane' ? { SESSIONBUS_LAUNCH_TOKEN: 'synthetic-token' } : {},
    stderr: line => state.stderr.push(line), createUserMessage: value => value, defineTool: value => value,
    domain: { table: () => ({ get() {} }), close: async () => {} },
    serveWorker: () => {
      state.workers++;
      let close;
      return { closed: new Promise(resolve => { close = resolve; }),
        shutdown() { state.shutdowns++; close(); } };
    },
    connectPeer: () => {
      state.peers++;
      return { ready: Promise.resolve(), closed: new Promise(() => {}),
        shutdown() { state.stopped++; }, caller: {} };
    },
  };
  const mount = () => ctx.plugin({ ...plugin, apply: (scope, config) => plugin.apply(scope, config, deps) },
    { product: mode === 'lane' ? 'sessionbus-dsh' : 'dsh' });
  const commit = () => { if (ready) return; ready = true; for (const call of [...listeners]) call(); listeners.clear(); };
  return { ctx, state, deps, mount, provide, commit, titleProvider };
}
let cases = 0;
async function check(name, run) {
  await run(); cases++;
  console.log('real Cordis ' + name + ': PASS');
}
await check('published 0.1.4 model-prefix bytes survive native compilation and projection', async () => {
  const { prefix } = JSON.parse(fs.readFileSync(new URL('../fixtures/model-prefix-0.1.4.json', import.meta.url)));
  for (const product of ['dsh', 'dashi', 'sessionbus-dsh']) {
    const ctx = new Context(), effects = [], captured = {};
    ctx.provide('systemPrompt', { tools() {} });
    const registry = new ToolRuntime(ctx);
    const host = {
      logger: () => ({ error() {}, debug() {} }), appReady: { onReady: () => () => {} },
      agents: { roots: () => [] }, on: () => () => {},
      effect: call => { const dispose = call(); effects.push(dispose); return dispose; },
      tools: { register: value => { captured.registeredTool = value; return registry.register(value); } },
      skills: { register: value => { captured.skill = value; return () => {}; } }, commands: { register: () => () => {} },
    };
    try {
      plugin.createRuntime(host, { product, groups: ['prefix-team'] }, {
        ambient: product === 'sessionbus-dsh' ? { SESSIONBUS_LAUNCH_TOKEN: 'synthetic-prefix-token' } : {},
        defineTool: value => { captured.rawTool = value; return defineTool(value); }, createUserMessage: value => value,
        domain: { table: () => ({ get() {} }), close: async () => {} },
      });
      const values = { ...captured, nativeTools: registry.schemas(), sdkTools: registry.sdkSchemas(),
        typescript: renderToolsSdk(registry.sdkSchemas()), python: renderToolsSdkPy(registry.sdkSchemas()),
        skillText: captured.skill.content };
      assert.equal(values.nativeTools.length, 1);
      for (const [name, value] of Object.entries(values)) {
        const bytes = typeof value === 'string' ? value : JSON.stringify(value);
        assert.equal(Buffer.byteLength(bytes), prefix[name].bytes, name + ': published 0.1.4 model-prefix length changed');
        assert.equal(createHash('sha256').update(bytes).digest('hex'), prefix[name].sha256,
          name + ': published 0.1.4 model-prefix changed; explicit compatibility review is required');
      }
    } finally { for (const dispose of effects.reverse()) await dispose(); await ctx.fiber.dispose(); }
  }
});
await check('controller-free peer survives unrelated controller removal', async () => {
  const f = fixture('peer');
  try {
    const fiber = f.mount(); await settled();
    assert.equal(fiber.state, 2, 'peer must activate, not remain pending');
    f.commit(); await settled(); assert.equal(f.state.peers, 1);
    const provider = f.provide(); await settled(); await provider.dispose(); await settled();
    assert.equal(fiber.state, 2); assert.equal(f.state.peers, 1); assert.equal(f.state.stopped, 0);
    assert.deepEqual(f.state.exits, []);
  } finally { await f.ctx.fiber.dispose(); }
  assert.equal(f.state.stopped, 1);
});
await check('missing lane fails once at readiness; late controller cannot revive it', async () => {
  const f = fixture('lane');
  try {
    const fiber = f.mount(); await settled();
    assert.equal(fiber.state, 2); assert.equal(f.state.workers, 0); assert.deepEqual(f.state.exits, []);
    f.commit(); f.commit(); await settled();
    assert.deepEqual(f.state.exits, [1]);
    assert.equal(f.state.stderr.length, 1); assert.match(f.state.stderr[0], /sessionController.*readiness/u);
    f.provide(); await settled(); assert.equal(f.state.workers, 0);
  } finally { await f.ctx.fiber.dispose(); }
});
await check('late-before-ready controller starts lane; native loss and replacement own cleanup', async () => {
  const f = fixture('lane');
  try {
    f.mount(); await settled();
    const provider = f.provide(); await settled(); f.commit(); await settled();
    assert.equal(f.state.workers, 1); assert.deepEqual(f.state.exits, []);
    await provider.dispose(); await settled();
    assert.equal(f.state.shutdowns, 1);
    assert.deepEqual(f.state.exits, [0], 'preserve the existing worker.closed process-exit request');
    f.provide(); await settled();
    assert.equal(f.state.workers, 2); assert.deepEqual(f.state.exits, [0]);
  } finally { await f.ctx.fiber.dispose(); }
  assert.equal(f.state.shutdowns, 2);
});
await check('disposal before readiness removes its fatal guard', async () => {
  const f = fixture('lane');
  f.mount(); await settled(); await f.ctx.fiber.dispose(); f.commit(); await settled();
  assert.equal(f.state.workers, 0); assert.deepEqual(f.state.exits, []); assert.deepEqual(f.state.stderr, []);
});
await check('disposal during lane imports suppresses late activation', async () => {
  const f = fixture('lane');
  let resolve;
  f.deps.createUserMessage = undefined;
  f.deps.importLLM = () => new Promise(done => { resolve = done; });
  f.provide(); f.mount(); await settled();
  assert.equal(typeof resolve, 'function');
  await f.ctx.fiber.dispose(); f.commit(); resolve({ createUserMessage: value => value }); await settled();
  assert.equal(f.state.workers, 0); assert.deepEqual(f.state.exits, []); assert.deepEqual(f.state.stderr, []);
});
for (const mode of ['lane', 'peer']) for (const outcome of ['resolve', 'reject']) {
  await check(`${mode} replacement during imports suppresses stale ${outcome}`, async () => {
    const f = fixture(mode);
    let imports = 0, resolve, reject;
    f.deps.createUserMessage = undefined;
    f.deps.importLLM = () => ++imports === 1
      ? new Promise((done, failed) => { resolve = done; reject = failed; })
      : Promise.resolve({ createUserMessage: value => value });
    try {
      const provider = mode === 'lane' ? f.provide() : f.titleProvider;
      f.mount(); await settled(); assert.equal(imports, 1);
      await provider.dispose(); await settled();
      f.provide(mode === 'lane' ? 'sessionController' : 'sessionTitle', { get() {} });
      await settled(); f.commit(); await settled();
      assert.equal(imports, 2);
      assert.equal(f.state.workers, mode === 'lane' ? 1 : 0);
      assert.equal(f.state.peers, mode === 'peer' ? 1 : 0);
      if (outcome === 'resolve') resolve({ createUserMessage: value => value });
      else reject(new Error('stale activation import failed'));
      await settled();
      assert.equal(f.state.workers, mode === 'lane' ? 1 : 0, 'a stale import must not create another worker');
      assert.equal(f.state.peers, mode === 'peer' ? 1 : 0, 'a stale import must not create another peer');
      assert.deepEqual(f.state.exits, [], 'a stale import must not exit the replacement host');
      assert.deepEqual(f.state.stderr, []);
    } finally { await f.ctx.fiber.dispose(); }
  });
}
console.log(JSON.stringify({ cases, dsh: JSON.parse(fs.readFileSync(dshManifest)).version,
  plugin: JSON.parse(fs.readFileSync(pluginManifest)).version,
  cordis: native.resolve('@deepseek-ai/cordis'), workerTransport: 'synthetic', nativeProfileAcceptance: false }));
