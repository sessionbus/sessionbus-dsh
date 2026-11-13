# W-155: DSH 0.2.2-rc.3 / plugin 0.2.0

Authority: accepted phase-0 report a96e1f72, rulings ca041be7,
STOP disposition 5c4964e7, renderer re-baseline k0fymi03 and cross-dashi
sequencing fzsm3q1r. Base cb8a563a97e14810e9bce8d118ac7d48e19aa072.
Old W-154 and earlier proof maps are historical, not current support claims.
Kit 0.5.16, common declaration and skill remain unchanged.

## Native preparation-refusal gap and shipped triggers (W1-W3)

The sealed initial failing observation remains at
`/home/antst/.local/state/dsh-architect/dsh-0.2.2/W155-PREPARATION-STOP/`:
REPORT 1b253400, MANIFEST 8a74a2e4. An acknowledged marker was claimed,
refused, not retained, not committed and not model-seen; the native end was
blocked. W2 makes these exact facts a rc.3-only KNOWN-GAP oracle, not a
continuity PASS. A fix or other producer version must fail closed for review.
No plugin compensation is added. The original run is never relabelled PASS.

Read-only inventory of the actual frozen rc.3 CLI dependency closure, all
published `@deepseek-ai` JavaScript (both bundled and declaration-side code):

| Native producer, all at 0.2.2-rc.3 | Source and condition |
| --- | --- |
| dsh-api-session-controller | lib/index.js:3358; underArchivedSession:3371-3383. Refuses an archived session or subagent ancestor; ordinary forks stop the lineage. |
| dsh-subagent | lib/index.js:532-535. Refuses when a managed ancestor is archived, including ancestry the controller cannot load. |
| dsh-goal-round-driver | lib/index.js:295-315,339-350. Refuses invalid/stale goal reservations before/after the downstream decision. IMPORTANT exception: restoreOtherClaimed:100-105 is called at313/348 and restores other claimed inputs; this is native behavior, not plugin compensation. A downstream rejection is only propagated at330-337. |
| dsh-experimental-liveshare | lib/index.js:8136-8153. Refuses relay access-refresh failure, a child without read authorization, or a forbidden external target. Experimental/optional composition, not asserted active everywhere. |

The other shipped pre-step listeners propagate decisions or prepare content,
but do not originate `{kind:'reject'}`: dsh-agent:232-245; dsh-agent-instructions:
1480-1506; dsh-plan-mode:168-187; dsh-time-context:249-275;
dsh-action-cards:397-433; dsh-repeat-tool-reminder:2368-2371;
dsh-session-checkpoint-policy:72-75; dsh-session-reference:458-465;
dsh-tmux-context:2386-2418; dsh-tool-skill:897-930,932-965;
dsh-experimental-client-ui-forge:1703,2021-2032; dsh-compaction-basic:839-852.
No direct pre-step rejection producer was found in shipped budget/limit,
permission, sandbox or hook components. This does not exclude an arbitrary
user-installed hook. Throws/cancellation are distinct and are not mislabelled
as this literal rejection path.

Cause: dsh-agent-loop/lib/index.js:103-110 removes the claimed batch;
preStep:683 does so before model/tool/prompt preparation; reject:712-714 returns
without restoration; caller:759-761 closes blocked. These are source findings
plus one native observation, not an upstream fix or a model decision.

## Proof ownership and migration

- Root authority is public subagents.rootOf over agents.list with exact live
  identity; missing service refuses at readiness. Controller is lane-only.
- Lane model/effort uses resolveCallConfig plus model.current/select inside
  native runMaintenance, never the GUI default-saving selector. Busy resumes
  refuse; partial create/rename/append outcomes are preserved, not rolled back.
- Public readPluginInventory + pluginPackages.resolution/packageOf + real
  no-upload behavior replace private loader/implementation identity reflection.
  Inventory proves configured active rows, not JavaScript callback equality.
- Six renderer-independent oracles retain the reviewed 0.1.6 bytes exactly.
  Separate model-renderer-0.2.0.json deliberately pins measured rc.3 TS9076B
  e02cad11… and Python9323B44334eb1…. Any other producer is UNVERIFIED/non-zero.
  Alpha.3 fixture stays byte-identical as history. Root-false carry stays.
- Pre.20 GUI-selection and dashi-app/launcher0.2.0-alpha.2 native before-proofs
  are retired as historical evidence, never booted under rc.3. The ordinary
  published0.1.5→candidate installer upgrade remains, without booting old code.
- W-156 owns cross-dashi launcher/app validation on the reviewed candidate
  archive via test-only file spec. Standalone merge may precede it; publication
  MUST wait for that leg on exactly the same archive bytes, then dashi pins the
  published byte-identical0.2.0. The held live transfer acceptance stays held.

## Current results (in progress, not a handoff)

Before the accepted STOP: five failing-first public-seam controls caught the
old runtime; plugin units138/138; later expanded focused controls10/10;
real Cordis/public schema/prefix/lifecycle controls12/12. No final full gate
or reviewed archive is established by those partial results. Setup slips and
cleanup are preserved in the sealed STOP report. Remaining rc.3 gates resume
under W5. Node24.9.0 official archive verified against SHASUMS256.txt; no owner
installation, credential, profile, daemon or process is touched.

Final local results before PR / hosted matrix (Node24.9.0, DSH0.2.2-rc.3):

- Frozen exact published dependency closure installed; units257/257 PASS,
  including the unchanged181-hit stale inventory, real product disposal guard
  unit and observer/error-preservation/setup controls.
- Full packed gate PASS on released daemon0.5.16: real Cordis/schema/prefix
  controls12/12; fresh controller-free peer profiles and managed lane;
  permissions, active and idle delivery; reconnect/groups persistence;
  target pending cases8 ordinary PASS plus6 exact KNOWN-GAP observations;
  public ownership/foreign-Zod controls; lane options13/13; uninstall.
- Native below-floor rc.2 refusal PASS (ordinary add and forced disabled row).
- Universal project: ordinary installs and lane/web native/adverse legs PASS;
  the full row STOPPED on its short-socket setup, not a product assertion.
  Corrected groups-alone against that SAME install PASS,20.57s. No full local
  project repeat; its later options/removal and the full Linux/macOS manager
  matrix are NOT RUN locally and belong to hosted CI. macOS added groups time
  remains pending that hosted measurement.
- Candidate SHA256
  `05bcf6a6352e6fd70e26bf662a677c42c1d442fc596e472f7d5fa5b412790b6e`.
  Entry-by-entry against cb8a563a: only README.md, package.json and plugin.cjs
  differ; all10 members equal the proposed source exactly. Frozen declaration,
  skill, installer, launcher and no-upload provider are unchanged. Subsequent
  observer/tests/socket-driver/proof-map edits are not packed.

These do not claim cross-dashi validation or held live transfer acceptance.
Neither is RUN here. No owner profile, daemon, credential store or running
session was changed. This map preserves stopped attempts as history rather
than relabelling them as successful runs.

End-of-local-window cleanup:77 exact generated dependency/cache/store/private
home/daemon/toolchain targets under the own work root removed, one idle-priority
batch with directory-only chmod; regular-file modes unchanged.26 profile
metadata sets and273 privacy-checked captured logs were preserved; no login
link is retained in those captures. Free bytes87425155072→94946852864,
observed recovery7521697792. All targets absent; no own native child remains.
Source, candidate archives, stopped runs and native evidence remain for review.

## C4: native assembled request delta (not provider wire)

The retained W-154 controlled-adapter request (plugin0.1.6, DSH0.2.1-alpha.3)
is 33103 bytes, SHA256
`db7507411a10fa3a086922bc6a803f2c2daee04d5afd904ce339ab3869597e67`.
The W-155 request from the same existing controlled adapter (plugin0.2.0,
DSH0.2.2-rc.3) is 33796 bytes, SHA256
`e4b76aef86b17946aedb900a27ff4af2578b1955c0a6f3a12984150deb554c69`.
The assembled request grows from 33103 to 33796 B: +693 raw, +670 after
normalization. The DSH tool set changes (wait_agent added; exit_plan_mode,
interrupt_agent and web_search removed; four definitions changed:
list_agents, send_message, subagent and subagent_fork). The sessionbus
definition is byte-equal. Native tools alone grow137B, from26 to24 definitions.

These are complete native assembled LlmCallOptions messages and tools, not
provider-wire serialization. The measurement explicitly normalizes the two
proof cwd/root paths, case identifiers, session identities and individual
message identities; it does not erase tool or prompt content. Source/version
provenance, exact substitutions and raw/normalized bytes and hashes are in
the retained native-prefix-delta.json (SHA256
`8ee1b752df9fc2396abe8144757f82954aab8b57b0c5be98c9a4fe32ef13e35c`).
Provider serialization (pi-ai and the DeepSeek adapter) and server-side cache
behavior are NOT measured. No provider-wire, cache-hit or cache-reuse claim
is made. No extra adapter, proxy, provider experiment or dummy key was used.

## Owned proof-client privacy correction and stopped attempts

The first packed attempt stopped at the boundary fixture's obsolete default
import of the native executor. Correcting only that fixture import made its
isolated native control pass. The second attempt reached and passed the web,
groups and pending-input stages, then stopped because the offline-composition
observer awaited module imports inside its readiness callback and then read
an inactive injected context. Removing --help alone, then keeping stdin open,
each still failed; those narrow diagnostic attempts are retained, not called
passes. The correction awaits imports during plugin load, before registering
the readiness callback. The isolated native overlap proof then passed both
sessionbus/provider guard and silent-replacement controls. It also observes a
normal live host with its own input open, rather than --help or native
EOF-at-readiness exit (dsh-cmdline0.2.2-rc.3/lib/index.js:45-73), and stops only
its own child after collecting the same facts. No runtime behavior is changed.

During that second attempt, the reused shell web client wrote its own login
URL to a capture and supplied it as a child argument. The initial operator
update saying this was spotted before the web stage was incorrect: that stage
had already completed. The approved replacement consumes native stdout and
the cookie in RAM only; line-buffered evidence redacts the entire login URL,
including links split across output chunks. The native RPC sequence and the
downstream reconnect/permission/trace assertions remain unchanged. The groups
and universal-profile clients use the same chunk-safe evidence redaction.

Three files from the stopped second attempt were redacted in place, one URL
in each: web.stdout, groups-web.stdout and groups-web-resumed.stdout. No raw
copies are kept. Fresh ps inspection found no proof-owned web/native process.
The minting scratch home/profiles/web directory was removed after retaining
only its package.json, pnpm-lock.yaml and cordis.patch.yml; no live login
instance or scratch web profile remains. privacy-redactions.json records file
names and counts, not values. The unit control checks the actual client's
captured stdout/stderr and argv, its spawned native argv, a split login link,
the RAM-only login/cookie and the unchanged create/selectModel/prompt order.
selectModel is confined to the explicit private DSH_HOME under the proof's
scratch root, never a real profile. Its profile-default config write is removed
with that scratch profile. The installer-call unit now pins the two ordered
published0.1.5 baseline calls before the candidate add, the two candidate calls
after it, and absence of the retired cross-dashi call: +2 baseline/-1 retired
call changes four static callsites to five, not an added retry.

The third packed attempt reached all preceding stages, then the options fake
daemon refused `expected managed dashi lane hello; got product sessionbus-dsh,
token present true`. This was the old expected product operand left after the
approved cross-dashi leg was moved to W-156, not a candidate hello defect.
The standalone call now expects sessionbus-dsh; the unit pins that operand.
The stopped wire and stderr remain evidence, never relabelled PASS.

## Final daemon alignment

The fourth full packed run passed on the released private daemon0.5.12.
That result is historical/non-final: the architect then aligned all REAL
daemon legs to0.5.16, matching the unchanged kit. The final packed gate uses
0.5.16 for groups and pending input. Universal adverse permission/trace
fixtures remain synthetic, unchanged; the existing groups driver additionally
runs against released0.5.16 once per OS in the Node24.9.0 project row, not in
every package-manager row. The measured added time is retained in timings.json.
There is no real-model or U-series acceptance in these rows.

Official release: https://github.com/sessionbus/sessionbus/releases/tag/v0.5.16
(tag target ede4421b2ec9ec23c2c4ff8f695eeec5a8cb6e29).
SHA256SUMS itself hashes to
`ea2447b581a024d870c0c2d0b3833b168b793ea98cbb44649c8533b4ddff748a`.
The shared provision helper pins that manifest AND each host archive:
darwin-amd64 `8796b443495bcfae57a6518f88fa9566dce73288fdc619a94e88939d20eb292f`;
darwin-arm64 `1ae2659c038f32c63b06eec6f798d3e9eaaf630743d7d5e39985cb82ec0a8b62`;
linux-amd64 `e183d3f2ad8b999c612238e921fcdb093a6b52342c2ba7509c47e6551c7f0a03`;
linux-arm64 `82f81f351e4705d123d1fcb137966d9835cd401c8405a26f0a9c8905a2c74f3d`.
It verifies bytes before extraction and the actual bin's version before use.
No mutable latest/cache selector, daemon replacement or owner configuration
is used. The extra files, daemon processes and own profiles belong to their
existing proof scopes and are removed with those scopes.

The first0.5.16 packed attempt passed the real groups proof, then its pending
driver stopped at an overlooked old `/0\\.5\\.12/` version assertion before
starting the daemon. Only that expected version was corrected to the exact
released0.5.16 prefix; a unit now pins it. This setup/checker omission and its
original failure are retained; it is not a product failure or a passing run.

## Universal observer lifecycle stop: product audit and correction analysis

The first project row completed ordinary add/exec, then its observer failed:
`runtime-proof-plugin/plugin.cjs` registered an unowned app-ready callback;
`inspectRuntime` imported the inventory reader, resumed on a retired Cordis
activation, and read `ctx.loader`. A later retired callback overwrote the
failure record with an inactive `agents` error. Both the outer first-error
capture and the overwritten JSON are retained. This is not a project PASS.

Read-only product audit of `plugin.cjs`, before the observer correction:

| Callback or continuation; all relevant sites | Disposal / cancellation owner |
| --- | --- |
| captureContext:92-110; imports and storage open:693-706; activate rejection:712-713,735-736 | Each common and injected activation has ctx.effect liveness:98 and its own Fiber.uid. Services are captured synchronously:93-108,746, not read from a retired Cordis proxy after import. Late imports check active:697; late domain opens close their result:706. Rejection checks the same activation before fail. |
| NativeSession.open:203-256, including controller create/resolve/rename, maintenance callback:233-251 and flush | Worker owns Open and its cancellation, and lifecycle close:684 shuts the Worker down. Native maintenance owns its own signal, combined with Open at234, checked after resolveCallConfig at243 and after the durable append at250. Stored controller/permission/session services, not dynamic Cordis getters, are used after awaits. Existing no-option partial creation and disposal semantics are preserved, not rolled back. |
| NativeSession session/event listener:176,296-325; receipt abort callback:268-275; Run abort callback:339-340 | removeEvents is called by native close:406 and runtime close:684. Each receipt closes in run/steer finally:354,382; each Run removes its abort listener:355. Worker owns cancellation. |
| Deferred admission setImmediate:279-294, peer deliver:385-388, lane deliver:391-398 | This one-hop callback is not a repeating timer. Runtime close sets ready=false:679 before shutdown:684; peer live:465-466 checks ready/current root/map; lane admission checks Worker cancellation and current Run:394-396 before native access. The pending promise is settled rather than silently discarded; no stale admission is replayed. The timer itself is not joined. |
| NativeSession.run:344-348 and steerDelivery:377-382 | Worker / peer shutdown owns the delivery signal; receipt and Run finally blocks remove listeners and map entries. Only the retained native agent or receipt is accessed after waits, not a Cordis context proxy. |
| NativeSession.close:404-406 | Worker invokes this final native close:662, with session/event removal also owned by runtime close:684. The captured sessions service is used for flush. Worker.closed remains unjoined (historical disposal limit; do not add a native-close cycle). |
| connect delivery and socket callbacks:464-474; peer.closed/rehello continuation:477-481 | Peer owns socket/reconnect work; forget:497 and lifecycle close:683 shut it down. Delivery has ready/active/root/current-map guards. Diagnostics check active/current record:438-460; closed continuation checks current map after rehello:480. |
| agent created/disposed:500-501; session title listener and rehello chain:502-518 | Explicit removers at681, owned by lifecycle ctx.effect:687. Rehello checks current record, ready and root:510-511; catch uses active-guarded warn:438. Captured agents/title services only. |
| tool execute / output render / pre-execute waterfall:522-546 | Tool and waterfall disposers at681, lifecycle effect:687; execute selects an exact current caller before handing async work to its Peer/Worker. The async waterfall has no await or post-await context read. Render uses only its arguments. |
| groups command:557-644; initial rehello:572; candidate closed:594; old peer closed:599; ready/list/admission/save waits:605-635 | Command disposer:681 and lifecycle effect:687; each asynchronous branch checks live/current map before native or durable changes. Pending candidate has its own ctx.effect and agent-disposed listener:585-593, removed in finally:627. Closed callbacks read only retained records or live guards. Domain closes at685; an already-started put/delete is not rolled back. |
| runtime ready/start:647-677; Worker Open/Run/interrupt/deliver/close:655-662; Worker.closed/serving:664-672 | removeReady at681 cancels start; lifecycle effect:687 owns Worker.shutdown:684 and listeners. Worker callback continuation checks runtime active at666 before captured appExit. No Worker.closed join is claimed. |
| mode dependency callback:743-749; readiness refusal:750-759 | ctx.inject owns dependency replacement; scoped capture registers its own effect:98. The separate readiness callback is registered and cancelled through ctx.effect:750. It checks activation liveness before dynamic get:751-753. |

No product callback without an owner was found in this audit, and no product
runtime change is proposed for this observer failure. The audit distinguishes
logical cancellation from joining: earlier peer removals, deferred admission
timers and the Worker are not newly joined. The existing real Cordis 4.1
replacement/disposal and held-import controls remain product evidence.

Observer correction, approved in p416dzi3q42q: one alive flag per activation;
register and cancel appReady.onReady through ctx.effect; check alive after
each awaited probe and in catch. Active errors still save and throw. A
disposed continuation must neither access a retired context, write PASS nor
overwrite a first fatal error from the replacement activation. Tests drive
the actual fixture with held import/probe results, stale resolve/reject,
active failure, cancellation before ready, and first-error preservation.
No new runtime dependency, product state, retry, permission or model action.

Architect follow-up yh2d9p9grlxh: the setImmediate at plugin.cjs:285 is NOT
cleared by activation disposal (there is no clearImmediate/clearTimeout for
it in the lifecycle disposer:678-687). After disposal the peer closure
short-circuits at ready=false:465,679 before root or any ctx service; the
lane closure short-circuits on its cancelled signal:394. Actual kit0.5.16
Worker.shutdown index.js:70 calls Connection.close; connection.js:77-78
aborts synchronously, forwarded to the Worker signal at index.js:61.
The unit at plugin.test.cjs:2680, "deferred admission firing after activation
disposal reads no context or native service and writes nothing", exercises
both modes, the REAL kit shutdown for the lane, and the actual queued timer.
After disposal every context property and relevant agent property is a
throwing getter. The timer really fires, drains the entry, returns rejection
and leaves retained diagnostic/native-call/exit arrays unchanged. This pins
logical cancellation, not timer clearing or joining.

Failing first: both observer controls failed on the unedited fixture (retired
context read; later disposal error escaped and replaced the first record).
With the approved single effect-owned alive flag, both pass. The added timer
control initially caught its own test-only active predicate reading ctx.fiber;
capturing the Fiber, as the product already does, fixed that fixture mistake.
All three focused controls then passed; no product source was changed.

The full units then passed256/256. The one authorized project repeat reached
and passed ordinary add/exec on sessionbus/web/custom, lane and web public
resolution, native receipt refusals (including stock-provider negative),
round trips, durable input, permissions, cookie-auth empty web root and idle
wake. It then STOPPED before its new released-daemon groups leg: the daemon
refused its generated operator socket path (119 bytes, above its107 limit)
under the long private evidence directory. Log aaa72f66; candidate archive
remains05bcf6a6352e6fd70e26bf662a677c42c1d442fc596e472f7d5fa5b412790b6e.
The stopped root is sessionbus-universal.jNcORTay; no native child remains.

Socket correction authority dndvtpnbbh7r: only the socket moves into a new
private /tmp/sbg.* directory (never TMPDIR); all logs, table/state and session
evidence stay in the original work. An actual preflight rejects >=100 BYTES
before daemon start, naming path and length, so Linux and macOS bounds are
both covered. Existing finally removes the owned short directory even if
process cleanup fails. No daemon configuration, permissions or assertions
change. Normal boot/restart uses the same socket until cleanup; no replay.
Source preflight also caught the final invalid-record refusal using the old
home-local CLI assumption; it now uses the same selected dsh argv as both
normal boots (packed default unchanged). A unit pins short ASCII/multibyte
boundaries, pre-spawn ordering, cleanup and both CLI sites. It failed first
without the guard. Only groups alone re-runs against the SAME install; the
full local project row is not repeated. Hosted CI owns the full matrix.

## Classified stale-assumption sweep (before final full gate)

Scope: every proof script/driver, fixture member, workflow and root unit file,
plus the retired dashi selector. Escaped regex literals are included. No file
is skipped except the generated allow-list itself (to avoid self-recursion).
The retained hits below are exact per-line (b) entries, each with a reason;
the unit rejects any new, moved, changed or duplicated hit and has four
deliberate stale-target/API/Node mutations. It also rejects any current call
to the historical before-driver or selector. Removed tool/scheduling identifiers
are searched too: no live native call using them remains.

Resolved (a) hits from the migration/alignment, no open (a) or (c):
- prove-packed-install.sh old standalone options operand dashi → sessionbus-dsh (same unit-pinned standalone product).
- prove-peer-pending-input.mjs:234 old expected daemon /0\.5\.12/ → exact released0.5.16 prefix (no semantic relaxation).
- prove-runtime-resolution.mjs:41,55 synthetic current checker peer >=4.0.5-alpha.1 → >=4.1.0, matching the new candidate; negative local metadata4.0.4 → closest prior stable4.0.5. No old Cordis code is booted.
- proof-process-group.mjs:64 stale alpha.1/alpha.2 shutdown cite → rc.3 createProcessShutdown; the actual5000+5000/5000 bounds are unchanged.

All kept hits (181):
- (b) .github/dashi-app-version:1 — "0.2.0-alpha.2" — Historical selector; no current packed/universal driver reads it; the unit pins non-use.
- (b) .github/fixtures/bundle-provides-sessionbus/cordis.patch.yml:5 — "    - { id: sessionbus, name: '@sessionbus/dsh', config: { product: dashi } }" — Synthetic bundle-conflict baseline with a dashi-labelled product; no dashi-app or launcher boot.
- (b) .github/fixtures/file-uploads-none-alpha/package.json:3 — "  \"version\": \"0.2.0-alpha.1\"," — Byte-preserved published legacy-provider metadata used by installer/coexistence controls, not the supported DSH/Node floor.
- (b) .github/fixtures/file-uploads-none-alpha/package.json:10 — "    \"url\": \"https://github.com/antst/dashi\"," — Byte-preserved published legacy-provider metadata used by installer/coexistence controls, not the supported DSH/Node floor.
- (b) .github/fixtures/file-uploads-none-alpha/package.json:25 — "    \"node\": \"^22.19.0 || >=24.0.0\"" — Byte-preserved published legacy-provider metadata used by installer/coexistence controls, not the supported DSH/Node floor.
- (b) .github/fixtures/file-uploads-none-alpha/package.json:28 — "    \"@deepseek-ai/cordis\": \">=4.0.5-alpha.1\"" — Byte-preserved published legacy-provider metadata used by installer/coexistence controls, not the supported DSH/Node floor.
- (b) .github/fixtures/model-prefix-0.1.4.json:6 — "    \"dsh\": \"0.2.1-alpha.3\"" — Immutable historical model-byte fixture, not the current renderer baseline.
- (b) .github/fixtures/model-prefix-0.1.6.json:4 — "    \"version\": \"0.1.6\"," — Immutable historical model-byte fixture; six independent oracles stay exact, renderer oracle is separately rc.3.
- (b) .github/fixtures/model-prefix-0.1.6.json:7 — "    \"dshTools\": \"0.2.1-alpha.3\"" — Immutable historical model-byte fixture; six independent oracles stay exact, renderer oracle is separately rc.3.
- (b) .github/scripts/dsh-cli-pins.mjs:6 — "// Same CLI-minimum rule as dashi's W-109 helper; one pin map for every consumer." — Shared helper provenance comment, not a dashi runtime/version selection.
- (b) .github/scripts/fake-permission-sessionbus.mjs:9 — "  from: { session_id: \"child@host\", name: \"Child\", product: \"dashi\", groups: [\"web-proof\"] }," — Synthetic sender product label for receipt/envelope controls; does not launch that product.
- (b) .github/scripts/fake-permission-sessionbus.mjs:79 — "          send({ id: 200, method: \"message.deliver\", params: { message_id: \"peer-delivery-proof\", from: { session_id: \"other-peer\", name: \"Other\", product: \"dashi\", groups: [\"web-proof\"] }, body: deliveryInput } });" — Synthetic sender product label for receipt/envelope controls; does not launch that product.
- (b) .github/scripts/prove-dashi-resolution.mjs:7 — "/** Metadata-only coexistence oracle; dashi's own matrix proves its mounted provider. */" — Public metadata-only coexistence oracle kept for unit controls; not a native dashi boot; W-156 owns live cross-dashi.
- (b) .github/scripts/prove-dashi-resolution.mjs:10 — "  const app = ctx.pluginPackages.packageOf('@antst/dashi-app', importer);" — Public metadata-only coexistence oracle kept for unit controls; not a native dashi boot; W-156 owns live cross-dashi.
- (b) .github/scripts/prove-dashi-resolution.mjs:43 — "  const profile = loadProfileDirectory('dsh', path.join(home, 'profiles/dashi'), anchor);" — Public metadata-only coexistence oracle kept for unit controls; not a native dashi boot; W-156 owns live cross-dashi.
- (b) .github/scripts/prove-dashi-resolution.mjs:51 — "      ? `dashi shared plugin: candidate ${candidateVersion} equals app pin ${report.dashiAppImporter.version}; ONE canonical copy: PASS (metadata, not TUI boot)`" — Public metadata-only coexistence oracle kept for unit controls; not a native dashi boot; W-156 owns live cross-dashi.
- (b) .github/scripts/prove-dashi-resolution.mjs:52 — "      : `dashi coexistence: direct ${candidateVersion} beside app pin ${report.dashiAppImporter.version}; TWO resolved copies: PASS; candidate-inside-dashi not claimed`);" — Public metadata-only coexistence oracle kept for unit controls; not a native dashi boot; W-156 owns live cross-dashi.
- (b) .github/scripts/prove-dashi-resolution.mjs:53 — "    console.log('candidate contributes no external provider package; dashi provider mounting is owned by the dashi matrix, not this metadata proof');" — Public metadata-only coexistence oracle kept for unit controls; not a native dashi boot; W-156 owns live cross-dashi.
- (b) .github/scripts/prove-host.cjs:59 — "  insist(p.sessionsDir === `${p.dshHome}/sessions`, \"only the stock alpha.2 sessions root is supported\");" — Historical W-128 fleet observer/protocol validation, not a W-155 host/native gate.
- (b) .github/scripts/prove-host.cjs:77 — "      (p.mode !== \"lane\" || [\"sessionbus-dsh\", \"dashi\"].includes(p.product))," — Historical W-128 fleet observer/protocol validation, not a W-155 host/native gate.
- (b) .github/scripts/prove-lane-options-before.mjs:1 — "// HISTORY ONLY: the pre.20 runtime reproduction is not called by current gates." — Explicit HISTORY ONLY pre.20 reproduction; no current driver references it (asserted by unit).
- (b) .github/scripts/prove-lane-options-before.mjs:21 — "assert.equal(JSON.parse(fs.readFileSync(pluginFile)).version, '0.1.0-pre.20');" — Explicit HISTORY ONLY pre.20 reproduction; no current driver references it (asserted by unit).
- (b) .github/scripts/prove-lane-options-before.mjs:45 — "  console.log(`W-126 published pre.20 failing-first: native async profile mutation caught by the SAME options proof: PASS (${Date.now() - began} ms)`);" — Explicit HISTORY ONLY pre.20 reproduction; no current driver references it (asserted by unit).
- (b) .github/scripts/prove-mode-controller.mjs:15 — "const { renderToolsSdk, renderToolsSdkPy } = await import(pathToFileURL(native.resolve('@deepseek-ai/dsh-tool-executor-ptc')));" — Unchanged historical declaration/skill fixture or supported synthetic product label; actual renderer import and rc.3 pin are current.
- (b) .github/scripts/prove-mode-controller.mjs:64 — "  const { prefix } = JSON.parse(fs.readFileSync(new URL('../fixtures/model-prefix-0.1.6.json', import.meta.url)));" — Unchanged historical declaration/skill fixture or supported synthetic product label; actual renderer import and rc.3 pin are current.
- (b) .github/scripts/prove-mode-controller.mjs:70 — "  for (const product of ['dsh', 'dashi', 'sessionbus-dsh']) {" — Unchanged historical declaration/skill fixture or supported synthetic product label; actual renderer import and rc.3 pin are current.
- (b) .github/scripts/prove-mode-controller.mjs:90 — "        typescript: renderToolsSdk(sdk), python: renderToolsSdkPy(sdk)," — Unchanged historical declaration/skill fixture or supported synthetic product label; actual renderer import and rc.3 pin are current.
- (b) .github/scripts/prove-native-row-conflicts.mjs:76 — "    const added = await run(['plugin', '--profile', name, 'add', '--save-exact', candidate, bundle, '@antst/dsh-file-uploads-none@0.2.0-alpha.2'], `${kind}-native-add`);" — Intentional legacy external-provider coexistence negative control under current DSH; not an old DSH/dashi runtime.
- (b) .github/scripts/prove-packed-install.sh:219 — "for profile in sessionbus web dashi; do" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:226 — "  DSH_HOME=\"$home\" \"$dsh\" plugin --profile \"$profile\" add --save-exact @sessionbus/dsh@0.1.5 @antst/dsh-file-uploads-none@0.2.0-alpha.2" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:244 — "DSH_HOME=\"$home\" \"$dsh\" plugin --profile dashi add \"$root/.github/fixtures/bundle-provides-sessionbus\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:245 — "for profile in sessionbus web dashi; do" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:254 — "cp \"$home/profiles/dashi/package.json\" \"$work/dashi-manifest-before-refusal.json\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:255 — "cp \"$home/profiles/dashi/cordis.patch.yml\" \"$work/dashi-patch-before-refusal.yml\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:257 — "PATH=\"$home/node_modules/.bin:$PATH\" DSH_HOME=\"$home\" \"$home/profiles/dashi/node_modules/.bin/sessionbus-dsh-install\" --product dashi dashi >\"$work/dashi-install.stdout\" 2>\"$work/dashi-install.stderr\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:258 — "dashi_install_status=$?" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:260 — "[[ \"$dashi_install_status\" -eq 2 ]]" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:261 — "grep -F 'profile \"dashi\" app \"@sessionbus/w090-bundle-row\" already provides Sessionbus; there is nothing to install' \"$work/dashi-install.stderr\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:262 — "cmp -s \"$work/dashi-manifest-before-refusal.json\" \"$home/profiles/dashi/package.json\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:263 — "cmp -s \"$work/dashi-patch-before-refusal.yml\" \"$home/profiles/dashi/cordis.patch.yml\"" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:264 — "for profile in sessionbus web dashi; do" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:280 — "const dashi = readPatch(\"dashi\");" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:290 — "assert.doesNotMatch(dashi, /id: sessionbus/u);" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:291 — "const dashiManifest = JSON.parse(fs.readFileSync(`${home}/profiles/dashi/package.json`, \"utf8\"));" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:343 — "echo 'NOT RUN here: cross-dashi launcher/app leg belongs to W-156 on the same reviewed archive; plugin publication is held until it passes'" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-packed-install.sh:434 — "echo 'Cross-dashi: NOT RUN (W-156 publication gate); known native gaps are observations, not continuity PASS'" — Published0.1.5/legacy unused-provider upgrade baseline, synthetic dashi-labelled bundle-refusal/profile checks, or explicit NOT RUN cross-dashi notice; actual standalone lane expects sessionbus-dsh.
- (b) .github/scripts/prove-peer-pending-input.mjs:112 — "  `    - { id: sessionbus, name: ${JSON.stringify(pluginFile)}, config: ${JSON.stringify({ product: 'dashi', socket: env.SESSIONBUS_SOCKET, groups: ['pending-proof'] })} }`," — Synthetic dashi product label in its own controller composition, or wording forbidding plugin scheduler compensation; not a dashi launcher/old daemon.
- (b) .github/scripts/prove-peer-pending-input.mjs:215 — "    assert.fail(`Upstream DSH now wakes pending input after ${ending}; update this known-gap assertion and documentation, not the plugin scheduler.`);" — Synthetic dashi product label in its own controller composition, or wording forbidding plugin scheduler compensation; not a dashi launcher/old daemon.
- (b) .github/scripts/prove-runtime-resolution.mjs:23 — "assert.doesNotMatch(matches[0][1], /reflect\\.store|ownerFiber|loader\\.entries|moduleNamespace|packages\\.current/u," — Negative assertion that retired private-reflection API names must be absent.
- (b) .github/scripts/stale-proof-audit.mjs:6 — "const stale = /0\\.5\\.12|(?:0\\.2\\.1-)?alpha\\.\\d+|0\\.2\\.1-rc\\.\\d+|0\\.1\\.6|pre\\.20|\\bdashi(?:\\b|[-_/])|(?:node|Node)[\\s\":=v-]*22(?:\\.[\\dx]+)*|\\b22\\.(?:x|\\d+)\\b|sdkSchemas|selectionFor|selectForNextRequest|serializeImageAdmission|agents\\.roots|isOwnedBy|reflect\\.store|ownerFiber|moduleNamespace|packages\\.current|stateOf\\(|listChildren|exit_plan_mode|interrupt_agent|web_search|schedul|(?:create|cancel|delete|update|list|pause|resume)_(?:task|job)s?|tools\\.execute|renderToolsSdk|prove-lane-options-before|dashi-app-version/u;" — The deny-pattern definition and explicit historical-selector scan; not a runtime assumption.
- (b) .github/scripts/stale-proof-audit.mjs:18 — "  files.push('.github/dashi-app-version');" — The deny-pattern definition and explicit historical-selector scan; not a runtime assumption.
- (b) host-proof.test.cjs:213 — "      else if (label === \"dsh-version\") stdout = \"0.2.1-alpha.2\\n\";" — Synthetic historical observer packet/command fixture; no native old DSH boot.
- (b) install.test.mjs:63 — "    writeFileSync(path.join(root, \"registry-version.mjs\"), \"export function registryHasVersion(name, version) { if (name !== '@deepseek-ai/dsh-invariants' || version !== '0.2.1-alpha.2') throw new Error('unexpected registry query'); return false; }\\n\");" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:75 — "        input: `check_dsh_graph() { :; }\\n${fixed ? source : source.replace(fix, \"\")}\\nrepair_dsh_graph \"$ROLLBACK_ROOT\" 0.2.1-alpha.2\\n`," — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:108 — "  install([], { ...f, product: \"dashi\" });" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:109 — "  assert.equal(readFileSync(f.file(\"sessionbus\"), \"utf8\"), first.replace(\"product: sessionbus-dsh\", \"product: dashi\"));" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:131 — "    writeFileSync(path.join(profile, \"package.json\"), JSON.stringify({ dependencies: { \"@sessionbus/dsh\": packageVersion, [uploads]: \"0.2.0-alpha.1\" } }));" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:144 — "  const profile = path.join(home, \"profiles\", \"dashi\");" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:152 — "  assert.throws(() => install([\"dashi\"], { home, product: \"dashi\", run: () => assert.fail(\"preflight must not install\") }), error => {" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:163 — "  const dashi = path.join(home, \"profiles\", \"dashi\");" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:164 — "  mkdirSync(dashi, { recursive: true });" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:165 — "  writeFileSync(path.join(dashi, \"package.json\"), JSON.stringify({ dependencies: { \"@sessionbus/dsh\": packageVersion, [uploads]: \"0.2.0-alpha.1\" } }));" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:167 — "  writeFileSync(path.join(dashi, \"cordis.patch.yml\"), patch);" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:168 — "  install([\"dashi\"], { home, root: path.resolve(\".\"), product: \"dashi\", run: () => assert.fail(\"dependency already installed\") });" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:169 — "  const installed = readFileSync(path.join(dashi, \"cordis.patch.yml\"), \"utf8\");" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:172 — "  assert.match(installed, /product: dashi/u);" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:174 — "  install([\"dashi\"], { home, root: path.resolve(\".\"), product: \"dashi\", run: () => assert.fail(\"dependency already installed\") });" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:175 — "  assert.equal(readFileSync(path.join(dashi, \"cordis.patch.yml\"), \"utf8\"), installed);" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:182 — "  writeFileSync(path.join(web, \"package.json\"), JSON.stringify({ dependencies: { \"@sessionbus/dsh\": packageVersion, [uploads]: \"0.2.0-alpha.1\" } }));" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:190 — "  assert.throws(() => install([\"sessionbus\"], { home: \"/unused\", product: \"dsh\" }), /must be sessionbus-dsh or dashi/u);" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:245 — "  const dependencies = { \"@sessionbus/dsh\": packageVersion, [uploads]: \"0.2.0-alpha.1\" };" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:246 — "  writeFileSync(path.join(profile, \"package.json\"), JSON.stringify({ dependencies: { ...dependencies, \"@antst/dashi-app\": \"0.2.0-alpha.1\" } }));" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:248 — "  const app = path.join(profile, \"node_modules/@antst/dashi-app\");" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:250 — "  writeFileSync(path.join(app, \"package.json\"), JSON.stringify({ version: \"0.2.0-alpha.1\", dependencies: { [uploads]: \"0.2.0-alpha.1\" } }));" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) install.test.mjs:275 — "  assert.equal(JSON.parse(readFileSync(path.join(profile, \"package.json\"), \"utf8\")).dependencies[uploads], \"0.2.0-alpha.1\");" — Synthetic installer product/bundle/legacy-provider baseline; no old native runtime.
- (b) package.test.cjs:52 — "  for (const version of ['0.2.1-alpha.3', '0.2.1-rc.2', '0.2.2-rc.2', '0.2.2-rc.4']) {" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:95 — "  for (const other of ['0.2.1-alpha.3', '0.2.1-rc.2', '0.2.2-rc.2', '0.2.2-rc.4']) assert.throws(() => version(other), /UNVERIFIED/u);" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:170 — "      && error.message.includes(\"update this known-gap assertion and documentation, not the plugin scheduler\"));" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:259 — "test(\"dashi metadata multiplicity derives from the app pin, never provider physical counts\", async t => {" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:260 — "  const { inspectDashiResolution } = await import(\"./.github/scripts/prove-dashi-resolution.mjs\");" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:262 — "  function fixture({ candidate = \"0.1.0-pre.20\", separate = false, wrongBundled = false, candidateProvider = false } = {}) {" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:263 — "    const dir = fs.mkdtempSync(path.join(os.tmpdir(), \"sessionbus-dashi-oracle-\"));" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:268 — "      if (name === \"@antst/dashi-app\") manifest.dsh = { bundle: { patch: \"./cordis.patch.yml\" } };" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:273 — "    const app = pkg(path.join(dir, \"node_modules/@antst/dashi-app\"), \"@antst/dashi-app\", \"0.2.0-alpha.2\", {" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:274 — "      \"@sessionbus/dsh\": \"0.1.0-pre.20\", \"@antst/dsh-file-uploads-none\": \"0.2.0-alpha.2\"," — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:279 — "    const bundled = separate ? pkg(path.join(app.dir, \"node_modules/@sessionbus/dsh\"), \"@sessionbus/dsh\", wrongBundled ? \"0.1.0-pre.18\" : \"0.1.0-pre.20\") : direct;" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:281 — "      if (name === \"@antst/dashi-app\") return app;" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:303 — "    name: \"@deepseek-ai/dsh\", dependencies: { \"@deepseek-ai/dsh-storage-domain\": \"0.2.1-alpha.2\" }," — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:310 — "  const pins = deriveCliPins({ \"@deepseek-ai/cordis\": \"^4.0.5-alpha.1\" }, directory);" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:323 — "  assert.doesNotThrow(() => assertPinnedGraph(\"packages:\\n  zod@3.25.76:\\n  zod@4.5.4:\\n\", { zod: pins.zod }, \"0.2.1-alpha.2\"));" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) package.test.cjs:324 — "  assert.throws(() => assertPinnedGraph(\"packages:\\n  zod@3.25.76:\\n\", { zod: pins.zod }, \"0.2.1-alpha.2\"), /storage-domain zod 4.5.4 is missing/u);" — Intentional non-baseline refusal input, immutable-prefix baseline, or synthetic metadata/Zod/companion negative control; no old native boot.
- (b) plugin.test.cjs:25 — "    from: { session_id: \"sender@host\", name: \"Sender\", product: \"dashi\", groups: [\"team\"] }," — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:159 — "  apply(ctx, { product: \"dashi\" }, {" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:188 — "test(\"W-154 registered tool and skill bytes stay pinned to the reviewed 0.1.6 declaration\", async () => {" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:189 — "  const { prefix } = JSON.parse(fs.readFileSync(path.join(__dirname, \".github/fixtures/model-prefix-0.1.6.json\"), \"utf8\"));" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:190 — "  for (const product of [\"dsh\", \"dashi\", \"sessionbus-dsh\"]) {" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:206 — "        assert.equal(Buffer.byteLength(bytes), prefix[name].bytes, name + \": reviewed 0.1.6 model-prefix length changed\");" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:208 — "          name + \": reviewed 0.1.6 model-prefix bytes changed; review deliberately, never refresh this golden silently\");" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:344 — "        else if (cause === \"capture\") { ctx.on = undefined; apply(ctx, { product: \"dashi\" }, deps); }" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:346 — "          apply(ctx, { product: \"dashi\" }, {" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:361 — "          runtime = await activate(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:430 — "    const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:441 — "  const runtime = await activate(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:457 — "  apply(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:480 — "  apply(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:543 — "  ctx.agents.roots = () => { throw new Error(\"removed roots API used\"); };" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:710 — "  assert.deepEqual(settings(ctx, { product: \"dashi\", groups: [\"config\"], socket: \"/config.sock\", local_key: \"config-key\" }), {" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:711 — "    mode: \"peer\", product: \"dashi\", groups: [\"config\"], socket: \"/config.sock\", localKey: \"config-key\"," — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:714 — "  assert.throws(() => settings(ctx, { product: \"dashi\", mode: \"lane\" }), /conflicts/);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:715 — "  assert.throws(() => settings(new Context(), { product: \"dashi\", groups: [\"same\", \"same\"] }, {}), /groups/);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:716 — "  assert.equal(settings(new Context(), { product: \"dashi\" }, { SESSIONBUS_SOCKET: \"relative.sock\" }).socket, path.resolve(\"relative.sock\"));" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:717 — "  assert.equal(settings(new Context(), { product: \"dashi\" }, { SESSIONBUS_SOCKET: \"/absolute.sock\" }).socket, \"/absolute.sock\");" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:718 — "  assert.equal(settings(new Context(), { product: \"dashi\" }, { XDG_RUNTIME_DIR: \"/run/user/123\" }).socket, \"/run/user/123/sessionbus/presence.sock\");" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:719 — "  assert.equal(settings(new Context(), { product: \"dashi\" }, {}).socket, `/tmp/sessionbus-${process.getuid()}/presence.sock`);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:909 — "  const scheduled = [];" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:912 — "  deps.schedule = (call, delay) => { assert.equal(delay, 2000); scheduled.push(call); };" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:924 — "    while (scheduled.length === 0) await new Promise(setImmediate);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:929 — "    scheduled.shift()();" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:930 — "    while (scheduled.length === 0) await new Promise(setImmediate);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:954 — "    scheduled.shift()();" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:962 — "    while (scheduled.length === 0) await new Promise(setImmediate);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:963 — "    scheduled.shift()();" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:964 — "    while (scheduled.length === 0) await new Promise(setImmediate);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:969 — "    scheduled.shift()();" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:970 — "    while (scheduled.length === 0) await new Promise(setImmediate);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:976 — "    scheduled.shift()();" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:978 — "    assert.equal(ctx.logs.length, 3, \"shutdown does not schedule a new publication or log stale errors\");" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1065 — "      const runtime = createRuntime(ctx, { product: mode === \"peer\" ? \"dashi\" : \"sessionbus-dsh\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1069 — "      assert.deepEqual(await ctx.tool.execute({ action: \"spawn\", arguments: { product: \"dashi\", name: \"trace-child\", open: {} } }, { agent: native }), result);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1074 — "    assert.deepEqual(spawns, Array(2).fill({ product: \"dashi\", name: \"trace-child\", open: {} }));" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1700 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1720 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1745 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1754 — "    from: { session_id: \"child@host\", name: \"Child\", product: \"dashi\", groups: [\"team\"] }," — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1776 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1806 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1826 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:1846 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2089 — "test(\"candidate retains the kit scheduling contract even before map adoption\", async () => {" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2091 — "  const scheduled = [], connect = deps.connectPeer;" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2092 — "  deps.schedule = (call, delay) => { scheduled.push(delay); call(); };" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2097 — "    assert.equal(args[3].schedule, deps.schedule);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2098 — "    args[3].schedule(() => { resumed++; }, 2000);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2104 — "  assert.deepEqual(scheduled, [2000]);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2333 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2352 — "  assert.deepEqual(deps.peers[0].identity, { product: \"dashi\", session_id: one.id, name: \"Original\", groups: [\"team\"], info: { cwd: \"/workspace\", model: \"provider/default\" } });" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2427 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2439 — "    product: \"dashi\", session_id: \"session-authoritative\", name: \"Bound\", groups: [\"team\"], info: { cwd: \"/workspace\", model: \"provider/default\" }," — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2448 — "  createRuntime(ctx, { product: \"dashi\" }, first);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2457 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, second);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2483 — "  const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2498 — "  createRuntime(ctx, { product: \"dashi\" }, dependencies(ctx));" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2513 — "  createRuntime(ctx, { product: \"dashi\" }, dependencies(ctx));" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2535 — "  assert.throws(() => createRuntime(ctx, { product: \"dashi\" }, dependencies(ctx))," — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2591 — "      const runtime = createRuntime(ctx, { product: \"dashi\" }, deps);" — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) plugin.test.cjs:2603 — "      [\"spawn\", { product: \"dashi\", name: \"worker\", extra_groups: [\"team\"], persistent: true, notify: false, notify_target: \"owner\", auto_close_ms: 0, trace: \"events\", open: { cwd: \"/workspace\", permission_mode: \"ask\", model: \"model\", reasoning_effort: \"high\", arguments: [\"--flag\"] } }]," — Synthetic product/envelope contract, historical byte golden, removed-root-API throwing trap, or injected JS reconnect clock; not a retired native API call.
- (b) universal-install.test.mjs:66 — "  const floor = make(); floor.ctx.profileContext.installAnchor = packageAt('below-floor-cli', { version: '0.2.1-alpha.1' }).manifestPath; assert.throws(() => check(floor));" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:83 — "  for (const text of [\"const expected = '0.5.12';\", \"agents.roots()\", \"const node = '22.x';\", \"tools.sdkSchemas()\"])" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:87 — "  assert.doesNotMatch(packed + universal, /prove-lane-options-before|dashi-app-version/u, 'historical runtime before-proofs are not current gates');" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:151 — "  assert.doesNotMatch(packed, /daemon-v0\\.5\\.12/u);" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:168 — "  writeFileSync(path.join(cli, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-alpha.2' }));" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:176 — "      private: true, custom: { keep: true }, dependencies: { '@sessionbus/dsh': version, [helper]: '0.2.0-alpha.2', keeper: '1.2.3' }," — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:182 — "  return { home, installAnchor: path.join(cli, 'package.json'), query: () => ({ status: 0, stdout: '[\"0.2.0-alpha.2\"]' })," — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:196 — "  install(['sessionbus', 'web', 'custom'], { ...f, product: 'dashi' });" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:201 — "  install(['sessionbus', 'web', 'custom'], { ...f, product: 'dashi' });" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:213 — "    assert.throws(() => install(['web', 'sessionbus'], { ...f, product: 'dashi' }), error => error.exitCode === 2 && error.message.includes('sessionbus') && error.message.includes('package.json'));" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:237 — "  assert.throws(() => install(['web', 'sessionbus', 'custom'], { ...f, product: 'dashi' }), /failed writing profile \"sessionbus\".*completed profiles: web; this profile may be partially written; profiles not attempted: custom/u);" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:330 — "test('pre.20 marked no-upload row upgrades to the own entry without touching dependency pins', t => {" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:491 — "  const bus = `- id: sessionbus ${marker}\\n  name: '@sessionbus/dsh'\\n  config: { mode: lane, product: dashi }\\n`;" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:522 — "  assert.throws(() => install(['web', 'custom'], { ...f, product: 'dashi' }), error => error.exitCode === 2" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:530 — "    `# header\\n- insert:\\n    - { name: '@sessionbus/dsh', config: { groups: [native], product: dashi }, id: sessionbus } ${marker}\\n# footer\\n`," — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:535 — "    assert.equal(readFileSync(f.file('web'), 'utf8'), body.replace('product: dashi', 'product: dsh'));" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:606 — "    assert.throws(() => operation(['web', 'sessionbus'], { ...f, product: 'dashi' }), error => error.exitCode === 2 && error.message.includes(f.file('sessionbus')));" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:629 — "    if (operation === remove) install(['web', 'sessionbus'], { ...f, product: 'dashi' });" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:637 — "      assert.throws(() => operation(['web', 'sessionbus'], { ...f, product: 'dashi' }), /profile \"sessionbus\".*changed.*rerun.*completed profiles: web/u);" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:703 — "    assert.throws(() => operation(['web', 'sessionbus'], { ...f, product: 'dashi' }), error => error.exitCode === 2 && error.message.includes(f.file('sessionbus')) && /UTF-8/u.test(error.message));" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:729 — "test('dashi metadata proof uses the actual CLI owner when app-boot is not hoisted', t => {" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:739 — "  writeFileSync(path.join(cli, 'package.json'), '{\"name\":\"@deepseek-ai/dsh\",\"version\":\"0.2.1-alpha.2\"}');" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:747 — "  const source = readFileSync(new URL('./.github/scripts/prove-dashi-resolution.mjs', import.meta.url), 'utf8');" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:789 — "  assert.doesNotMatch(prepared, /installer_exec .*--product dashi/u, 'cross-dashi call is retired to W-156, not retried');" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
- (b) universal-install.test.mjs:790 — "  assert.match(prepared, /prove-lane-options\\.mjs\" .*\"\\$root\" sessionbus-dsh/u, 'standalone options proof expects its actual product, not the retired cross-dashi product');" — Synthetic installer/protocol baseline, stale-literal mutation/negative assertion, or metadata-only legacy fixture; not a current native target selection.
