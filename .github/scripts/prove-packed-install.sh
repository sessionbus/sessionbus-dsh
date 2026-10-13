#!/usr/bin/env bash
set -euo pipefail

version=${1:?pass the DSH version}
echo 'Prepared project upgrade/companion operations regression; generic installation is proved by prove-universal-install.sh'
[[ $# -eq 1 ]] || { echo "usage: prove-packed-install.sh DSH_VERSION" >&2; exit 2; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
DASHI_APP_VERSION=${DASHI_APP_VERSION-$(<"$root/.github/dashi-app-version")}
work=$(mktemp -d "${RUNNER_TEMP:-/tmp}/sessionbus-dsh-proof.XXXXXX")
server_pid=
dsh_pid=
server_wrapper=
dsh_wrapper=
group_sequence=0

start_process() {
  local role=$1
  shift
  group_sequence=$((group_sequence + 1))
  local record="$work/group-$group_sequence.json"
  node "$root/.github/scripts/proof-process-group-runner.mjs" run "$record" "$role" "$@" &
  local wrapper=$!
  if [[ "$role" = native ]]; then dsh_wrapper=$wrapper; dsh_record=$record
  else server_wrapper=$wrapper; server_record=$record; fi
  for _ in $(seq 1 50); do [[ -f "$record" ]] && break; kill -0 "$wrapper" 2>/dev/null || break; sleep 0.1; done
  [[ -f "$record" ]]
  local pid
  pid=$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).pid' "$record")
  if [[ "$role" = native ]]; then dsh_pid=$pid; else server_pid=$pid; fi
}

stop_processes() {
  if [[ -n "$dsh_pid" ]]; then node "$root/.github/scripts/proof-process-group-runner.mjs" stop "$dsh_record"; wait "$dsh_wrapper"; fi
  if [[ -n "$server_pid" ]]; then node "$root/.github/scripts/proof-process-group-runner.mjs" stop "$server_record"; wait "$server_wrapper"; fi
  dsh_pid=
  server_pid=
  dsh_wrapper=
  server_wrapper=
}
installer_exec() {
  group_sequence=$((group_sequence + 1))
  node "$root/.github/scripts/proof-process-group-runner.mjs" run "$work/exec-$group_sequence.json" exec env DSH_HOME="$home" "$dsh" plugin "$@"
}
assert_permission_proof() {
  node --input-type=module - "$1" "$2" "${3:-}" "${4:-}" "$root/package.json" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [capture, root, token, sessionFile, manifest] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(capture, "utf8"));
const input = "W087_INPUT_SENTINEL", deliveryInput = "W087_DELIVERY_SENTINEL", traceContent = "W102_TRACE_CONTENT_SENTINEL";
assert.equal(state.hello, true);
assert.equal(state.listed, true);
if (Object.hasOwn(state, "ready")) assert.equal(state.ready, true);
if (token !== "") {
  assert.equal(state.helloParams.version, JSON.parse(fs.readFileSync(manifest)).version, 'the launched candidate must identify its actual package version');
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
assert_peer_diagnostic() {
  node --input-type=module - "$work/web-plugin-log.jsonl" "$work/web.stderr" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
const records = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").map(line => JSON.parse(line));
const errors = records.filter(record => /^sessionbus: connect /u.test(record.message));
assert.equal(errors.length, 1, "one native socket diagnostic per outage, not one per retry");
assert.equal(errors[0].type, "error");
assert.equal(errors[0].buffered, true, "the default native buffer, not just the fixture exporter, receives the diagnostic");
assert.equal(records.some(record => record.type === "debug"), false, "trace off keeps no plugin debug record");
assert.match(errors[0].message, /^sessionbus: connect ENOENT /u);
assert.doesNotMatch(fs.readFileSync(process.argv[3], "utf8"), /^sessionbus(?: trace)?:/mu,
  "peer plugin must never write the interactive host's stderr");
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
  local original_status=$?
  local cleanup_status=0
  if [[ -n "$dsh_wrapper" ]]; then
    for _ in $(seq 1 50); do [[ -f "$dsh_record" ]] && break; kill -0 "$dsh_wrapper" 2>/dev/null || break; sleep 0.1; done
    node "$root/.github/scripts/proof-process-group-runner.mjs" cleanup "$dsh_record" || cleanup_status=1
    wait "$dsh_wrapper" || cleanup_status=1
  fi
  if [[ -n "$server_wrapper" ]]; then
    for _ in $(seq 1 50); do [[ -f "$server_record" ]] && break; kill -0 "$server_wrapper" 2>/dev/null || break; sleep 0.1; done
    node "$root/.github/scripts/proof-process-group-runner.mjs" cleanup "$server_record" || cleanup_status=1
    wait "$server_wrapper" || cleanup_status=1
  fi
  if [[ ${KEEP_PROOF:-0} = 1 ]]; then printf 'proof evidence retained: %s\n' "$work"; else rm -rf -- "$work"; fi
  if [[ "$original_status" -ne 0 ]]; then exit "$original_status"; fi
  exit "$cleanup_status"
}
trap cleanup EXIT
interrupted() { trap '' INT TERM; exit "$1"; }
trap 'interrupted 130' INT
trap 'interrupted 143' TERM

tarball_name=$(npm pack "$root" --pack-destination "$work" --ignore-scripts --json | node -e 'let body=""; process.stdin.on("data", chunk => body += chunk).on("end", () => process.stdout.write(JSON.parse(body)[0].filename))')
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
node "$root/.github/scripts/dsh-cli-pins.mjs" prepare "$version" "$work/cli.json" "$work/.pnpmfile.cjs" "$home" > "$work/cli-pins.txt"
mapfile -t cli_pins < "$work/cli-pins.txt"
node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/package-lock.json" "$home"
node "$root/.github/scripts/prove-domain-schema.mjs" "$home"
node "$root/.github/scripts/prove-runtime-resolution.mjs" "$home"
if [[ -n "${DASHI_APP_VERSION:-}" ]]; then
  npm install --prefix "$home" --save-exact "@antst/dashi-launcher@$DASHI_APP_VERSION"
  node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/package-lock.json" "$home"
fi
dsh="$home/node_modules/.bin/dsh"
export PATH="$home/node_modules/.bin:$PATH"
for profile in sessionbus web dashi; do
  mkdir -p "$home/profiles/$profile"
  cp "$work/.pnpmfile.cjs" "$home/profiles/$profile/.pnpmfile.cjs"
done

DSH_HOME="$home" "$dsh" plugin --profile sessionbus add "$root/.github/fixtures/manifest-keeper-bundle"
for profile in sessionbus web; do
  DSH_HOME="$home" "$dsh" plugin --profile "$profile" add --save-exact @sessionbus/dsh@0.1.0-pre.20 @antst/dsh-file-uploads-none@0.2.0-alpha.2
done
# OPERATIONS-ONLY pre.20 baseline: outside exec, so a registry-driven add
# cannot nest under DSH's profile lock. Record the exact resulting pin rather
# than assuming today's registry maximum (published exec failure: 121 s).
DSH_HOME="$home" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh-install"
DSH_HOME="$home" "$home/profiles/web/node_modules/.bin/sessionbus-dsh-install" --product dsh web
node --input-type=module - "$home" "$work/pre20-provider-pins.json" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [home, file] = process.argv.slice(2), pins = {};
for (const profile of ['sessionbus', 'web']) {
  const spec = JSON.parse(fs.readFileSync(`${home}/profiles/${profile}/package.json`)).dependencies['@antst/dsh-file-uploads-none'];
  assert.match(spec, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/u);
  pins[profile] = spec;
}
fs.writeFileSync(file, JSON.stringify(pins));
NODE
DSH_HOME="$home" "$dsh" plugin --profile sessionbus add --save-exact "@deepseek-ai/dsh-llm-replay@$version"
node "$root/.github/scripts/prove-lane-options-before.mjs" "$work/options-before" "[\"$dsh\"]" "$home" "$root"
echo 'OPERATIONS-ONLY Linux prepared in-place pre.20 baseline; ordinary upgrade add follows, no cleanup; exact unused provider pin remains'
DSH_HOME="$home" "$dsh" plugin --profile dashi add "$root/.github/fixtures/bundle-provides-sessionbus"
for profile in sessionbus web dashi; do
  DSH_HOME="$home" "$dsh" plugin --profile "$profile" add --save-exact "$tarball"
done
cp "$home/profiles/sessionbus/package.json" "$work/lane-manifest-before-install.json"
installer_exec --profile sessionbus exec sessionbus-dsh-install
cmp -s "$work/lane-manifest-before-install.json" "$home/profiles/sessionbus/package.json"
installer_exec --profile web exec sessionbus-dsh-install --product dsh web
cp "$home/profiles/dashi/package.json" "$work/dashi-manifest-before-refusal.json"
cp "$home/profiles/dashi/cordis.patch.yml" "$work/dashi-patch-before-refusal.yml"
set +e
PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" "$home/profiles/dashi/node_modules/.bin/sessionbus-dsh-install" --product dashi dashi >"$work/dashi-install.stdout" 2>"$work/dashi-install.stderr"
dashi_install_status=$?
set -e
[[ "$dashi_install_status" -eq 2 ]]
grep -F 'profile "dashi" app "@sessionbus/w090-bundle-row" already provides Sessionbus; there is nothing to install' "$work/dashi-install.stderr"
cmp -s "$work/dashi-manifest-before-refusal.json" "$home/profiles/dashi/package.json"
cmp -s "$work/dashi-patch-before-refusal.yml" "$home/profiles/dashi/cordis.patch.yml"
for profile in sessionbus web dashi; do
  pnpm --dir "$home/profiles/$profile" add --save-exact "${cli_pins[@]}" "@deepseek-ai/dsh-llm-replay@$version" "$root/.github/fixtures/ask-all-plugin"
  node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/profiles/$profile/pnpm-lock.yaml" "$home"
done
pnpm --dir "$home/profiles/sessionbus" add --save-exact "$root/.github/fixtures/turn-start-error-plugin"

node --input-type=module - "$home" "$version" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const [home, version] = process.argv.slice(2);
const require = createRequire(fs.realpathSync(`${home}/package.json`));
const readPatch = (profile) => fs.readFileSync(`${home}/profiles/${profile}/cordis.patch.yml`, "utf8");
const lane = readPatch("sessionbus");
const web = readPatch("web");
const dashi = readPatch("dashi");
assert.match(lane, /mode: lane/u);
assert.match(lane, /product: sessionbus-dsh/u);
assert.match(lane, /@sessionbus\/dsh\/file-uploads-none/u);
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
start_process fixture node "$root/.github/scripts/fake-open-arguments-sessionbus.mjs" "$socket" "$capture"
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
start_process native env PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh" >"$work/open-arguments.stdout" 2>"$work/open-arguments.stderr"
for _ in $(seq 1 100); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/open-arguments.stdout" "$work/open-arguments.stderr" >&2 2>/dev/null || true; exit 1; fi
stop_processes

socket="$work/lane.sock"
capture="$work/lane-proof.json"
token="w075-fake-$version"
echo "DSH $version sessionbus lane permission proof"
start_process fixture node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" sessionbus-dsh worker
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
start_process native env PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W081_SESSION_ROOT="$work/lane-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" SESSIONBUS_GROUPS='not-json' "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh" --patch "$proof_patch" >"$work/lane.stdout" 2>"$work/lane.stderr"
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/lane.stdout" "$work/lane.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_permission_proof "$capture" "$work/lane-sessions" "$token"
stop_processes

socket="$work/turn-error.sock"
capture="$work/turn-error-proof.json"
token="w086-turn-error-$version"
echo "DSH $version pre-commit turn error proof"
start_process fixture node "$root/.github/scripts/fake-turn-error-sessionbus.mjs" "$socket" "$capture" sessionbus-dsh
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
start_process native env PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W086_SESSION_ROOT="$work/turn-error-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" "$home/profiles/sessionbus/node_modules/.bin/sessionbus-dsh" --patch "$root/.github/fixtures/turn-start-error.patch.yml" >"$work/turn-error.stdout" 2>"$work/turn-error.stderr"
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/turn-error.stdout" "$work/turn-error.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_turn_error_proof "$capture" "$work/turn-error-sessions" "$token"
stop_processes

if [[ -n "${DASHI_APP_VERSION:-}" ]]; then
DSH_HOME="$home" "$dsh" plugin --profile dashi remove @sessionbus/w090-bundle-row
DSH_HOME="$home" "$dsh" plugin --profile dashi add "@antst/dashi-app@$DASHI_APP_VERSION"
node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$version" "$work/cli.json" "$home/profiles/dashi/pnpm-lock.yaml" "$home"
node "$root/.github/scripts/prove-dashi-resolution.mjs" "$home" "$DASHI_APP_VERSION" "$(node -p 'require(process.argv[1]).version' "$root/package.json")" | tee "$work/dashi-resolution.log"
installer_exec --profile sessionbus exec sessionbus-dsh-install --product dashi
grep -q 'config: { mode: lane, product: dashi }' "$home/profiles/sessionbus/cordis.patch.yml"
socket="$work/dashi-lane.sock"
capture="$work/dashi-lane-proof.json"
token="w084-dashi-lane-$version"
echo "DSH $version published dashi launcher lane permission proof with dashi-app installed"
start_process fixture node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" dashi worker
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
start_process native env PATH="$home/node_modules/.bin:$PATH" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$fixture" DSH_W081_SESSION_ROOT="$work/dashi-lane-sessions" SESSIONBUS_SOCKET="$socket" SESSIONBUS_LAUNCH_TOKEN="$token" SESSIONBUS_GROUPS='not-json' "$home/node_modules/.bin/dashi" --patch "$proof_patch" >"$work/dashi-lane.stdout" 2>"$work/dashi-lane.stderr"
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"ready":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
if [[ ! -s "$capture" ]] || ! grep -q '"ready":true' "$capture"; then cat "$capture" "$work/dashi-lane.stdout" "$work/dashi-lane.stderr" >&2 2>/dev/null || true; exit 1; fi
assert_permission_proof "$capture" "$work/dashi-lane-sessions" "$token"
stop_processes
else
  not_run='NOT RUN: dashi packed (DASHI_APP_VERSION explicitly empty)'
  printf '%s\n' "$not_run"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then printf '%s\n' "$not_run" >> "$GITHUB_STEP_SUMMARY"; fi
fi

port=$(node -e 'const net=require("node:net"),server=net.createServer(); server.listen(0,"127.0.0.1",()=>{process.stdout.write(String(server.address().port)); server.close()})')
mkdir -p "$work/runtime/sessionbus"
socket="$work/runtime/sessionbus/presence.sock"
peer_socket_env=(-u SESSIONBUS_SOCKET XDG_RUNTIME_DIR="$work/runtime")
capture="$work/web-proof.json"
echo "DSH $version web peer reconnect, permission and trace proof"
start_process native env "${peer_socket_env[@]}" DSH_HOME="$home" DSH_SNAPSHOT_FILE="$peer_fixture" DSH_W081_SESSION_ROOT="$work/web-sessions" DSH_W146_LOG_FILE="$work/web-plugin-log.jsonl" SESSIONBUS_GROUPS='["web-proof"]' "$dsh" --profile web --patch "$proof_patch" --no-open --host 127.0.0.1 --port "$port" >"$work/web.stdout" 2>"$work/web.stderr"
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
for _ in $(seq 1 100); do [[ -s "$work/web-plugin-log.jsonl" ]] && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
assert_peer_diagnostic
start_process fixture node "$root/.github/scripts/fake-permission-sessionbus.mjs" "$socket" "$capture" dsh peer
for _ in $(seq 1 50); do [[ -S "$socket" ]] && break; sleep 0.1; done
for _ in $(seq 1 100); do [[ -s "$capture" ]] && grep -q '"hello":true' "$capture" && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
[[ -s "$capture" ]] && grep -q '"hello":true' "$capture"
assert_peer_diagnostic
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
node "$root/.github/scripts/proof-process-group-runner.mjs" signal "$server_record" SIGUSR1
for _ in $(seq 1 300); do [[ -s "$capture" ]] && grep -q '"idleDeliveryReceipt"' "$capture" && [[ $(grep -Rh '"type":"turn/end"' "$work/web-sessions" 2>/dev/null | wc -l) -ge 2 ]] && break; kill -0 "$dsh_pid" 2>/dev/null || break; sleep 0.1; done
assert_permission_proof "$capture" "$work/web-sessions" "" "$work/web-session-id"
stop_processes

echo "DSH $version per-session groups against released daemon 0.5.12"
DSH_HOME="$home" "$dsh" plugin --profile web add "$root/.github/fixtures/groups-proof-plugin"
mkdir -p "$work/daemon-v0.5.12"
daemon_archive=sessionbus-host-linux-amd64.tar.gz
curl -fsSL "https://github.com/sessionbus/sessionbus/releases/download/v0.5.12/$daemon_archive" -o "$work/daemon-v0.5.12/$daemon_archive"
curl -fsSL https://github.com/sessionbus/sessionbus/releases/download/v0.5.12/SHA256SUMS -o "$work/daemon-v0.5.12/SHA256SUMS"
(cd "$work/daemon-v0.5.12" && sha256sum --check SHA256SUMS --ignore-missing && tar -xzf "$daemon_archive")
"$work/daemon-v0.5.12/bin/sessionbus" --version
node "$root/.github/scripts/prove-session-groups.mjs" "$home" "$work" "$work/daemon-v0.5.12/bin/sessionbus" "$root"

echo "DSH $version known peer pending-input gaps after error/cancel and later recovery"
node "$root/.github/scripts/prove-peer-pending-input.mjs" \
  "$home/node_modules/@deepseek-ai/dsh/package.json" \
  "$home/profiles/web/node_modules/@sessionbus/dsh/package.json" \
  "$work/peer-pending-input" "$work/daemon-v0.5.12/bin/sessionbus"

echo "DSH $version runbook offline provider overlay proof (no model turn)"
mkdir -p "$work/native-conflicts"
node "$root/.github/scripts/prove-native-row-conflicts.mjs" "$work/native-conflicts" "[\"$dsh\"]" "$tarball"
mkdir -p "$work/native-peer-policy"
node "$root/.github/scripts/prove-native-peer-policy.mjs" "$work/native-peer-policy" "[\"$dsh\"]" "$tarball"
awk '/cat >.*check-profile-provider.mjs/ { capture=1; next } capture && $0 == "NODE" { exit } capture { print }' "$root/docs/HOST-INSTALL.md" > "$work/check-profile-provider.mjs"
for profile in sessionbus web; do
  provider_output=$(env -u SESSIONBUS_LAUNCH_TOKEN -u SESSIONBUS_GROUPS DSH_HOME="$home" \
    node "$work/check-profile-provider.mjs" "$profile" "$home" deepseek-official "$root")
  printf '%s\n' "$provider_output"
  [[ "$provider_output" = "profile=$profile provider=deepseek-official registered" ]]
done

node "$root/.github/scripts/prove-lane-options.mjs" "$work/lane-options" "[\"$dsh\"]" "$home" "$root" dashi

for profile in sessionbus web; do
  installer_exec --profile "$profile" exec sessionbus-dsh-install --remove "$profile"
  DSH_HOME="$home" "$dsh" plugin --profile "$profile" remove @sessionbus/dsh
done
node --input-type=module - "$home" "$work/pre20-provider-pins.json" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";

const home = process.argv[2];
const pins = JSON.parse(fs.readFileSync(process.argv[3]));
for (const profile of ["sessionbus", "web"]) {
  const manifest = JSON.parse(fs.readFileSync(`${home}/profiles/${profile}/package.json`, "utf8"));
  const patch = fs.readFileSync(`${home}/profiles/${profile}/cordis.patch.yml`, "utf8");
  assert.equal(manifest.dependencies?.["@sessionbus/dsh"], undefined);
  assert.equal(manifest.dependencies["@antst/dsh-file-uploads-none"], pins[profile], 'uninstall preserves the exact existing profile-owned pin');
  assert.doesNotMatch(patch, /id:\s*sessionbus|id:\s*file-uploads-none/u);
}
NODE
echo "DSH $version sessionbus-dsh lane, web active/idle/trace delivery, real-Agent boundary, packed install and uninstall: PASS"
if [[ -n "${DASHI_APP_VERSION:-}" ]]; then echo "dashi $DASHI_APP_VERSION packed: PASS (published launcher lane + version-derived installed-app resolution; no physical-copy oracle; not a TUI boot)"; fi
