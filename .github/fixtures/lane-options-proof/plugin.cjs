"use strict";
const fs = require("node:fs");

module.exports = {
  name: "w126-lane-options-proof",
  inject: ["appReady", "agents", "agentDefaultModel", "subagents"],
  apply(ctx, { destination }) {
    const records = [];
    const save = () => {
      const state = {
        nativePid: process.pid,
        defaultSelection: ctx.agentDefaultModel.currentSelection(),
        roots: ctx.agents.list().filter(agent => {
          try { return ctx.subagents.rootOf(agent) === agent; }
          catch (error) { if (error.code === 'UNAUTHORIZED') return false; throw error; }
        }).map(agent => ({ id: agent.id, selection: agent.model.current() })),
        records,
      };
      fs.writeFileSync(`${destination}.tmp`, JSON.stringify(state));
      fs.renameSync(`${destination}.tmp`, destination);
    };
    ctx.on("session/event", (session, event) => {
      if (["model/selection", "request/header", "turn/end"].includes(event.type)) records.push({ id: session.id, ...event,
        ...(event.type === "request/header" ? { data: { header: { config: event.data.header.config, adapterDefaults: event.data.header.adapterDefaults } } } : {}) });
      // Read after the synchronous model/selection append has completed.
      queueMicrotask(save);
    }, { global: true });
    ctx.appReady.onReady(save);
  },
};
