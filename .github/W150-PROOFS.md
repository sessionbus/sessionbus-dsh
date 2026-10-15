# W-150: peers do not depend on the lane controller

## Consequences approved before implementation

Published 0.1.4 requires `sessionController` in its static inject list even in
peer mode (`plugin.cjs:38-43`). Stock alpha.3 acp, headless and sdk compositions
do not mount that service. Their dumps succeed, but adding the peer row would
leave its fiber pending. Dashi, sessionbus and web do mount the service. A stock
web dump (`--dump-default-config`) confirms it without the owner's patch;
published dsh-web-app alpha.3 `cordis.patch.yml:120-122` supplies the row.

The controller is removed from common requirements and common context capture.
Peer activation must never read it. Publication, agent identity, active and idle
steering, admission receipts, tools and permissions, native groups storage,
reconnect and shutdown remain owned by their current components. No message is
discarded or replayed; the known error/cancel pending-wake limits remain.

Lane activation uses a controller-required Cordis child scope. A parent host-
readiness check requires an active controller and otherwise uses the existing
fatal diagnostic and exit 1, once, without starting the worker. The pending
scope is disposed before requesting exit so a late provider cannot revive it.
The public APIs are Cordis `lib/index.js:755-770` (`get`, active implementations
without a static inject requirement), `:1022-1023` (fiber disposal) and
`:1593-1605` (dependency scope). Native readiness commits once, invokes already-
ready listeners immediately, and unregisters listeners on removal (published
DSH alpha.3 `profile-boot-C14i-8IN.js:87-107`). No timer or retry is added.

Keeping the lane's child dependency is necessary: removing the global inject
alone would lose native cleanup on controller disposal or replacement. Cordis
owns that lifecycle; there is no availability mirror, watcher or scheduling
state in the plugin. Disposal during imports/readiness must suppress late work.
An active service before readiness is accepted; one arriving only after the
fatal readiness decision cannot recover that process. Existing lane open,
resume, model/permission selection, refused Open, exit status and result
association stay unchanged. A missing required lane capability is a fatal
launch failure, not an unavailable model or a permission refusal.

Published 0.1.4 and the candidate both request exit 0 from `worker.closed` when
native dependency loss shuts down a worker. This exit policy is preserved, not
converted into transparent recovery. A test host that records but ignores exit
can observe the replacement scope; that does not establish survival of the real
worker process after a controller is removed.

An additional real-Cordis held-import probe reproduced a pre-existing race in
published 0.1.4 as well as the initial candidate: dependency replacement starts
a new activation while the old import is pending, and resolving the old import
starts a second worker. The fiber UID survives temporary dependency unload
(Cordis `lib/index.js:1372-1388`); only permanent disposal clears it
(`:1075-1084`). Keep that UID check and add one activation-local liveness boolean
cleared by the native `ctx.effect` cleanup. It is cancellation of one activation,
not a controller-availability mirror, retry counter, watcher or timer. Stale
import success cannot start a runtime; stale rejection cannot diagnose or exit
the replacement host. Once created, the runtime retains its UID-only predicate;
otherwise the activation guard would suppress the existing worker-close exit
on temporary dependency loss. Both lane-controller and peer common-service replacement
are pinned for import resolution and rejection. Existing active-runtime teardown
and lane exit policy remain unchanged. The architect approved this named race
correction before implementation.

The ordinary installer still owns its peer and bundled no-upload rows, not a
new controller row. It must equip stock acp/headless/sdk by the README add/exec
commands, leave default-model rows and owner bytes unchanged, and continue to
refuse unmarked conflicting rows and bundles that already supply the plugin.
No new runtime dependency, installed module, daemon, credential access or
process is introduced by the product. The language/runtime remains the existing
published Node plugin and DSH/kit graph; there is no language migration.

## Verification plan and evidence status

Failing-first controls cover the exported apply path without a controller,
including a throwing getter; a peer must mount and deliver normally. Lane
controls cover missing and throwing service at readiness, arrival before ready,
arrival after fatal exit, disposal before ready/import completion, and native
dependency loss/replacement. Real Cordis coverage is required; mock order alone
does not prove native dependency cleanup. Existing lane and messaging controls
are retained. Stock profile install/composition and a native peer round trip
are required in the packed proof. Normal-install host acceptance is separate;
no owner profile is modified as implementation evidence.

The selected CI/native selectors move to alpha.3 without raising the alpha.2
support floor or rewriting historical alpha.1 refusal fixtures. The carried
socket control gains an ERROR-level assertion; visibility docs distinguish the
connection-only no-argument status from the service stderr surface.

Run `npm test` (the CI entry point), then
`.github/scripts/prove-packed-install.sh 0.2.1-alpha.3`,
`.github/scripts/prove-peer-floor.sh`, and each of the seven modes of
`.github/scripts/prove-universal-install.sh`. The packed gate invokes
`prove-mode-controller.mjs` against published Cordis and the installed candidate
(synthetic worker/peer facades), then `prove-stock-peers.mjs` against ordinary
stock profiles. The latter uses a synthetic bus and published replay adapter:
it proves native headless publication, the outbound list tool, inbound injection,
the answer containing that input, and detach on exit, not a live model backend.
Stock acp/headless/sdk each get ordinary add/exec, controller-free composition,
byte-preserving owner rows and a no-op second exec. Owner profiles are not used.

The held-import controls failed first on the duplicate-worker assertion. The
initial guard also correctly failed the preserved exit-0 assertion; the runtime
keeps its original UID-only predicate while pending activation uses the stronger
guard. All nine real-Cordis controls then passed. Native lane lifecycle and
peer message/receipt controls, including the known pending-wake cases, remain
in the packed gate rather than being replaced by these synthetic controls.

The first stock-peer fixture generator used the wrong field path for a recorded
text chunk. Its retained failed run is not candidate evidence. The architect-
approved correction changes only that unshipped path to `chunk.chunk.block`;
a fresh packed run is required. An accidental local `pnpm test` invocation also
failed in the existing fixtures' npm-executable-relative semver resolution;
`npm test` is the defined CI command. That invocation limitation is not hidden
by changing a product predicate or adding a dependency.

Before the prefix pin below, corrected-source local results were 236/236 unit tests, 9/9 real-Cordis lifecycle
controls, packed alpha.3 (including 13/13 pending-input cases), native alpha.1
floor refusal, and all seven Linux universal rows passed. Removing the activation
cleanup fails on a duplicate worker; extending that guard into runtime exit
handling fails on the preserved exit-0 assertion. The six earlier dependency/
readiness mutations were also caught. Hosted macOS matrix evidence and the bot's
exact-head read are separate merge gates, not claimed by these local runs.

The npm 11.12.1 archive SHA-256 is
`7a0475d95cb3db2198995c37a81aea54a6e95f2f4aa9bb4f6e923f9cf692f396`:
29,124 compressed bytes, 94,268 unpacked bytes, nine paths. Compared with
published 0.1.4, only README, the package version line and `plugin.cjs` change;
the other six paths are byte-identical, including the installer and launcher.
Dependency/peer declarations and the lock are unchanged. The corrected packed
pending-input packet's manifest SHA-256 is
`98c66f3b2699543a2e4046afef972cc7c1c35bf9686beccdcdb81054372133a0`.

## Model-prefix byte contract with published 0.1.4

The owner requires that upgrading an already-equipped profile not invalidate
its model prefix. Exact commit 9748263 was compared with published 0.1.4 using
an in-memory registration fixture and the same published alpha.3 `defineTool`
and `ToolRuntime` for both sources. The baseline source was checked against the
published archive above. The registered compiled definition, native wire schema,
SDK schema, generated TypeScript/Python SDKs, full skill record and literal
5,080-byte skill text were byte-identical; the captured-record diff is empty.
This is a registration/projection comparison, not another native model run.

The unshipped `model-prefix-0.1.4.json` golden records lengths and SHA-256s without
sorting keys. The unit test pins raw registration/skill bytes for web/custom,
dashi and lane identities, before and after readiness and peer group/title
changes. The packed real-Cordis check pins the actual compiled tool and native/
SDK projections, including generated SDK text, for all three product identities.
No product text or schema is changed to obtain equality. No dependency is added;
the native check uses the DSH packages already required by that gate. A changed
byte or key/enum order must fail and require an explicit compatibility review,
not a silent snapshot refresh. Output callbacks are not model input and are
excluded by JSON serialization; their output schema is included because PTC SDKs
use it. Published alpha.3 `dsh-system-prompt/lib/index.js:87-107,395` sorts the
final model-facing tools by name (or explicit `toolOrder`), so the earlier
registry Map order is not the final request order. The architect's independent
ordinary-web measurement also found all 33 definitions and their order stable
across two cold restarts. Our golden pins our contribution, not unrelated DSH
or model-server request bytes.

After adding this unshipped pin, the full local gates passed again: 237/237
unit tests, 10/10 compiler/Cordis controls, packed alpha.3, below-floor refusal
and all seven Linux universal rows. Five source mutations (tool name,
description, enum order, object-key order and skill text) and one native-wire-
only whitespace mutation fail at the prefix assertion; an unchanged copied
fixture passes. The runtime and packed bytes are unchanged from 9748263. The
fresh pending-input packet's manifest SHA-256 is
`01d01532e7af575b4714505f1bc7352516ba10255aab4e9b9612a3a6d1a2b286`.

## Earlier carried points, not changes in this item

- W-144 driver: show the first inner cause on an early child exit; assert the
  socket is absent before startup; name the over-limit socket path; plainly
  identify input loss; avoid a second artifact error after an earlier failure;
  remove the rejected-step note's private hashes; fix the pin-update/run order.
- W-134 host-proof tests: make the throwing slice nonfinal, add an RPC-refused
  slice, and exercise a final remainder below 5000 ms. No runner change is made.
- Some older tests leave `mkdtemp` directories without finalizers. This item
  does not delete uncertain old roots or claim that leak is fixed; new stock
  transport scratch is explicitly removed, and local dependency/store cleanup
  is recorded with retained evidence.
