# W-154: full Sessionbus file transfer

## Accepted change and provenance

Plugin 0.1.6 pins published `@sessionbus/kit` 0.5.14. The shipped
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

## Stated limits

Draft status: awaiting the published fixed kit pin. Final re-gates must cover
fleet DSH 0.2.1-rc.2 (units, packed gate and repeated U1/U4/U5/U6) and newest
DSH 0.2.2-rc.2 (units, packed gate, root-false control and prefix measurement),
retaining the existing alpha.3/floor rows. A changed defineTool seam or native
projection is a stop, not authority to refresh the golden silently.

On kit 0.5.14 Peer.shutdown triggers generation abort, but Peer.closed is NOT
proof of completed filesystem retirement. Core PR123 changes that public
promise; the final pin must be the published fixed kit and be re-gated before
this PR is final. There is no peer.transfers join or retired-peer registry in
this plugin. With the fixed kit, final disposal joins only peers still in its
map. Peers removed by a groups replacement, root disposal or publication error,
and pending groups candidates, remain unjoined. The lane worker is also
unjoined: close calls worker.shutdown without awaiting worker.closed. Waiting
there could deadlock with the native product close that is disposing this
plugin; no such wait or registry is added. Whether normal DSH exit leaves any
current peer for the final snapshot remains unverified until observed inside
the already-scoped fixed-kit acceptance runs. That re-gate must also trace the
public closed promise against existing native delivery cancellation and event
removal; no new lifecycle matrix, waits or state are added. A local abort
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
