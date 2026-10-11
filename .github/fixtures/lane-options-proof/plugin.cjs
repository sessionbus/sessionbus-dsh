"use strict";
const fs = require("node:fs");

module.exports = {
  name: "w126-lane-options-proof",
  inject: ["appReady", "agents", "agentDefaultModel", "sessionController"],
  apply(ctx, { destination }) {
    const records = [];
    const save = () => {
      const controller = ctx.sessionController.agents;
      for (const method of ["selectionFor", "selectForNextRequest", "serializeImageAdmission"]) {
        if (typeof controller?.[method] !== "function") throw new Error(`W-126 native seam removed: sessionController.agents.${method}`);
      }
      const state = {
        nativePid: process.pid,
        defaultSelection: ctx.agentDefaultModel.currentSelection(),
        roots: ctx.agents.roots().map(agent => ({ id: agent.id, selection: controller.selectionFor(agent).current })),
        records,
      };
      fs.writeFileSync(`${destination}.tmp`, JSON.stringify(state));
      fs.renameSync(`${destination}.tmp`, destination);
    };
    ctx.on("session/event", (session, event) => {
      if (["model/selection", "request/header", "turn/end"].includes(event.type)) records.push({ id: session.id, ...event,
        ...(event.type === "request/header" ? { data: { header: { config: event.data.header.config, adapterDefaults: event.data.header.adapterDefaults } } } : {}) });
      // The event dispatch precedes selectForNextRequest's cache assignment.
      queueMicrotask(save);
    }, { global: true });
    ctx.appReady.onReady(save);
  },
};
