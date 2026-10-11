"use strict";
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

module.exports = {
  name: "w120-groups-proof",
  inject: ["commands", "pluginPackages", "tools"],
  apply(ctx) {
    // Test-only human bridge invokes the actual registered plugin tool on this exact Agent.
    ctx.commands.register({
      name: "w120-call",
      description: "W-120 native tool bridge for ownership assertions",
      handler: async ({ agent, rawInput, signal }) => {
        const { action, arguments: args } = JSON.parse(rawInput);
        const result = await ctx.tools.get("sessionbus", agent).execute({ action, arguments: args }, { agent, signal });
        return { kind: "success", text: JSON.stringify(result) };
      },
    });
    ctx.commands.register({
      name: "w120-zod",
      description: "W-120 runtime producer name/version check",
      handler: () => {
        const profile = pathToFileURL(path.join(process.env.DSH_HOME, "profiles/web/cordis.yml")).href;
        const importer = fs.realpathSync(path.join(ctx.pluginPackages.packageOf("@sessionbus/dsh", profile).dir, "plugin.cjs"));
        const plugin = createRequire(importer);
        const producer = fs.realpathSync(path.join(ctx.pluginPackages.packageOf("@deepseek-ai/dsh-storage-domain", profile).dir, "package.json"));
        const expected = fs.realpathSync(createRequire(producer).resolve("zod/package.json"));
        const actual = fs.realpathSync(plugin.resolve("zod/package.json"));
        const wanted = JSON.parse(fs.readFileSync(expected)), selected = JSON.parse(fs.readFileSync(actual));
        if (wanted.name !== selected.name || wanted.version !== selected.version) throw new Error(`plugin zod version mismatch: ${selected.name}@${selected.version} != ${wanted.name}@${wanted.version}`);
        return { kind: "success", text: JSON.stringify({ version: selected.version, actual, producerZod: expected, producer }) };
      },
    });
  },
};
