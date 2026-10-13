'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const plans = new Map();
const waiting = Promise.withResolvers();
exports.name = 'pending-input-controlled-model';
exports.inject = ['llm'];
exports.ready = waiting.promise;
exports.plans = plans;
exports.apply = async (ctx, config) => {
  const requireDSH = createRequire(fs.realpathSync(config.manifest));
  const { LlmAdapter, LlmError } = await import(pathToFileURL(requireDSH.resolve('@deepseek-ai/dsh-llm')));
  const raw = (name, value) => fs.appendFileSync(path.join(config.capture, name),
    JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n', { mode: 0o600 });
  class Controlled extends LlmAdapter {
    resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model }); }
    providerRetryPolicy() {
      return { mode: 'normal', maxRetries: 1, retryableCodes: ['TIMEOUT'],
        initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 };
    }
    async *stream(options) {
      const plan = plans.get(options.model);
      if (!plan) throw new Error('missing controlled model plan');
      const attempt = ++plan.attempts;
      plan.requests.push(options);
      raw('model.jsonl', { case: options.model, attempt, options });
      if (plan.actions.length) {
        const action = plan.actions.shift(), gate = Promise.withResolvers();
        plan.held = { gate, action, attempt };
        raw('gates.jsonl', { case: options.model, attempt, action, stage: 'held', aborted: options.signal.aborted });
        await gate.promise;
        raw('gates.jsonl', { case: options.model, attempt, action, stage: 'released', aborted: options.signal.aborted });
        plan.held = null;
        options.signal.throwIfAborted();
        if (action === 'error') throw new LlmError('deterministic provider rejection', 'INVALID_REQUEST');
        if (action === 'timeout') throw new LlmError('pi-ai stream idle timeout after 300000ms [synthetic]', 'TIMEOUT');
      }
      options.signal.throwIfAborted();
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'controlled request completed' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'controlled request completed' } };
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['pending-proof'], new Controlled());
  waiting.resolve();
};
exports.release = model => {
  const plan = plans.get(model);
  if (!plan?.held) throw new Error('no held model request');
  plan.held.gate.resolve();
};
