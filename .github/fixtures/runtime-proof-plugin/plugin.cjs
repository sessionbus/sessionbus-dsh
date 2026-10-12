"use strict";
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const { inspectRuntime, ownUploadRefusal, promptUploadRefusal } = require("../../scripts/runtime-oracle.cjs");

module.exports = {
  name: "w125-runtime-proof",
  inject: ["loader", "pluginPackages", "profileContext", "appReady", "sessionController", "agents", "sessions", "fileUploads"],
  apply(ctx, { destination, version, mode }) {
    fs.writeFileSync(`${destination}.source.sha256`, `${createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}  ${__filename}\n`);
    const save = value => {
      fs.writeFileSync(`${destination}.tmp`, JSON.stringify(value, null, 2));
      fs.renameSync(`${destination}.tmp`, destination);
    };
    ctx.appReady.onReady(async () => {
      try {
        const runtime = inspectRuntime(ctx, { version, mode });
        const controller = ctx.sessionController;
        let uploadRefusal;
        if (mode === "lane") uploadRefusal = await ownUploadRefusal(ctx, version);
        else {
          // Real stock provider: the same receipt refusal alone is a false
          // positive. The complete own-provider assertion MUST reject it.
          await assert.rejects(ownUploadRefusal(ctx, version), /plugin own no-upload provider must own/u);
          uploadRefusal = { stockNegative: true, ...await promptUploadRefusal({ sessionController: controller }) };
        }
        save({ ok: true, nativePid: process.pid, ...runtime, uploadRefusal });
      } catch (error) {
        save({ ok: false, nativePid: process.pid, error: String(error), stack: error.stack });
        throw error;
      }
    });
  },
};
