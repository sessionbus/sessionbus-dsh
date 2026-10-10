#!/usr/bin/env bash
set -euo pipefail

version=${1:?pass the DSH version}
[[ $# -eq 1 ]] || { echo "usage: prove-packed-install.sh DSH_VERSION" >&2; exit 2; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
work=$(mktemp -d "${RUNNER_TEMP:-/tmp}/sessionbus-dsh-proof.XXXXXX")
server_pid=
dsh_pid=

stop_processes() {
  if [[ -n "$dsh_pid" ]]; then kill -TERM "$dsh_pid" 2>/dev/null || true; wait "$dsh_pid" 2>/dev/null || true; fi
  if [[ -n "$server_pid" ]]; then kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  dsh_pid=
  server_pid=
}
assert_permission_proof() {
  node --input-type=module - "$1" "$2" "${3:-}" "${4:-}" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [capture, root, token, sessionFile] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(capture, "utf8"));
const input = "W087_INPUT_SENTINEL", deliveryInput = "W087_DELIVERY_SENTINEL", traceContent = "W102_TRACE_CONTENT_SENTINEL";
assert.equal(state.hello, true);
assert.equal(state.listed, true);
if (Object.hasOwn(state, "ready")) assert.equal(state.ready, true);
if (token !== "") {
  assert.equal(state.helloParams.launch_token, token);
  assert.equal(Object.hasOwn(state.helloParams, "groups"), false);
  assert.equal(state.helloParams.supports_message_run, true);
  assert.deepEqual(state.open.request.params.groups, ["lane-primary", "lane-secondary"]);
  assert.equal(typeof state.open.response.result.session_id, "string");
  assert.equal(state.run.result.result, input);
  assert.deepEqual(state.deliveryReceipt, { disposition: "injected" });
  assert.equal(state.deliveryRun.result.result, deliveryInput);
  assert.equal(state.boundaryDelivery.error?.code, -32004);
}
const files = [];
const walk = directory => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target); else if (/session(?:\.v\d+)?\.jsonl$/u.test(entry.name)) files.push(target);
  }
};
walk(root);
const logs = files.map(file => fs.readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line)));
const events = logs.flatMap(records => records.slice(1));
if (token === "") {
  assert.equal(state.hellos.length >= 1, true);
  assert.equal(state.hellos[0].product, "dsh");
  assert.deepEqual(state.hellos[0].groups, ["web-proof"]);
  assert.equal(state.hellos[0].session_id, fs.readFileSync(sessionFile, "utf8"));
  assert.equal(logs.some(([header]) => header.id === state.hellos[0].session_id), true);
  // The fake list is called by this admitted peer, so observer and subject share its group.
  assert.deepEqual(state.listedIdentity.groups, state.hellos[0].groups);
  assert.deepEqual({ session_id: state.listedIdentity.session_id, product: state.listedIdentity.product, groups: state.listedIdentity.groups }, {
    session_id: state.hellos[0].session_id, product: "dsh", groups: ["web-proof"],
  });
  assert.deepEqual(state.peerDeliveryReceipt, { disposition: "injected" });
  assert.deepEqual(state.idleDeliveryReceipt, { disposition: "injected" });
}
assert.equal(events.some(event => event.type === "user/message" && event.data?.content?.[0]?.type === "text" && event.data.content[0].text === input), true);
assert.equal(events.some(event => event.type === "user/message" && event.data?.content?.[0]?.type === "text"
  && event.data.content[0].text.includes(`\n${deliveryInput}\n`)
  && event.data.content[0].text.startsWith("<cross-session-message from=")
  && event.data.content[0].text.endsWith("\n</cross-session-message>")), true);
assert.equal(events.some(event => event.type === "assistant/message" && event.data?.message?.content?.some(part => part.type === "text" && part.text === deliveryInput)), true);
for (const event of events.filter(event => event.type === "user/message"
  && (token !== "" && event.data?.content?.[0]?.text === input || event.data?.content?.[0]?.text?.includes(`\n${deliveryInput}\n`)
    || event.data?.content?.[0]?.text?.includes(`"body":"${traceContent}"`)))) {
  assert.deepEqual(event.data.source, { kind: "plugin:sessionbus-dsh", form: "relay" });
}
if (token === "") {
  const prompt = events.find(event => event.type === "user/message" && event.data?.content?.[0]?.text === input);
  assert.equal(prompt.data.source.kind, "user");
}
if (token === "") {
  assert.equal(events.filter(event => event.type === "turn/start").length, 2);
  const traceMessage = events.find(event => event.type === "user/message" && event.data?.content?.[0]?.text?.includes('"kind":"sessionbus.trace"'));
  assert.ok(traceMessage);
  assert.equal(traceMessage.data.content[0].text.startsWith('<cross-session-message from="Sessionbus trace@host" from-session="sessionbus@host">\n'), true);
  assert.equal(traceMessage.data.content[0].text.includes('[sessionbus-metadata: {"fromProduct":"sessionbus","messageId":"trace-copy-proof","groups":["web-proof"]}]'), true);
  assert.equal(traceMessage.data.content[0].text.includes(`"body":"${traceContent}"`), true);
  assert.equal(events.some(event => event.type === "assistant/message" && event.data?.message?.content?.some(part => part.type === "text" && part.text === traceContent)), true);
}
if (token !== "") assert.equal(events.some(event => event.type === "assistant/message" && event.data?.message?.content?.some(part => part.type === "text" && part.text === input)), true);
const sessionbusCall = events.find(event => event.type === "tool/call" && event.data?.name === "sessionbus");
assert.ok(sessionbusCall);
assert.equal(events.some(event => event.type === "tool/result" && event.data?.message?.source?.callId === sessionbusCall.data.callId), true);
assert.equal(events.some(event => event.type === "approval/asked" && event.data?.toolName === "sessionbus"), false);
const dummyCall = events.find(event => event.type === "tool/call" && event.data?.name === "w081_dummy");
assert.ok(dummyCall);
const dummyResult = events.find(event => event.type === "tool/result" && event.data?.message?.source?.callId === dummyCall.data.callId);
assert.equal(events.filter(event => event.type === "approval/asked" && event.data?.toolName === "w081_dummy").length, 1,
  `dummy approval mismatch: ${JSON.stringify(dummyResult)}`);
assert.equal(events.some(event => event.type === "turn/end" && event.data?.reason?.kind === "completed"), true);
NODE
}
assert_turn_error_proof() {
  node --input-type=module - "$1" "$2" "$3" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [capture, root, token] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(capture, "utf8"));
assert.equal(state.hello, true);
assert.equal(state.helloParams.launch_token, token);
assert.equal(Object.hasOwn(state.helloParams, "groups"), false);
assert.equal(state.run.state, "done");
assert.deepEqual(state.run.result, {
  outcome: "failed", result: "UNKNOWN: W-086 turn-start fixture failure", native_stop_reason: "error",
});
const files = [];
const walk = directory => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target); else if (/session(?:\.v\d+)?\.jsonl$/u.test(entry.name)) files.push(target);
  }
};
walk(root);
const events = files.flatMap(file => fs.readFileSync(file, "utf8").trim().split("\n").slice(1).map(line => JSON.parse(line)));
assert.equal(events.some(event => event.type === "user/message"), false);
assert.equal(events.some(event => event.type === "turn/start"), true);
assert.equal(events.some(event => event.type === "turn/end" && event.data?.reason?.kind === "error"
  && event.data.reason.error?.code === "UNKNOWN" && event.data.reason.error?.message === "W-086 turn-start fixture failure"), true);
NODE
}
cleanup() {
  stop_processes
  rm -rf -- "$work"
}
trap cleanup EXIT

tarball_name=$(npm pack --pack-destination "$work" --ignore-scripts --json --prefix "$root" | node -e 'let body=""; process.stdin.on("data", chunk => body += chunk).on("end", () => process.stdout.write(JSON.parse(body)[0].filename))')
tarball="$work/$tarball_name"
home="$work/home"
mkdir -p "$home"
printf '%s\n' '{"private":true}' > "$home/package.json"
release_cutoff=$(node "$root/.github/scripts/dsh-closure-cutoff.mjs" "$version")
npm view "@deepseek-ai/dsh@$version" --json > "$work/cli.json"
node "$root/.github/scripts/dsh-cli-pins.mjs" prepare "$version" "$work/cli.json" "$work/.pnpmfile.cjs" > "$work/cli-pins.txt"
mapfile -t cli_pins < "$work/cli-pins.txt"
npm install --prefix "$home" --save-exact --before "$release_cutoff" \
  "@deepseek-ai/dsh@$version" \
  "@deepseek-ai/dsh-agent@$version" "@deepseek-ai/dsh-agent-loop@$version" \
  "${cli_pins[@]}"
node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/package-lock.json"
node "$root/.github/scripts/prove-runtime-resolution.mjs" "$home"
if [[ -n "${DASHI_APP_VERSION:-}" ]]; then
  npm install --prefix "$home" --save-exact "@antst/dashi-launcher@$DASHI_APP_VERSION"
  node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/package-lock.json"
fi
dsh="$home/node_modules/.bin/dsh"
export PATH="$home/node_modules/.bin:$PATH"
for profile in sessionbus web dashi; do
  mkdir -p "$home/profiles/$profile"
  cp "$work/.pnpmfile.cjs" "$home/profiles/$profile/.pnpmfile.cjs"
done

DSH_HOME="$home" "$dsh" plugin --profile sessionbus add "$root/.github/fixtures/manifest-keeper-bundle"
DSH_HOME="$home" "$dsh" plugin --profile dashi add "$root/.github/fixtures/bundle-provides-sessionbus"
for profile in sessionbus web dashi; do
  DSH_HOME="$home" "$dsh" plugin --profile "$profile" add "$tarball"
done
cp "$home/profiles/sessionbus/package.json" "$work/lane-manifest-before-install.json"
DSH_HOME="$home" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh-install"
cmp -s "$work/lane-manifest-before-install.json" "$home/profiles/sessionbus/package.json"
DSH_HOME="$home" "$home/profiles/web/node_modules/.bin/sessionbus-dsh-install" --product dsh web
cp "$home/profiles/dashi/package.json" "$work/dashi-manifest-before-refusal.json"
cp "$home/profiles/dashi/cordis.patch.yml" "$work/dashi-patch-before-refusal.yml"
set +e
PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" "$home/profiles/dashi/node_modules/.bin/sessionbus-dsh-install" --product dashi dashi >"$work/dashi-install.stdout" 2>"$work/dashi-install.stderr"
dashi_install_status=$?
set -e
[[ "$dashi_install_status" -eq 2 ]]
grep -Fx 'sessionbus-dsh-install: profile "dashi" bundle "@sessionbus/w090-bundle-row" already provides row "sessionbus"' "$work/dashi-install.stderr"
cmp -s "$work/dashi-manifest-before-refusal.json" "$home/profiles/dashi/package.json"
cmp -s "$work/dashi-patch-before-refusal.yml" "$home/profiles/dashi/cordis.patch.yml"
for profile in sessionbus web dashi; do
  pnpm --dir "$home/profiles/$profile" add --save-exact "${cli_pins[@]}" "@deepseek-ai/dsh-llm-replay@$version" "$root/.github/fixtures/ask-all-plugin"
  node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/profiles/$profile/pnpm-lock.yaml"
done
pnpm --dir "$home/profiles/sessionbus" add --save-exact "$root/.github/fixtures/turn-start-error-plugin"

node --input-type=module - "$home" "$version" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const [home, version] = process.argv.slice(2);
const require = createRequire(`${home}/package.json`);
const readPatch = (profile) => fs.readFileSync(`${home}/profiles/${profile}/cordis.patch.yml`, "utf8");
const lane = readPatch("sessionbus");
const web = readPatch("web");
const dashi = readPatch("dashi");
assert.match(lane, /mode: lane/u);
assert.match(lane, /product: sessionbus-dsh/u);
assert.match(lane, /dsh-file-uploads-none/u);
const laneManifest = JSON.parse(fs.readFileSync(`${home}/profiles/sessionbus/package.json`, "utf8"));
assert.equal(Object.hasOwn(laneManifest.dependencies, "@sessionbus/w088-manifest-keeper"), true);
assert.deepEqual(laneManifest.dsh.profile.bundles, ["@deepseek-ai/dsh-base", "@sessionbus/w088-manifest-keeper"]);
assert.match(web, /id: sessionbus/u);
assert.match(web, /product: dsh/u);
assert.doesNotMatch(web, /file-uploads-none/u);
assert.doesNotMatch(dashi, /id: sessionbus/u);
const dashiManifest = JSON.parse(fs.readFileSync(`${home}/profiles/dashi/package.json`, "utf8"));
assert.equal(dashiManifest.dsh.profile.bundles.includes("@sessionbus/w090-bundle-row"), true);
assert.equal(fs.existsSync(`${home}/cordis.patch.yml`), false);
for (const [name, wanted] of [["@deepseek-ai/dsh", version], ["@deepseek-ai/dsh-agent", version], ["@deepseek-ai/dsh-agent-loop", version]]) {
  assert.equal(require(`${name}/package.json`).version, wanted);
}
const plugin = require(`${home}/profiles/sessionbus/node_modules/@sessionbus/dsh/package.json`).version;
console.log(JSON.stringify({ version, plugin, profiles: "PASS", packedInstall: "PASS" }));
NODE

echo "DSH $version real Agent steer boundary proof"
(cd "$home" && node --input-type=module < "$root/.github/scripts/prove-agent-steer-boundary.mjs")

fixture="$root/.github/fixtures/sessionbus-tool-call.jsonl"
peer_fixture="$root/.github/fixtures/sessionbus-peer-rehello.jsonl"
proof_patch="$root/.github/fixtures/sessionbus-tool-call.patch.yml"

socket="$work/open-arguments.sock"
capture="$work/open-arguments-proof.json"
token="w102-open-arguments-$version"
echo "DSH $version unsupported open.arguments proof"
node "$root/.github/scripts/fake-open-arguments-sessionbus.mjs" "$socket" "$capture" &
server_pid=$!
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh" >"$work/open-arguments.stdout" 2>"$work/open-arguments.stderr" &
dsh_pid=$!
for _ in $(seq 1 100); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/open-arguments.stdout" "$work/open-arguments.stderr" >&2 2>/dev/null || true; exit 1; fi
stop_processes

socket="$work/lane.sock"
capture="$work/lane-proof.json"
token="w075-fake-$version"
echo "DSH $version sessionbus lane permission proof"
node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" sessionbus-dsh worker &
server_pid=$!
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W081_SESSION_ROOT="$work/lane-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" SESSIONBUS_GROUPS='not-json' "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh" --patch "$proof_patch" >"$work/lane.stdout" 2>"$work/lane.stderr" &
dsh_pid=$!
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/lane.stdout" "$work/lane.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_permission_proof "$capture" "$work/lane-sessions" "$token"
stop_processes

socket="$work/turn-error.sock"
capture="$work/turn-error-proof.json"
token="w086-turn-error-$version"
echo "DSH $version pre-commit turn error proof"
node "$root/.github/scripts/fake-turn-error-sessionbus.mjs" "$socket" "$capture" sessionbus-dsh &
server_pid=$!
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W086_SESSION_ROOT="$work/turn-error-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh" --patch "$root/.github/fixtures/turn-start-error.patch.yml" >"$work/turn-error.stdout" 2>"$work/turn-error.stderr" &
dsh_pid=$!
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/turn-error.stdout" "$work/turn-error.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_turn_error_proof "$capture" "$work/turn-error-sessions" "$token"
stop_processes

if [[ -n "${DASHI_APP_VERSION:-}" ]]; then
DSH_HOME="$home" "$dsh" plugin --profile dashi remove @sessionbus/w090-bundle-row
DSH_HOME="$home" "$dsh" plugin --profile dashi add "@antst/dashi-app@$DASHI_APP_VERSION"
node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/profiles/dashi/pnpm-lock.yaml"
DSH_HOME="$home" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh-install" --product dashi
grep -q 'config: { mode: lane, product: dashi }' "$home/profiles/sessionbus/cordis.patch.yml"
socket="$work/dashi-lane.sock"
capture="$work/dashi-lane-proof.json"
token="w084-dashi-lane-$version"
echo "DSH $version dashi launcher lane permission proof"
node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" dashi worker &
server_pid=$!
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W081_SESSION_ROOT="$work/dashi-lane-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" SESSIONBUS_GROUPS='not-json' "$home/node_modules/.bin/dashi" --patch "$proof_patch" >"$work/dashi-lane.stdout" 2>"$work/dashi-lane.stderr" &
dsh_pid=$!
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/dashi-lane.stdout" "$work/dashi-lane.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_permission_proof "$capture" "$work/dashi-lane-sessions" "$token"
stop_processes

socket="$work/dashi.sock"
capture="$work/dashi-proof.json"
token="w077-dashi-$version"
echo "DSH $version dashi row permission proof"
node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" dashi worker &
server_pid=$!
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W081_SESSION_ROOT="$work/dashi-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" "$dsh" --profile dashi --patch "$proof_patch" >"$work/dashi.stdout" 2>"$work/dashi.stderr" &
dsh_pid=$!
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/dashi.stdout" "$work/dashi.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_permission_proof "$capture" "$work/dashi-sessions" "$token"
stop_processes
else
  not_run='NOT RUN: dashi packed (DASHI_APP_VERSION unset; dashi 0.2.0-alpha.1 not released, W-114)'
  printf '%s\n' "$not_run"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then printf '%s\n' "$not_run" >> "$GITHUB_STEP_SUMMARY"; fi
fi

port=$(node -e 'const net=require("node:net"),server=net.createServer(); server.listen(0,"127.0.0.1",()=>{process.stdout.write(String(server.address().port)); server.close()})')
mkdir -p "$work/runtime/sessionbus"
socket="$work/runtime/sessionbus/presence.sock"
peer_socket_env=(-u SESSIONBUS_SOCKET XDG_RUNTIME_DIR="$work/runtime")
capture="$work/web-proof.json"
echo "DSH $version web peer reconnect, permission and trace proof"
env "${peer_socket_env[@]}" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$peer_fixture" DSH_W081_SESSION_ROOT="$work/web-sessions" SESSIONBUS_GROUPS='["web-proof"]' "$dsh" --profile web --patch "$proof_patch" --no-open --host 127.0.0.1 --port "$port" >"$work/web.stdout" 2>"$work/web.stderr" &
dsh_pid=$!
ready=false
for _ in $(seq 1 200); do
  if curl -s -o /dev/null "http://127.0.0.1:$port/"; then ready=true; break; fi
  kill -0 "$dsh_pid" 2>/dev/null || break
  sleep 0.1
done
if [[ "$ready" != true ]]; then cat "$work/web.stdout" "$work/web.stderr" >&2; exit 1; fi
for _ in $(seq 1 50); do grep -q 'dsh web: http://' "$work/web.stdout" && break; sleep 0.1; done
launch_url=$(grep -Eo 'http://[^[:space:]]+' "$work/web.stdout" | tail -1)
node --input-type=module - "$launch_url" "$work/web-session-id" <<'NODE'
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const [launch, sessionFile] = process.argv.slice(2);
const login = await fetch(launch, { redirect: "manual" });
assert.equal(login.status, 303);
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
assert.ok(cookie);
const origin = new URL(launch).origin;
const rpc = async (method, args) => {
  const response = await fetch(`${origin}/api/${method}`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload: { args } }),
  });
  const body = await response.json();
  if (!body.result?.ok) throw new Error(`${method}: ${JSON.stringify(body)}`);
  return body.result.value;
};
const created = await rpc("session/create", { request: {} });
fs.writeFileSync(sessionFile, created.sessionId);
await rpc("session/selectModel", { request: { sessionId: created.sessionId, provider: "deepseek-official", model: "deepseek-v4-flash" } });
NODE
for _ in $(seq 1 100); do grep -q '^sessionbus: connect ' "$work/web.stderr" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
[[ $(grep -c '^sessionbus: connect ' "$work/web.stderr") -eq 1 ]]
node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" dsh peer &
server_pid=$!
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
for _ in $(seq 1 100); do [[ -s "$capture" ]] && grep -q '"hello":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
[[ -s "$capture" ]] && grep -q '"hello":true' "$capture"
[[ $(grep -c '^sessionbus: connect ' "$work/web.stderr") -eq 1 ]]
node --input-type=module - "$launch_url" "$work/web-session-id" <<'NODE'
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const [launch, sessionFile] = process.argv.slice(2);
const login = await fetch(launch, { redirect: "manual" });
assert.equal(login.status, 303);
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
assert.ok(cookie);
const origin = new URL(launch).origin;
const response = await fetch(`${origin}/api/session/prompt`, {
  method: "POST", headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: "session/prompt", payload: { args: { request: {
    requestId: crypto.randomUUID(), sessionId: fs.readFileSync(sessionFile, "utf8"), mode: "queue",
    content: [{ type: "text", text: "W087_INPUT_SENTINEL" }],
  } } } }),
});
const body = await response.json();
assert.equal(body.result?.ok, true, JSON.stringify(body));
NODE
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"peerDeliveryReceipt"' "$capture" && [[ $(grep -Rh '"type":"turn/end"' "$work/web-sessions" 2>/dev/null | wc -l) -ge 1 ]] && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
grep -q '"peerDeliveryReceipt"' "$capture"
[[ $(grep -Rh '"type":"turn/end"' "$work/web-sessions" 2>/dev/null | wc -l) -ge 1 ]]
kill -USR1 "$server_pid"
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"idleDeliveryReceipt"' "$capture" && [[ $(grep -Rh '"type":"turn/end"' "$work/web-sessions" 2>/dev/null | wc -l) -ge 2 ]] && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
assert_permission_proof "$capture" "$work/web-sessions" "" "$work/web-session-id"
stop_processes

echo "DSH $version runbook offline provider overlay proof (no model turn)"
awk '/cat >.*check-profile-provider.mjs/ { capture=1; next } capture && $0 == "NODE" { exit } capture { print }' "$root/docs/HOST-INSTALL.md" > "$work/check-profile-provider.mjs"
for profile in sessionbus web; do
  provider_output=$(env -u SESSIONBUS_LAUNCH_TOKEN -u SESSIONBUS_GROUPS DSH_HOME="$home" \
    node "$work/check-profile-provider.mjs" "$profile" "$home" deepseek-official "$root")
  printf '%s\n' "$provider_output"
  [[ "$provider_output" = "profile=$profile provider=deepseek-official registered" ]]
done

for profile in sessionbus web dashi; do
  DSH_HOME="$home" "$home/profiles/$profile/node_modules/.bin/sessionbus-dsh-install" --remove "$profile"
done
node --input-type=module - "$home" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";

const home = process.argv[2];
for (const profile of ["sessionbus", "web", "dashi"]) {
  const manifest = JSON.parse(fs.readFileSync(`${home}/profiles/${profile}/package.json`, "utf8"));
  const patch = fs.readFileSync(`${home}/profiles/${profile}/cordis.patch.yml`, "utf8");
  assert.equal(manifest.dependencies?.["@sessionbus/dsh"], undefined);
  assert.doesNotMatch(patch, /id:\s*sessionbus|id:\s*file-uploads-none/u);
}
NODE
echo "DSH $version sessionbus-dsh lane, web active/idle/trace delivery, real-Agent boundary, packed install and uninstall: PASS"
if [[ -n "${DASHI_APP_VERSION:-}" ]]; then echo "dashi $DASHI_APP_VERSION packed: PASS"; fi
