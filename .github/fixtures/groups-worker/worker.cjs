#!/usr/bin/env node
"use strict";
// Test-only native worker: a file gate holds a Run across the owner's attachment swap.
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { serveWorker } = require("@sessionbus/kit");
let owner;
const worker = serveWorker({
  hello: async () => ({ product: "w120-worker", supports_message_run: true, supported_open_fields: [], extra_arguments: [] }),
  open: async (_signal, request) => {
    owner = request.policy.owner_session_id;
    return { session_id: `w120-${randomUUID()}` };
  },
  run: async (signal, run, seed) => {
    run.Admitted();
    const gate = seed.text;
    await new Promise((resolve, reject) => {
      const watch = fs.watch(process.env.W120_WORK, () => { if (fs.existsSync(gate)) finish(resolve); });
      const abort = () => finish(() => reject(signal.reason));
      const finish = call => { watch.close(); signal.removeEventListener("abort", abort); call(); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort(); else if (fs.existsSync(gate)) finish(resolve);
    });
    // The child shares only its owner's private self group, not its new declared group.
    const receipt = await worker.caller.send({ target: owner, message: "W120_CHILD_DIRECT_AFTER_SWAP" });
    if (receipt.deliveries[0].disposition !== "injected") throw new Error(`private self-group message failed: ${JSON.stringify(receipt)}`);
    return { outcome: "completed", result: "W120_OWNED_RESULT", native_stop_reason: "completed" };
  },
  close: async () => {},
});
worker.closed.then(() => process.exit(0));
worker.serving.then(error => { if (error) process.stderr.write(`${error.message}\n`); });
