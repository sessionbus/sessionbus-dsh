# W-154: full Sessionbus file transfer

## Accepted change and provenance

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
0.2.2-rc.2; it remains a full oracle on fleet rc.2 and alpha.3. The documented
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
U1/U4/U5/U6 PASS, U2/U3 NOT RUN LOCALLY, U7 NOT RUN. Both native input envelopes
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

On fleet dsh-tools 0.2.1-rc.2 the six renderer-independent projections match
the exact 0.1.6 fixture. The generated SDK literals are observations, not
refreshed goldens: TypeScript 9,076 bytes, SHA-256
`e02cad11e886f77d7af214911a5ed7dd5a59313379146abd099e297b99d7c8e7`;
Python 9,323 bytes, SHA-256
`44334eb1f1ec509bff103b90991b43c8607aef2b174e6c1071fdfaafc48cbd3a`.
All three configured products yielded those observations. Alpha.3 retains
its original TypeScript/Python byte oracles; no fixture is updated.

## Stated limits

Published fixed kit pinned. The version-independent unit suite passes 242/242;
both fleet rc.2 and alpha.3 full native packed gates pass, including their
real-Cordis lifecycle/schema/prefix controls. Native alpha.1 below-floor refusal
passes. Hosted CI at the final head remains a separate required gate. Scope is
fleet DSH 0.2.1-rc.2 (units, packed gate and repeated U1/U4/U5/U6 with F2),
the existing alpha.3/floor rows, and hosted CI. DSH 0.2.2 is not validated.
The same version-independent units passed and its upload provider was observed through public
native behavior, but the packed gate stopped at the historical lane-options
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
