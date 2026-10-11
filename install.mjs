#!/usr/bin/env node

import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const marker = "# sessionbus-dsh-install owned";
const uploads = "@antst/dsh-file-uploads-none";
const packageVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const profilePatch = (product) => `- id: system-prompt ${marker}
  config:
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model.
- id: session-title-llm ${marker}
  disabled: true
- id: permission ${marker}
  config:
    presets:
      read-only: { sandbox: read-only, approval: ask }
      workspace-write: { sandbox: workspace-write, approval: ask }
      workspace-write-noninteractive: { sandbox: workspace-write, approval: never }
      danger-full-access: { sandbox: danger-full-access, approval: never }

- insert: ${marker}
    - { id: workspace, name: '@deepseek-ai/dsh-workspace' } ${marker}
    - { id: file-uploads-none, name: '@sessionbus/dsh/file-uploads-none' } ${marker}
    - { id: session-controller, name: '@deepseek-ai/dsh-api-session-controller' } ${marker}
    - id: sessionbus ${marker}
      name: '@sessionbus/dsh'
      config: { mode: lane, product: ${product} }
`;
const peerPatch = (product) => `- insert: ${marker}
    - { id: sessionbus, name: '@sessionbus/dsh', config: { product: ${product} } } ${marker}
`;
const noUploadsPatch = `- insert: ${marker}
    - { id: file-uploads-none, name: '@sessionbus/dsh/file-uploads-none' } ${marker}
`;
const productPattern = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const ownedIDs = ["system-prompt", "session-title-llm", "permission", "workspace", "file-uploads-none", "session-controller", "sessionbus"];
const peerRows = (name) => ["sessionbus", ...(name === "web" ? [] : ["file-uploads-none"])];
const refusal = (message) => Object.assign(new Error(message), { exitCode: 2 });
function snapshot(file) {
  let stat;
  try { stat = lstatSync(file); }
  catch (error) {
    if (error.code === "ENOENT") return;
    throw refusal(`cannot read profile file ${JSON.stringify(file)}: ${error.message}`);
  }
  try {
    if (stat.isSymbolicLink()) realpathSync(file); // Broken links refuse in the all-profile preflight.
    const bytes = readFileSync(file);
    if (!Buffer.from(bytes.toString("utf8")).equals(bytes)) throw refusal(`profile file ${JSON.stringify(file)} is not valid UTF-8`);
    return bytes;
  } catch (error) {
    throw refusal(`cannot read profile file ${JSON.stringify(file)}: ${error.message}`);
  }
}
function writeChanged(file, body, before) {
  if (before?.equals(Buffer.from(body))) return;
  let target = file, mode, existing;
  try { existing = lstatSync(file); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing) {
    target = realpathSync(file); // A broken symlink is an error, not a new file.
    mode = (existing.isSymbolicLink() ? lstatSync(target) : existing).mode & 0o7777;
  }
  // Atomic like DSH's writer (dsh-atomic-write:66-75), but preserve symlink
  // referents and exact modes where native writes replace links / force 0600.
  // Other-user ownership, hard links, extended attributes and ACLs are not preserved.
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, body, { flag: "wx", ...(mode === undefined ? {} : { mode }) });
    if (mode !== undefined) chmodSync(temporary, mode); // Keep existing bits even under a narrower umask.
    let current;
    try { current = readFileSync(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (before === undefined ? current !== undefined : !current?.equals(before)) {
      throw new Error(`profile file ${JSON.stringify(file)} changed while the installer was running; rerun the installer`);
    }
    renameSync(temporary, target);
  } catch (error) {
    try { rmSync(temporary, { force: true }); }
    catch (cleanup) { throw new AggregateError([error, cleanup], `atomic write and cleanup failed for ${file}: ${error.message}; ${cleanup.message}`); }
    throw error;
  }
}

// Read the native array dialect without evaluating !!js or serializing user data.
const patchSchema = yaml.JSON_SCHEMA.extend(new yaml.Type("tag:yaml.org,2002:js", {
  kind: "scalar", resolve: value => typeof value === "string", construct: value => ({ __jsExpr: value }),
}));
function parsePatch(file, body) {
  const nodes = new Map(), stack = [];
  let data;
  try {
    body ??= readFileSync(file, "utf8");
    const offset = body.startsWith("\uFEFF") ? 1 : 0;
    data = yaml.load(body.slice(offset), { schema: patchSchema, listener(event, state) {
      if (event === "open") { stack.push({ start: state.position + offset, children: [] }); return; }
      const node = Object.assign(stack.pop(), { end: state.position + offset, kind: state.kind, value: state.result });
      stack.at(-1)?.children.push(node);
      if (node.value && typeof node.value === "object" && node.kind !== "scalar") {
        const prior = nodes.get(node.value);
        // composeNode can wrap a flow node; keep the inner, exact source span.
        if (!prior || node.end < prior.end || (node.kind === "mapping" && node.children.length > prior.children.length)) nodes.set(node.value, node);
      }
    } });
  } catch { throw refusal(`cannot parse profile patch ${JSON.stringify(file)}`); }
  if (!Array.isArray(data)) throw refusal(`profile patch ${JSON.stringify(file)} must be a top-level YAML array`);
  const rows = [];
  function visit(entries, parent) {
    for (const row of entries) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw refusal(`profile patch ${JSON.stringify(file)} entries must be mappings`);
      rows.push({ value: row, node: nodes.get(row), parent });
      if (Object.hasOwn(row, "insert")) {
        if (!Array.isArray(row.insert)) throw refusal(`profile patch ${JSON.stringify(file)} insert must be an array`);
        visit(row.insert, row.insert);
      }
      if (row.group && Array.isArray(row.config)) visit(row.config, row.config);
    }
  }
  visit(data, data);
  return { file, body, data, nodes, rows, offset: body.startsWith("\uFEFF") ? 1 : 0, eol: body.includes("\r\n") ? "\r\n" : "\n" };
}
function writablePatch(file, body) {
  const patch = parsePatch(file, body), root = patch.nodes.get(patch.data);
  if (patch.data.length && patch.body[tokenStart(patch, root)] === "[") {
    throw refusal(`profile patch ${JSON.stringify(file)} uses a nonempty flow or JSON array; convert it to block form or keep this profile outside the installer`);
  }
  for (const row of patch.rows) {
    for (let index = 0; index + 1 < row.node.children.length; index += 2) {
      const key = row.node.children[index], value = row.node.children[index + 1];
      if (key.value !== "insert" && !(row.value.group && key.value === "config") || value.kind !== "sequence" || !value.value.length || patch.body[tokenStart(patch, value)] === "[") continue;
      if (!patch.rows.some(child => child.parent === value.value && (marked(patch, child) || marked(patch, child, "insert")))) continue;
      const keyColumn = key.start - (patch.body.lastIndexOf("\n", key.start - 1) + 1);
      const child = patch.nodes.get(value.value[0]), start = tokenStart(patch, child);
      const dashColumn = start - 2 - (patch.body.lastIndexOf("\n", start - 1) + 1);
      if (dashColumn <= keyColumn) throw refusal(`profile patch ${JSON.stringify(file)} has an indentless nested sequence not supported for editing; convert it to indented block form or keep this profile outside the installer`);
    }
  }
  return patch;
}
function field(node, key) {
  for (let index = 0; index + 1 < node.children.length; index += 2) {
    if (node.children[index].value === key) return node.children[index + 1];
  }
}
function lineEnd(body, index) { const end = body.indexOf("\n", index); return end < 0 ? body.length : end + 1; }
function tokenStart(patch, node) {
  const offset = patch.body.slice(node.start, node.end).search(/\S/u);
  return offset < 0 ? node.end : node.start + offset;
}
function tokenEnd(patch, node) {
  // js-yaml's empty/alias nodes include following separation/comments in end.
  // Their value token ends on this line, not at the next mapping token.
  if (node.kind === null) return node.start + /^[ \t]*(?:\*[^\s,\[\]{}]+)?/u.exec(patch.body.slice(node.start, node.end))[0].length;
  const start = patch.body[tokenStart(patch, node)];
  if (node.children.length && (node.kind === "mapping" && start !== "{" || node.kind === "sequence" && start !== "[")) return Math.max(...node.children.map(child => tokenEnd(patch, child)));
  return node.start + patch.body.slice(node.start, node.end).trimEnd().length;
}
function comment(line) {
  let quote;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote === '"' && char === "\\") { index++; continue; }
    if (quote === "'" && char === "'" && line[index + 1] === "'") { index++; continue; }
    if (quote) { if (char === quote) quote = undefined; }
    else if (char === "'" || char === '"') quote = char;
    else if (char === "#" && (index === 0 || /\s/u.test(line[index - 1]))) return line.slice(index);
  }
  return "";
}
function marked(patch, row, key = "id") {
  const id = field(row.node, key);
  if (!id) return false;
  const begin = patch.body.lastIndexOf("\n", id.start - 1) + 1;
  return comment(patch.body.slice(begin, lineEnd(patch.body, id.start))).includes(marker);
}
function edit(body, edits) {
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) body = body.slice(0, start) + replacement + body.slice(end);
  return body;
}
function setField(patch, node, key, value) {
  const existing = field(node, key);
  if (existing) {
    if (existing.kind === null && existing.value === null) {
      const end = tokenEnd(patch, existing);
      return edit(patch.body, [[existing.start, end, ` ${value}${patch.body[end] === "#" ? " " : ""}`]]);
    }
    return edit(patch.body, [[tokenStart(patch, existing), tokenEnd(patch, existing), value]]);
  }
  const start = tokenStart(patch, node), end = tokenEnd(patch, node);
  if (patch.body[start] === "{") return edit(patch.body, [[end - 1, end - 1, `${node.children.length ? ", " : ""}${key}: ${value}`]]);
  const indent = start - Math.max(patch.offset, patch.body.lastIndexOf("\n", start - 1) + 1);
  const position = lineEnd(patch.body, end - 1);
  return edit(patch.body, [[position, position, `${patch.body[position - 1] === "\n" ? "" : patch.eol}${" ".repeat(indent)}${key}: ${value}${patch.eol}`]]);
}
function appendPatch(patch, generated) {
  generated = generated.replaceAll("\n", patch.eol);
  const root = patch.nodes.get(patch.data);
  if (patch.data.length === 0) {
    const begin = tokenStart(patch, root), end = tokenEnd(patch, root);
    const line = Math.max(patch.offset, patch.body.lastIndexOf("\n", begin - 1) + 1), after = lineEnd(patch.body, end - 1);
    if (patch.body.slice(line, after).trim() === "[]") return edit(patch.body, [[line, after, generated]]);
    // Remove only the empty-array delimiters; all owner comments stay in place.
    const body = edit(patch.body, [[begin, begin + 1, ""], [end - 1, end, ""]]);
    return body + (body.endsWith("\n") ? "" : patch.eol) + generated;
  }
  return patch.body + (patch.body.endsWith("\n") ? "" : patch.eol) + generated;
}
function convergeMount(patch, id, product) {
  const row = patch.rows.find(row => row.value.id === id);
  if (!row) return appendPatch(patch, id === "sessionbus" ? peerPatch(product) : noUploadsPatch);
  if (id === "file-uploads-none") return setField(patch, row.node, "name", "'@sessionbus/dsh/file-uploads-none'");
  const config = field(row.node, "config");
  if (!config || config.value === null) return setField(patch, row.node, "config", `{ product: ${product} }`);
  if (config.kind !== "mapping") throw refusal(`profile patch ${JSON.stringify(patch.file)} sessionbus config shape is not supported for editing; use a mapping or keep this profile outside the installer`);
  return setField(patch, patch.nodes.get(row.value.config), "product", product);
}

function packageDir(anchor, name) {
  if (!anchor) return;
  for (const search of createRequire(realpathSync(anchor)).resolve.paths(name) ?? []) {
    const candidate = path.join(search, name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
  }
}

function bundleConflict(manifest, manifestFile, wanted) {
  // Inspect only profile-root-resolvable bundles, never infer the executing CLI's installation.
  for (const bundle of manifest?.dsh?.profile?.bundles ?? []) {
    const directory = packageDir(manifestFile, bundle);
    if (!directory) continue;
    const declared = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")).dsh?.bundle?.patch;
    // Same string / ordered string-list forms as app-boot bundlePatchFiles; no runtime is booted here.
    const files = typeof declared === "string" ? [declared] : declared;
    if (!Array.isArray(files) || files.some(file => typeof file !== "string")) throw refusal(`profile bundle ${JSON.stringify(bundle)} must declare a patch file or an ordered list of patch files`);
    for (const file of files) {
      const patch = parsePatch(path.join(directory, file));
      const id = wanted.find(id => patch.rows.some(row => row.value.id === id));
      if (id) return { bundle, row: id };
    }
  }
}

function rowSpan(patch, row) {
  const begin = tokenStart(patch, row.node), end = tokenEnd(patch, row.node);
  if (patch.body[tokenStart(patch, patch.nodes.get(row.parent))] === "[") return [begin, end];
  return [Math.max(patch.offset, patch.body.lastIndexOf("\n", begin - 1) + 1), lineEnd(patch.body, end - 1)];
}
function commaAfter(body, index) {
  while (index < body.length) {
    if (/\s/u.test(body[index])) { index++; continue; }
    if (body[index] === "#") { index = lineEnd(body, index); continue; }
    return body[index] === "," ? index : undefined;
  }
}
function withoutOwnedRows(patch, wanted) {
  const edits = [], groups = new Map();
  const removedRows = new Set(patch.rows.filter(row => wanted.includes(row.value.id) && marked(patch, row)));
  for (const row of [...patch.rows].reverse()) {
    const children = patch.rows.filter(child => child.parent === row.value.insert);
    if (!children.length || !marked(patch, row, "insert") || !children.every(child => removedRows.has(child))) continue;
    children.forEach(child => removedRows.delete(child));
    removedRows.add(row);
  }
  for (const row of removedRows) {
    if (!groups.has(row.parent)) groups.set(row.parent, []);
    groups.get(row.parent).push(row);
  }
  for (const [parent, removed] of groups) {
    const all = patch.rows.filter(row => row.parent === parent);
    const root = patch.nodes.get(parent), flow = patch.body[tokenStart(patch, root)] === "[";
    for (const row of removed) edits.push([...rowSpan(patch, row), ""]);
    if (flow) {
      const kept = all.filter(row => !removed.includes(row));
      const separatorsToKeep = new Set(kept.slice(1).map(row => all.indexOf(row) - 1));
      for (let index = 0; index + 1 < all.length; index++) {
        if (separatorsToKeep.has(index)) continue;
        const comma = commaAfter(patch.body, tokenEnd(patch, all[index].node));
        if (comma !== undefined) edits.push([comma, comma + 1, ""]);
      }
    } else if (removed.length === all.length) {
      const [begin] = rowSpan(patch, removed[0]);
      const indentation = /^ */u.exec(patch.body.slice(begin))[0];
      edits.find(change => change[0] === begin)[2] = `${indentation}[]${patch.eol}`;
    }
  }
  return edit(patch.body, edits);
}
function lanePatch(patch, product, messages) {
  const canonical = parsePatch("installer lane defaults", profilePatch(product));
  const replacements = [], existing = new Set();
  for (const row of patch.rows) {
    if (!ownedIDs.includes(row.value.id)) continue;
    existing.add(row.value.id);
    if (!marked(patch, row)) {
      messages.push(`row ${JSON.stringify(row.value.id)} kept as yours, lane default not applied`);
      continue;
    }
    const source = canonical.rows.find(candidate => candidate.value.id === row.value.id);
    const [begin, end] = rowSpan(patch, row);
    let replacement;
    if (patch.body[tokenStart(patch, patch.nodes.get(row.parent))] === "[") replacement = JSON.stringify(source.value);
    else {
      const [from, to] = rowSpan(canonical, source);
      const indent = /^ */u.exec(patch.body.slice(begin))[0].length;
      const sourceIndent = /^ */u.exec(canonical.body.slice(from))[0].length;
      replacement = canonical.body.slice(from, to).split(/(?<=\n)/u).map(line => " ".repeat(indent) + line.slice(sourceIndent)).join("");
    }
    replacements.push([begin, end, replacement.replaceAll("\n", patch.eol)]);
  }
  let generated = "";
  for (const row of canonical.data) {
    const source = canonical.rows.find(candidate => candidate.value === row);
    if (row.insert) {
      const children = canonical.rows.filter(candidate => candidate.parent === row.insert && !existing.has(candidate.value.id));
      if (children.length) generated += `- insert: ${marker}\n` + children.map(child => {
        const [begin, end] = rowSpan(canonical, child); return canonical.body.slice(begin, end);
      }).join("");
    } else if (!existing.has(row.id)) {
      const [begin, end] = rowSpan(canonical, source); generated += canonical.body.slice(begin, end);
    }
  }
  const body = edit(patch.body, replacements);
  return generated ? appendPatch(parsePatch(patch.file, body), generated) : body;
}

function validProfile(name) {
  return name && !name.includes("/") && !name.includes("\\") && name !== "." && name !== ".." && name !== "node_modules";
}

export function install(profileNames = [], options = {}) {
  const home = options.home || process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const names = [...new Set(profileNames.length ? profileNames : ["sessionbus"])];
  const laneProduct = options.product ?? "sessionbus-dsh";
  if (options.product !== undefined && (typeof options.product !== "string" || !productPattern.test(options.product))) throw new Error(`invalid product ${JSON.stringify(options.product)}; expected ^[a-z0-9][a-z0-9-]{0,31}$`);
  if (names.includes("sessionbus") && !["sessionbus-dsh", "dashi"].includes(laneProduct)) throw new Error("the sessionbus profile product must be sessionbus-dsh or dashi");
  if (names.some((name) => name !== "sessionbus") && options.product === undefined) throw new Error("--product is required for peer profiles");
  const plans = [];
  for (const name of names) {
    if (!validProfile(name)) throw new Error(`invalid profile name ${JSON.stringify(name)}`);
    const profile = path.join(home, "profiles", name);
    const manifestFile = path.join(profile, "package.json");
    if (!existsSync(manifestFile)) throw refusal(`profile ${JSON.stringify(name)} is not installed; first run dsh plugin --profile ${name} add --save-exact @sessionbus/dsh@${packageVersion}`);
    let manifest;
    const manifestBefore = snapshot(manifestFile);
    try { manifest = JSON.parse(manifestBefore.toString("utf8")); }
    catch { throw refusal(`profile ${JSON.stringify(name)} cannot read package manifest ${JSON.stringify(manifestFile)}`); }
    const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!object(manifest) || manifest.dsh != null && !object(manifest.dsh) || manifest.dsh?.profile != null && !object(manifest.dsh.profile)) {
      throw refusal(`profile ${JSON.stringify(name)} package manifest ${JSON.stringify(manifestFile)} requires object containers for the manifest, dsh and dsh.profile`);
    }
    if (!manifest.dependencies?.["@sessionbus/dsh"]) throw refusal(`profile ${JSON.stringify(name)} does not declare @sessionbus/dsh; first run dsh plugin --profile ${name} add --save-exact @sessionbus/dsh@${packageVersion}`);
    const bundles = manifest.dsh?.profile?.bundles;
    if (bundles != null && !Array.isArray(bundles)) throw refusal(`profile ${JSON.stringify(name)} package manifest ${JSON.stringify(manifestFile)} bundles must be an array`);
    const conflict = bundleConflict(manifest, manifestFile, peerRows(name));
    if (conflict) throw refusal(`profile ${JSON.stringify(name)} app ${JSON.stringify(conflict.bundle)} already provides ${conflict.row === "sessionbus" ? "Sessionbus" : "the upload provider"}; there is nothing to install`);
    const patchFile = path.join(profile, "cordis.patch.yml");
    const patchBefore = snapshot(patchFile);
    const patch = writablePatch(patchFile, patchBefore?.toString("utf8") ?? "[]\n");
    const unowned = patch.rows.find(row => peerRows(name).includes(row.value.id) && !marked(patch, row));
    if (unowned) throw refusal(`profile ${JSON.stringify(name)} row ${JSON.stringify(unowned.value.id)} has no sessionbus-dsh-install ownership marker; remove that row and rerun, or keep this profile outside the installer`);
    const messages = [];
    let body;
    if (name === "sessionbus") body = lanePatch(patch, laneProduct, messages);
    else {
      body = convergeMount(patch, "sessionbus", options.product);
      if (name !== "web") body = convergeMount(parsePatch(patch.file, body), "file-uploads-none", options.product);
    }
    parsePatch(patch.file, body); // Every parse/ownership check completes before the first write.
    let manifestBody;
    if (name === "sessionbus" && !manifest.dsh?.profile?.bundles?.includes("@deepseek-ai/dsh-base")) {
      manifest.dsh ??= {};
      manifest.dsh.profile ??= {};
      manifest.dsh.profile.bundles ??= [];
      manifest.dsh.profile.bundles.push("@deepseek-ai/dsh-base");
      manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    plans.push({ name, manifest, manifestFile, manifestBefore, manifestBody, patch: patch.file, patchBefore, body, messages });
  }
  for (const [index, { name, manifest, manifestFile, manifestBefore, manifestBody, patch, patchBefore, body, messages }] of plans.entries()) {
    try {
      if (manifestBody !== undefined) writeChanged(manifestFile, manifestBody, manifestBefore);
      writeChanged(patch, body, patchBefore);
    } catch (error) {
      throw new Error(`failed writing profile ${JSON.stringify(name)}: ${error.message}; completed profiles: ${plans.slice(0, index).map(plan => plan.name).join(", ") || "none"}; this profile may be partially written; profiles not attempted: ${plans.slice(index + 1).map(plan => plan.name).join(", ") || "none"}`, { cause: error });
    }
    for (const message of messages) process.stderr.write(`sessionbus-dsh-install: profile ${JSON.stringify(name)} ${message}\n`);
    if (manifest.dependencies[uploads]) process.stderr.write(`sessionbus-dsh-install: profile ${JSON.stringify(name)} retains its existing ${uploads} pin; the installer no longer uses it\n`);
  }
}

export function remove(profileNames = [], options = {}) {
  if (profileNames.length === 0) throw new Error("--remove requires at least one profile");
  const home = options.home || process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const names = [...new Set(profileNames)];
  const plans = [];
  for (const name of names) {
    if (!validProfile(name)) throw new Error(`invalid profile name ${JSON.stringify(name)}`);
    const patch = path.join(home, "profiles", name, "cordis.patch.yml");
    const before = snapshot(patch);
    if (before === undefined) continue;
    const parsed = writablePatch(patch, before.toString("utf8")), rows = name === "sessionbus" ? ownedIDs : peerRows(name);
    const unowned = parsed.rows.find(row => peerRows(name).includes(row.value.id) && !marked(parsed, row));
    if (unowned) throw refusal(`profile ${JSON.stringify(name)} row ${JSON.stringify(unowned.value.id)} has no sessionbus-dsh-install ownership marker`);
    const body = withoutOwnedRows(parsed, rows);
    parsePatch(patch, body);
    plans.push({ name, patch, body, before });
  }
  for (const [index, { name, patch, body, before }] of plans.entries()) {
    try { writeChanged(patch, body, before); }
    catch (error) {
      throw new Error(`failed writing profile ${JSON.stringify(name)}: ${error.message}; completed profiles: ${plans.slice(0, index).map(plan => plan.name).join(", ") || "none"}; profiles not attempted: ${plans.slice(index + 1).map(plan => plan.name).join(", ") || "none"}`, { cause: error });
    }
  }
}
