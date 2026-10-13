"use strict";
const fs = require("node:fs");

module.exports = {
  name: "w081-ask-all",
  inject: ["tools"],
  apply(ctx) {
    const logFile = process.env.DSH_W146_LOG_FILE;
    if (logFile) ctx.logger.exporter({ export: message => {
      if (message.name === "sessionbus-dsh") fs.appendFileSync(logFile,
        JSON.stringify({ type: message.type, message: message.args[0],
          buffered: ctx.logger.buffer.some(record => record.sn === message.sn) }) + "\n");
    } });
    ctx.tools.register({
      name: "w081_dummy",
      description: "W-081 approval negative control.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      output: {
        schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      execute: async () => ({ ok: true }),
    });
    ctx.on("tools/pre-execute", async () => ({ kind: "ask", reason: "W-081 ask-all negative control" }), { global: true });
    ctx.on("approval/request", async () => "allowed-once", { global: true, prepend: true });
  },
};
