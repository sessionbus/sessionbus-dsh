"use strict";
const fs = require("node:fs");
const { inspectRuntime } = require("../../scripts/runtime-oracle.cjs");

module.exports = {
  name: "w125-runtime-proof",
  inject: ["loader", "pluginPackages", "profileContext", "appReady"],
  apply(ctx, { destination, version, mode }) {
    ctx.appReady.onReady(() => {
      try {
        fs.writeFileSync(destination, JSON.stringify({ ok: true, nativePid: process.pid, ...inspectRuntime(ctx, { version, mode }) }, null, 2));
      } catch (error) {
        fs.writeFileSync(destination, JSON.stringify({ ok: false, nativePid: process.pid, error: String(error), stack: error.stack }, null, 2));
        throw error;
      }
    });
  },
};
