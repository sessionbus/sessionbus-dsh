"use strict";
const fs = require("node:fs");
const { inspectRuntime } = require("../../scripts/runtime-oracle.cjs");

module.exports = {
  name: "w125-runtime-proof",
  inject: ["loader", "pluginPackages", "profileContext", "appReady"],
  apply(ctx, { destination, version, mode }) {
    const save = value => {
      fs.writeFileSync(`${destination}.tmp`, JSON.stringify(value, null, 2));
      fs.renameSync(`${destination}.tmp`, destination);
    };
    ctx.appReady.onReady(() => {
      try {
        save({ ok: true, nativePid: process.pid, ...inspectRuntime(ctx, { version, mode }) });
      } catch (error) {
        save({ ok: false, nativePid: process.pid, error: String(error), stack: error.stack });
        throw error;
      }
    });
  },
};
