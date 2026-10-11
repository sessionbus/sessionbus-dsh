# W-126: lane options are session facts; stable 0.1.0

Consequence analysis was independently approved before implementation. Keep
controller-owned creation, preset setup, subagent-owner refusal and deduplicated
resume. Only option-bearing opens change; no new selection store, queue, lock,
retry, dependency or profile writer. A partial created/renamed session on a
later failure remains possible as before. Permissions retain their ordering.

## Native boundary and upstream request

Published DSH 0.2.1-alpha.2 dsh-api-session-controller `lib/index.js:722-740`
selects a session then asynchronously saves the deployment default at 738.
`dsh-agent-default-model lib/index.js:53-65` saves a complete selection through
`dsh-config-editor lib/index.js:24-25,123` into the profile patch. An immediate
checksum alone cannot rule out that asynchronous write.

The expressly approved exception is `sessionController.agents` (declared private
in `lib/types/index.d.ts:49`), and only its documented `selectionFor`,
`selectForNextRequest`, `serializeImageAdmission` methods
(`lib/types/agent.d.ts:101,107,129`). Native implementation: current-selection
precedence at `lib/index.js:283-303`, event/cache commit at 321-323, serializer at
350-353. Missing methods fail that option-bearing open with their names and the
resolved controller package version. There is never a `selectModel` fallback.
No-option opens do not touch this holder or the optional LLM service.

Before: an unadvertised model was refused at open through the GUI policy; now a
valid unadvertised exact route is accepted and a wrong route fails natively.
An unknown provider or adapter-rejected model fails at open. A mistyped model
id accepted by a permissive adapter is not refused there: it fails at the first
request if the backend rejects it. The replay adapter itself accepts arbitrary
ids, so its unadvertised-model control is not a backend rejection proof.
Empty/non-string model or effort is an explicit unsupported-value error; an
empty model previously silently selected the current model.
The public `llm.resolveCallConfig` owns adapter validation and effort rejection;
catalog membership is advisory (`dsh-llm lib/types/index.d.ts:345-361`). Adapter
default effort is not an explicit selection; native request preparation records
its origin (`dsh-llm lib/index.js:2195-2218`). Model-only carries no prior effort;
effort-only reads the session's current route inside native serialization.
Open cancellation reaches the resolver and is checked before commit, never
undoes a committed selection or authorizes replay.

Upstream request (for the architect's queue): expose a public, validated
select-for-this-session entry point which does not save the profile default,
with routing policy explicit; add creation-time selection options to the public
SessionCreateRequest. The current request has only identity/location/preset
(`lib/types/types.d.ts:284-289`); core AgentRegistry creation/resume options exist
but replacing the controller with them changes lifecycle/preset ownership and
requires reconstructing current-selection precedence. No such rewrite is made.

## Controls and hosted legs

`plugin.test.cjs` mocks the actual resolver/selection signatures. Eight added
option cases cover forbidden profile-saving API calls, independent later lane,
model-only versus adapter defaults, invalid effort followed by a valid open,
no-option optional-capability absence, each removed selector method (diagnostic
version), missing LLM service, cancellation, and serializer ordering. Two
existing open/resume assertions now inspect the session-only path, including a
resumed route different from immutable launch options. The no-option control
passes on the base; it pins preserved behavior, not a failing-first defect.
The selected ten-test before control rejects nine on the base implementation.
Existing messaging, groups, installer and lifecycle coverage remains.

`prove-lane-options.mjs` boots the ordinarily installed packed plugin against an
owned fake daemon and published DSH, with recorded model streams. Its default
row is physically in the scratch profile patch; it is NOT a command-line
override which would cause the old config editor to refuse rather than write.
Each successful case asserts exact patch bytes after open, after a recorded
request and after native shutdown, native selection/request header/adapter
default metadata, completed result text, identity on resume and exit 0. Cases:
model+effort, second no-option lane/default isolation, model-only, effort-only,
durable resume seed, resumed effort, resumed no-options, valid unadvertised
route, invalid effort, later valid lane. Invalid open checks native spawn_failed
with the precise native stderr-tail reason and no selection commit; it does not
make a model request. The kit keeps a rejected-open connection alive, so the
harness stops its own runtime normally, not by expecting a fatal product exit.

The native observation fixture requires all three real selector methods; a DSH
release which removes/renames one makes the leg red. Unit absence cases also
prove no-option opens still work. Snapshots are atomic, JSONL is native, and
every owned process group is checked empty before cleanup. Observation bounds
are 30 s; normal native stop is the shared 5 s grace plus 5 s scheduling margin.
The helper's interrupt cleanup covers this proof too. No mutation is replayed.

This proof runs in every Linux/macOS universal installation cell and the
Linux-only prepared operations regression. Native package acquisition/layout,
ordinary install/uninstall, lane delivery, web delivery, groups and floor proofs
stay in their existing owners. Hosted wall time is reported at handoff. The
real installed-host proof remains a separately authorized D-049 step after
merge; no owner's profile, process, settings or records are touched here.

## Failing-first native record

Base W-125 package from merged main 867764346aea7e6945bcca924ba3a62a0323a08b:
archived pre.21 tarball SHA256
`2adb5accbd267d583743f46fa33a2794f1e74c15942c39675022a3f50f81c962`;
plugin.cjs is the same `8be7183184cf18f803eac29bb55e7d6170c5b87f4c48bacd938d4e409b4b4f95`
as published pre.20. This is source evidence, not a published pre.21 release.
Ordinary add/exec, physical default `w126/default/low`, then the real managed
open `model=w126/selected, reasoning_effort=high` makes the profile mutation
assertion fail: `model-effort: profile bytes after open`, 1363 bytes -> 1375
bytes, default row changed to selected/high. The native control uses the same
new proof body against that old packed source. Retained scratch history also
includes the rejected malformed run ID, a fake request-ID collision and the
wrong expectation that rejected open exits the worker; none counts as PASS.
The prepared fixture deliberately repairs its lane product to dashi (W-077);
its options proof asserts that identity, while universal cells assert
sessionbus-dsh. The initial wrong-product expectation remains in scratch
history and is not a product finding.

## Release and preservation

0.1.0 is a plain release to latest; no new prerelease or dist-tag. The actual
release.yml metadata, GitHub argument construction and npm publish command are
executed against local fake commands in the package test: latest, false, no
--prerelease, --tag latest. The workflow itself is unchanged; nothing published.
Pre.20 remains the prepared regression's exact published baseline. The dashi
case derives its copy expectation: stable candidate beside app-pinned pre.20 is
coexistence, not proof of the candidate running inside dashi.

Pack deltas versus pre.20: package.json, README, plugin.cjs, W-125 install.mjs,
and the added standalone own upload-provider entry. Relative to merged W-125,
only package.json/README/plugin.cjs change in the packed files. Launcher, bin,
lane doc and skill remain byte-identical. The handoff supplies exact pack and
plugin hashes and the complete extracted-file comparison. No merge/tag/publish
is performed by the builder. Post-publish real-host literal registry checks
remain mandatory; a failure requires patch release 0.1.1, never a tag move.

Initial reviewed head 247575c local candidate pack SHA256:
`86e68ac3c58b3ac803f665c1572256d875e0aa84a509c171cfe42ec6657d17b1`;
plugin.cjs SHA256:
`cda4aea990c70e3e9d17257df4d6a9a43dac224a2fda5b6d772b45fd44dad3f5`.
Nine packed files, 25,708 bytes compressed. Local suite: 149/149. Local clean
project installation: PASS (80 s total, options proof 12,362 ms); prepared
operations regression including published-dashi coexistence and all ten option
cases: PASS. Hosted exact-head results and timing still belong to the handoff,
not this preliminary local evidence.

## Independent-review correction

F1: build missing method names before the optional version lookup; a failed
lookup says `unknown version` without forwarding paths. The added control
loads an isolated copy through the real Node loader, first with absent metadata
and then malformed JSON (no Module._load mock). No-option mount/open also works
when the context lacks get. The resolved-version control remains separately.

F2: added unit cases forward unknown-provider failure unchanged, accept an
unknown id from a permissive resolver and replay a native first-turn backend
error, and refuse malformed routes. Empty/non-string model/effort checks happen
before capability lookup/commit. The backend-error unit is a replayed terminal,
not a claim of contacting a real provider. Bound-turn terminal rendering is
unchanged. Selection still commits before permission_mode validation, and a
failed option-bearing open still leaves the created/renamed session behind.

F3: the prepared leg now runs the SAME options proof against the actually
installed published pre.20 baseline and requires its specific patch-mutation
assertion failure (exit 1, different bytes). A separate owned copy prevents its
intentional native rewrite from corrupting the ordinary upgrade baseline;
original baseline bytes are also asserted unchanged. Replay acquisition is
moved earlier, not made a new product prerequisite. Local measured control
cost including the copy: 1,482 ms. The control does not await a private save
promise: its required real old write in the same observation window is the
non-vacuity check. Per-case start/PASS lines stream in universal logs, including
before failure. Shared owned-group shutdown/interrupt handling remains.

Corrected local suite: 155/155; prepared regression and clean project: PASS.
Corrected pack SHA256:
`1fb8e005ceccaa08d3447f5c2c1c0feb541769d0be8229761397d8610814be55`;
plugin.cjs SHA256:
`f6e7d925d26262fb00d8f327de0e9bb4474ce4dccf4b80ed4eb0330431dad05d`.
Fresh hosted matrix/full bot read at this corrected head are still required.
