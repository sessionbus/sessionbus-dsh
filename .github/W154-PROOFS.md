# W-154: full Sessionbus file transfer

## Kit 0.5.16 re-pin (adopted in this commit)

Plugin 0.1.6 adopts exact `@sessionbus/kit` 0.5.16 from the DEV1-cleared R3.
The frozen lock install, units and scoped local gates have run; their actual
results are recorded below. Live real-model acceptance remains separate.

- Kit npm integrity, computed from the provided archive:
  `sha512-beiJWHttoSfH28XCrYn/SQ80I9/AoM/9mSN2PRjdR13U4g+8yCA+kmEQuLVQJoxRoXz4LDTF/ejDAKgfrpOvCg==`.
- Kit tarball SHA-256:
  `f11b8a60bede2972545454a418b6910bb733c69dd6243299897c30e5fd4a5e1a`.
- Kit registry gitHead `ede4421b2ec9ec23c2c4ff8f695eeec5a8cb6e29`
  (not present in the tarball package.json, by npm design).
- New plugin archive SHA-256: `647c1cf0c1508c76061c01465c0730b00ade1351150dd2382e43cc8e5d7a9160`
  (set at adoption pack).

Source of fill: Root's KIT16-PUBLISHED-INPUT registry archive and receipts,
not a local pack or npm cache. The SHA-256 and computed SHA-512 agree with
both supplied receipts. NPM-FILES-VERIFIED.json records Root's byte-equality
of all 12 shipped members against that registry gitHead; own streamed member
hashes match all 12 receipt hashes. The optional registry-only npm view also
matches gitHead and integrity, as an extra record, not the fill source.
Own static checks on the archive's sdk/js/caller.js match all 18 frozen
actions in order. The five retained reviewed JS files are byte-identical to
their published members, including the documented `unknown_transfer` error
and hello negotiation changes. Evidence and the resolved initial gitHead
check stop are recorded in the off-repo R3 PROVENANCE and VERIFICATION-R3.
Old daemons may show `sessionbus_unknown_transfer` in peers' public info,
like the other opt-in keys; this is dynamic tool-result metadata, not a
tool/skill definition change.

Kit 0.5.16's reviewed source distinguishes SDK-local unknown/ended transfer
accept refusals and negotiates the no-accessible-live-transfer status refusal
as `unknown_transfer`; existing field/role/path conflicts and legacy-kit
status answers are preserved. Static artifact/source checks are not native
acceptance evidence. Tool, skill and golden bytes are unchanged. The e66
fail-closed scripts remain unchanged; the fleet result is not a packed PASS.

Adoption checks on the exact 647c1cf0 archive recorded above:

- Frozen lock install: exit 0. All 12 installed kit members equal Root's
  provided registry archive byte for byte.
- Units: the first run's 241/242 exact-hello failure is retained. After the
  approved correction adding `sessionbus_unknown_transfer: 1` to both expected
  hello info literals, keeping full deepEqual and every old field, the fresh
  complete run passed 242/242 (exit 0, no skips or cancellations).
- Alpha.3 full packed gate: PASS, exit 0, including its existing native,
  schema/root/prefix, pending-input gap/recovery and uninstall checks.
- Alpha.1 native refusal: PASS, exit 0, covering native add refusal and
  disabled rows in the labelled forced-package boot control.
- Fleet rc.2: OBSERVATION only, exit 1 UNVERIFIED at mode-controller. It reached
  the CLI closure/companion, schema/runtime-resolution and candidate upgrade/
  installer checks. All six renderer-independent byte oracles and root checks
  held for the three products. TS/Python remained explicitly UNVERIFIED;
  the nine subsequent readiness/controller/import-replacement controls passed
  before that checker's final UNVERIFIED summary. No later packed stages ran.
  This is not native profile acceptance or an alpha.3 error/cancel oracle on
  rc.2. No renderer golden or fail-closed condition was changed.
- Repack after the fixture/proof correction and all three gate packs have
  SHA-256 `647c1cf0c1508c76061c01465c0730b00ade1351150dd2382e43cc8e5d7a9160`.
  Against 810bba7d, only README and package.json differ; runtime, frozen tool
  declaration, skill and all other packed members remain byte-identical.

Pending: the full native U1-U6 plus idle, busy and lane acceptance in Root's
coordinated window. No local U rows or real-model turns were run. The README/
CHANGELOG validation claim stays tied to kit-0.5.15 historical observations
until that acceptance; local gate results do not replace it. The historical
sections below are preserved verbatim: their earlier pending language records
those earlier stages, not the current adoption/results above.

### UMKA preparation: Root-relayed observations, not transfer acceptance

Live real-model acceptance is pending: three turns across two preparation windows ended with DSH’s SERVER error (its classification of backend server failures; no HTTP status was observed), before any transfer; no plugin fault was established.

- First preparation window: both A's and B's model turns ended SERVER (two turns).
- Second preparation window: A's ack-continuation model turn ended SERVER
  (one turn). Total: three SERVER-ended turns across two windows, not two
  failed turns and not three preparation windows.
- The duplicate `run` is recorded as a model deviation. It is not a successful
  acceptance row, a transfer outcome or evidence of a plugin fault.
- Observation: the projected DSH error code was SERVER. Interpretation only:
  the source classifier's HTTP-5xx explanation describes backend server
  failures; no HTTP response status was observed in this evidence. Do not
  present a particular HTTP status or an HTTP 5xx capture as an observation.

These are Root's reported preparation facts, not a new run or independent
HTTP measurement here. No transfer was requested in these preparation turns.
Planned acceptance on the fixed kit is the full native U1-U6 plus idle, busy
and lane, not a conditional repeat of the earlier local subset. Historical
NOT RUN/subset records below remain history, not the new acceptance scope.

## Historical 0.5.15 records: superseded-by-0.5.16-pending

All following records, measurements, archives, source traces and outcomes
remain the kit-0.5.15 history (or their explicitly older pins). They are
preserved, not replaced with guessed 0.5.16 provenance or new PASS claims.
The frozen common artifact's hash/revision and historical rc.2 renderer
observation hashes below remain unchanged. Verified kit provenance is above;
the new plugin archive hash and kit-0.5.16 validation remain pending.

Plugin 0.1.6 pins published `@sessionbus/kit` 0.5.15. Own verification and Root's
independent published-artifact cross-check agree: gitHead
`5e60d9622df976ba95d7b55c760395402f87abc0`, tarball SHA-256
`d1500527326d0e89bd62643ab9c5b248212e6b03ca3c4ba24913889c1be16cdd`,
integrity
`sha512-dygNZ+u88Cp32ly8AhoaxTH/E9MttOeqQwXmL+fc6ot0BsfUCUfTZFdgv4uSku3xAzWS0nrwNylYbruo3Ui7Tg==`.
Published caller.js ACTIONS equals the frozen artifact's 18 entries in order.
The shipped
`sessionbus-tool.json` is `json.Marshal(mcp.Tool())` plus LF from peer-common
`db8f85d47fbc8f25faa4edeb606fbf3e8ea660d1`, frozen by the Sessionbus team:
7,694 bytes, SHA-256
`16430e214e8808ff7d9fbac30ef422f607c965903d14e7b4812a3e6b108209da`.
Its name, description, 18 actions and closed argument union are not rewritten.
The plugin owns this vendored list; it does not take model-facing facts from
kit.ACTIONS at runtime. The package control compares both at the pinned kit.

The only native schema adaptation maps JSON Schema properties/required into
DSH's parameter map and carries root additionalProperties:false onto the
returned schema. DSH GAP: dsh-tools 0.2.1-alpha.3 and 0.2.1-rc.2's parameter DSL
has no root-openness setting (rc.2 lib/index.js:798-811). It validates through
the same schema it returns (:838-863,886-887). The real-Cordis control checks
semantic equality and actual outer-key/missing-arguments refusal; its open-root
negative control shows that omitting the carry changes execution validation.

Local transfer paths are prefixed with the executing agent's absolute session
cwd, shared by peer and worker dispatch. Concatenation deliberately leaves
symlink/.. resolution to the OS. Unknown cwd refuses relative paths; absolute
paths, empty/malformed values for kit validation, other actions and the model's
original arguments are unchanged. Existing auto-allow, default kit executor,
ordinary notice delivery and lane selection are unchanged. Final host disposal
also awaits current peers' public closed promises after shutting them down;
groups-change admission does not wait and no retired-peer registry is added.

Transfers run as the OS user and are not subject to DSH permission modes.
There is no policy hook, custom executor, opt-out, new state, queue, observer,
replay, retry or result store. Dashi needs its own app release pinning 0.1.6;
adding a second direct plugin does not update the app's importer.

## Tests and native evidence

- `package.test.cjs`: frozen bytes/pack, kit enum equality; missing-field,
  missing-action and missing-root-false mutations are rejected.
- `plugin.test.cjs`: existing suite plus peer/worker path binding; relative and
  absolute paths, process cwd distinct from session cwd, unknown cwd, symlink/..
  with different real contents, malformed values and no argument mutation.
- `prove-mode-controller.mjs`: real published DSH schema compilation,
  validation and projections plus the existing controller/liveness controls.
  Only alpha.3 has TypeScript/Python renderer byte oracles. Every other tools
  version reports those projections UNVERIFIED (even if the bytes coincide),
  marks the containing check UNVERIFIED and exits nonzero after the remaining
  assertions. Raw/registered/native/SDK-array/skill goldens and schema/root
  validation are unchanged; no non-baseline renderer golden is introduced.
- The 0.1.6 prefix fixture is deliberate. The 0.1.4 fixture remains unchanged
  as historical evidence, not a claim that transfer adoption is prefix-neutral.
- All existing install, native, packed, peer-floor and universal matrix checks
  remain. The universal global baseline advances to published 0.1.5.

The documented operator runtime-resolution checker reads Cordis reflection
implementation records, which are internals, not a public API. Its first newest
DSH 0.2.2-rc.2 gate stopped because Cordis 4.1 removed implementation.fiber.
The corrected documented checker and its unshipped oracle use
implementation.ctx?.fiber, falling back to implementation.fiber on older
Cordis, and use the same owner for active-state and loader-row identity; all
exactly-one checks remain. This checker can break on future Cordis changes.
Its next strict loader-row assertion also stopped on 4.1: registry.plugin
returns an Object.create(fiber) wrapper (Cordis lib/index.js:1707-1712), while
the service context holds the underlying fiber. No further reflection patch is
made. Public native diagnosis on 0.2.2-rc.2 proved one enabled upload-provider
row in composed config, a live instance of the published FileUploads class,
unknown-receipt absence and FILE_NOT_STAGED rejection on an own real Agent.
The private runtime-resolution sub-proof is therefore NOT APPLICABLE on exact
0.2.2-rc.2. Its recorded fleet rc.2 native observations met the unchanged
exactly-one assertions; alpha.3 retains the full oracle. The documented
checker does not support Cordis 4.1 / DSH 0.2.2 yet; replacement with a public
observable is a separate follow-up, not a W-154 runtime change.
The shipped plugin does not read those records. It does depend on its OWN
ctx.fiber.uid, documented in Cordis 4.1 lib/index.js:300 (null once disposed);
that existing liveness guard remains unchanged. The prerequisite grep STOP
was resolved by the architect on that documented-API distinction.

Local real-daemon U1, U4, U5 and U6 use the existing groups-proof-plugin
`/w120-call` and native controller, not a new harness/model adapter. Actual
native input notices/envelopes, bridge calls/results, timestamps and postflight
are retained. A bridge accept is not a model decision. U1's initial notice is
shown in native input. The byte-identical reference fixture and postflight
scripts are used, with df above 10 GB before their 1 GiB source is created.
U6 requires a real refusal followed by successful list and send on the same
connection. U2 and U3 are NOT RUN LOCALLY by scope: lane rows belong to the
coordinated permanent UMKA U-series under Root. No local model, placeholder
key, credential or provider experiment is run for them. U7/hub is NOT RUN
locally. Real-model normal-install acceptance belongs to that later window.

The fixed-kit repeat on fleet 0.2.1-rc.2 used kit and released daemon 0.5.15:
native OBSERVATIONS for U1/U4/U5/U6 met their row criteria; U2/U3 NOT RUN
LOCALLY, U7 NOT RUN. Both native input envelopes
and terminal notices are retained; U6's real refusal is followed by list/send
and injected native input on the same connection. The unchanged reference
postflight reports zero temporary transfer files. One pre-row boot with an
incorrectly serialized operator groups variable failed; it is retained as a
setup slip, not row evidence. After the environment-only correction, the rows
ran once. No model route or credentials were used.

Do not infer local U outcomes from this proof map: the handoff names each
actual outcome and its retained evidence. No cap, held-I/O, supersede/reconnect
or publication-uncertainty matrix is duplicated from the kit suite.

## Deliberate prefix change

The frozen common artifact is byte-exact; DSH's native schema compiler performs
the allowed projection. JSON uses unsorted insertion order, SDKs and skill
content use literal UTF-8. Counts below use published dsh-tools alpha.3 on both
sides; they do not claim equal generated SDK bytes across DSH versions.

| Projection | 0.1.5 | 0.1.6 | Delta bytes |
| --- | ---: | ---: | ---: |
| DSH author/raw tool | 1839 | 7712 | +5873 |
| Registered tool | 1876 | 7774 | +5898 |
| Native tool array | 1796 | 7694 | +5898 |
| SDK tool array | 1867 | 7765 | +5898 |
| TypeScript SDK | 3143 | 8906 | +5763 |
| Python SDK | 3540 | 9323 | +5783 |
| Registered skill JSON | 5476 | 5572 | +96 |
| Skill content | 5080 | 5175 | +95 |

Only the skill's opening action list changes, in artifact order. No appended
transfer section or trust/authority edit is included. Tool and skill adoption
are batched into one re-prefill; these are bytes, not measured token/cost counts.

Native OBSERVATIONS from the recorded fleet dsh-tools 0.2.1-rc.2 run matched
the six renderer-independent projections to the exact 0.1.6 fixture. The
generated SDK literals are observations, not refreshed goldens: TypeScript
9,076 bytes, SHA-256
`e02cad11e886f77d7af214911a5ed7dd5a59313379146abd099e297b99d7c8e7`;
Python 9,323 bytes, SHA-256
`44334eb1f1ec509bff103b90991b43c8607aef2b174e6c1071fdfaafc48cbd3a`.
All three configured products yielded those observations. Alpha.3 retains
its original TypeScript/Python byte oracles; no fixture is updated.
The historical mode-controller log's PASS label was incorrect for non-baseline
renderers: those measured SDK bytes never constituted a renderer oracle.
The corrected script's result on rc.2 is UNVERIFIED by design, with a nonzero
exit, not a compatibility pass.

The final docs-only correction touches README, CHANGELOG and this proof map:
it names the tested prereleases precisely and adds README's current-peer
disposal limit. The final archive SHA-256 is
`810bba7d026fbe01bb1a55695685e92589c55b1cf31e442ca05aec2bdd5087c2`.
Compared entry by entry with the fixed-kit U-evidence archive, the recorded
fleet rc.2 observation archive and the alpha.3 gate archive, only README
differs. CHANGELOG and this proof
map are source-only and are not packed. All other nine packed paths, including
the runtime, manifest, frozen declaration and skill, are byte-identical; no
model-facing byte changes or acceptance-row replays result from this correction.
The subsequent fail-closed correction changes only this proof map, two
unshipped scripts and their unit control. Its packed archive is unchanged;
the historical sealed captures are retained, not rewritten.

## Stated limits

Published fixed kit pinned. The version-independent unit suite passes 242/242;
alpha.3's full native packed gate includes its real-Cordis lifecycle/schema/
prefix controls and the unchanged pending-input known-gap oracle. Native
alpha.1 below-floor refusal passes. Hosted CI at the final head remains a
separate required gate; CI and release DSH matrices are alpha.3 only.

Fleet rc.2 evidence is native OBSERVATIONS only, not these scripts passing:
the retained `final-packed-fleet.log` and
`final-kept/sessionbus-dsh-proof.WSCTE8/mode-controller.log` record reached
runtime-resolution exactly-one assertions, schema/root validation, the six
renderer-independent byte comparisons and ten real-Cordis lifecycle controls.
The same recorded packed run reached lane-option/profile-default, stock-peer,
active/idle/trace delivery, group-change, upgrade and removal checks. It skipped
the alpha.3-only pending-input driver; its historical overall PASS is not
accepted as an oracle result. The corrected packed script cannot return a
pass on rc.2: the renderer sub-proof is UNVERIFIED/nonzero, and its independent
pending-input guard also stops non-baseline versions with `alpha.3 oracle;
<version> pending-input error/cancel continuity UNVERIFIED by this script`.
Alpha.3 expectations never run on rc.2. The separate `u-fixed/RESULTS.md`,
native envelopes/history, postflight and filtered F2 coverage record the
U1/U4/U5/U6 and real-exit OBSERVATIONS; no new acceptance row is run here.
These paths are in the retained W-154 evidence directory named by the handoff.

Scope is those fleet observations, the existing alpha.3/floor oracles and
hosted CI. DSH 0.2.2 is not validated.
On 0.2.2-rc.2 the same version-independent units passed and its upload provider
was observed through public native behavior, but the packed gate stopped at the historical lane-options
baseline: the removed selectionFor/selectForNextRequest seam makes explicit
model/effort lane open refuse with spawn_failed before native create. The
subsequent standalone prefix control also stopped at the removed
registry.sdkSchemas method before reaching schema/prefix assertions. Those
findings, and the reflection checker incompatibility above, belong to W-155.
No 0.2.2 projection adapter or further gate is part of W-154. These stopped
attempts are not compatibility passes, and no golden is refreshed.

Historical kit 0.5.14 Peer.closed is NOT proof of completed filesystem
retirement. Published kit 0.5.15 resolves it after closeConnectionGeneration
(sdk/js/index.js:226). There is no peer.transfers join or retired-peer registry
in this plugin. Final disposal joins only peers still in its
map. Peers removed by a groups replacement, root disposal or publication error,
and pending groups candidates, remain unjoined. The lane worker is also
unjoined: close calls worker.shutdown without awaiting worker.closed. Waiting
there could deadlock with the native product close that is disposing this
plugin; no such wait or registry is added. F2 inside the fixed-kit A/B repeat
observed a nonempty final snapshot on ordinary real web exit 0: public V8
coverage reports final close once and its loop body twice; the unchanged trace
shows two roots admitted and no earlier agent/disposed record before close.
Only the filtered candidate offsets/source hash and trace are retained, not
bulk coverage. This observes that exit only, not every lifecycle order.
Published-source trace: shutdown
aborts the admitted identity signal before finish (kit index.js:253); its
message delivery promise is not part of closed (:277). Generation close waits
only filesystem/transfer workers, binding retirement and creating RPCs
(transfers.js:54-61,291-295), not native admission. Native receipt cancellation
and deferred-admission liveness checks remain (plugin.cjs:267-275,387-390).
Thus removing native events does not create a native-delivery/peer-close wait
cycle. This is a source conclusion, not a held-delivery experiment or an exit
time bound for stuck filesystem I/O. No new lifecycle matrix, waits or state
are added. A local abort
observation proves its own cleanup only, not every exit race. U rows on 0.5.14
must remain labelled with that pin, not described as fixed-kit exit proof.

Default JS publication has the kit's documented parent-path replacement race,
no fsync/durability or immutable snapshot promise, and unknown publication must
not be replayed. Transfers need negotiated support on each endpoint/hop.
Daemons 0.5.12/0.5.13 give no transfer grant; kit answers unsupported_transfer
locally. Source reasoning is not a new mixed-fleet runtime acceptance.
Interactive notices retain DSH's existing error/cancel wake limits; admission
does not prove reading or an answer. U7 and real-model UMKA work are not proven
by a local bridge call, source inspection or CI.
