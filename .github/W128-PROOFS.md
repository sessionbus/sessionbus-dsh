# W-128: native lane errors and release archive identity

## Consequence analysis (reviewed before implementation)

Base: main `826a29427d93150e995dec33f71685f913ebbe0f`, released 0.1.0.
Candidate: 0.1.1. No dependency, peer, installer, launcher, provider-entry,
storage layout, command, reconnect, delivery, permissions or lane-policy change.
Existing Node code is the required integration with DSH's published service
objects; this change adds no runtime, process or installed dependency.

The bound-turn defect is `NativeSession.event`: the matching user message binds
the turn, but only the *unbound* error branch copied its native diagnostic.
Both associations now return the same two native fields. Partial durable
assistant text precedes a clearly separated diagnostic. Outcome remains failed,
native stop reason remains error, and the kit still retains a **done** result
for the owner to collect and acknowledge, not an unavailable RPC exception.
No retry or replay. A terminal is immutable; stale/duplicate events cannot
rewrite it. The next run starts with its own record; receipts, idle wake,
active steering, cancellation, capacity and shutdown are otherwise unchanged.

Privacy boundary: exactly native code/message, never stack, cause, details,
headers, request IDs, credentials or environment. Message NUL/newlines become
spaces; at most 1024 UTF-8 bytes including ` [truncated]`. This is not a
sanitizer and does not promise to remove provider-supplied sensitive text.

Fresh Open checks argument shape, permission preset, exact model route and
effort before create. Explicit model uses the public LLM resolver; effort alone
reads public `agentDefaultModel.currentSelection()`, the same read used by a
fresh controller selection. The existing serializer reads the actual session
selection and validates again immediately before selection commit: two moments,
not a retry or cached precedence. No-option opens require neither optional LLM
nor the private selector. Resume still resolves its controller-owned session
and uses its current selection. Signals are checked before/after prevalidation
and before committing; no timer, undo, archive, native-file deletion or new
workspace dependency. A changed default/capability, cancellation, native setup
or storage failure in the remaining window can still leave native residue.
The shipped README names that limit and DSH's invisible no-log directory.

Worker exit changes were withdrawn: v0.5.12 stops a refused worker by SIGTERM
before replying once with spawn_failed and the collected shutdown status.
DSH requests 0 for SIGTERM; racing a plugin request for 1 would be nondeterministic.
The worker Open wrapper/closed chain are unchanged. Refusal code/reason, not
exit_code, explains the refusal; the native fixture asserts exactly one reply.

D-052: validate an annotated plain-version tag and exactly one checksum/archive
line, pack, then actual `sha256sum -c` before npm registry/publish or gh release
operations. The exact verified archive is published with provenance to latest.
Only npm's JSON E404 means not-found; malformed/auth/network responses fail.
An existing version must have identical archive SHA512 integrity. No dist-tag
move, overwrite, fallback or retry. GitHub release creation is **after** npm
publish or equal-integrity verification. A provenance/signing failure before
the npm PUT leaves neither an npm version nor a GitHub release (the ops-created
git tag exists already); an uncertain transport failure may leave npm published,
but no GitHub release. A later gh failure leaves the verified npm version and
no successful new GitHub release. Never repair uncertainty by moving tags.

## Failing-first controls and native evidence

Before editing plugin.cjs, this actual command ran against the base source:

```sh
node --test --test-name-pattern='session-independent|two native fields|bounded in UTF-8|fresh effort checks|permissive resolver|open signal' plugin.test.cjs
```

All six tests failed, 0 pass / 6 fail / 0 skipped / 0 todo:

| Control | Observed base defect |
| --- | --- |
| permissive backend error | failed/error result was empty, not native code/message |
| cancellation in resolver | create had already been called |
| session-independent refusals | create/rename had already been called |
| fresh effort two moments | only post-create current route was validated |
| bound partial + duplicate terminal | returned completed + `partial answerlate` |
| UTF-8 bound, early and bound | message exceeded 1024 bytes |

The resume-only test also passes on base: it pins unchanged behavior, not a
failing-first claim. Existing ordered-open regression gains only the required
pre-create resolver call; no assertion is deleted.

The full maintained options proof keeps the original ten W-126 cases, adds
fully specified invalid effort, bound provider failure, and settled partial
assistant text followed by a failing next request. Native terminal code/message,
the exact root's durable user-message association, request header and result
are asserted. Invalid fresh effort cases compare the entire session-root path
inventory before/after shutdown, not an invented no-residue flag. Profile bytes
are checked after Open, turn and shutdown. The ten original cases are not skipped.

The own-upload assertion observes the sole active implementation's fiber, row,
native package metadata and loaded callback first, then calls public
`sessionController.prompt(request, new AbortController().signal)` and requires
session/attachment-invalid, FILE_NOT_STAGED, exact native text and no model work.
The **real web stock provider** is the negative: it returns that same receipt
error, but the complete own-provider assertion fails at identity observation.
Thus the unknown-receipt error alone cannot produce a false own-provider PASS.

Retained local harness history (not product failures): two early observer runs
accessed Cordis services after await through an inactive context. Services are
now captured before await and callback identity is read synchronously. A first
partial-stream replay was not a durable assistant/message: native DSH records
assistant/attempt on a non-abort stream exception. The final control instead
settles text plus a read-only sessionbus list tool call, then fails the next
request in that same native turn. No raw stream text is claimed as a message.

## Gates and coverage

- Local unit suite initially 163/163, then 165/165 with the missing-default and
  commit-window controls; no skipped/todo/only tests. Existing suite
  plus release script tests runs normally through npm test.
- Local prepared Linux operations regression and fresh project proof passed;
  all 13 native option/error cases passed. Final pushed-head gates remain required.
- Local npm-global proof passed in 79 seconds: both published0.1.0 upgrades,
  owner preservation, own-upload/stock negative, lane/web native turns and cookie
  idle delivery, all 13 cases and uninstall. Evidence is an owned scratch fixture,
  not a modification of the owner's global installation.
- Every maintained global npm/pnpm10/11/12 row, on Linux and macOS, now installs
  published 0.1.0 by README commands, adds synthetic owner rows, upgrades in place
  by those commands, and requires owner bytes unchanged. The regular subsequent
  native lane/web/option/error/uninstall proof tests the upgraded candidate.
  Project/npx/mixed rows retain fresh-install coverage. Cold acquisition is
  bounded by the existing 25-minute job, native observations keep their bounds.
- Global pnpm rows record actual manager version and the public virtual-store
  setting; pnpm11 records default failure and literal README remedy as before.
- Source hash is the first capture in changed proof entry points; command argv,
  stdout/stderr/exit and lane fixture raw sent/received frames are recorded at
  call time. Native process-group ownership/empty-group checks are unchanged.
- Release tests call the validator script against a real annotated/lightweight
  tag repository and actual sha256sum with changed bytes. Registry result tests
  exercise equal/mismatch/not-found/auth/transport/malformed outcomes. No workflow
  body is executed against fake gh/npm commands.
- The no-mock metadata test shadows ancestors with a real unexported manifest
  and malformed manifest, so TMPDIR cannot make it resolve an ancestor's DSH.
- The pre.20 negative control now asserts the saved provider/model/effort, not
  merely changed bytes. W126-PROOFS corrects 'moved' to 'added' replay acquisition
  and states the packages are present at the upgrade moment.

## Provenance and limits

Published baseline archive SHA256:
`1fb8e005ceccaa08d3447f5c2c1c0feb541769d0be8229761397d8610814be55`.
Initial candidate archive SHA256:
`03cfcb8b9fcaa4ee273da97c24d46648d48a970d6a09273f59e8b0924bacf034`.
Packed changes against 0.1.0: package.json (version/test command), README.md and
plugin.cjs only. Still nine packed files; install.mjs, bin.mjs, launcher.mjs,
file-uploads-none.mjs, docs/LANE-WITHOUT-TUI.md and skills/sessionbus.md unchanged.
Final head, pack hashes and hosted wall-time cost are added at handoff.

Prepared archive support is documented by [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
and [trusted publishers](https://docs.npmjs.com/trusted-publishers/#automatic-provenance-generation).
Measured npm11.12.1 `npm publish <tarball> --dry-run --provenance --access public
--tag latest --ignore-scripts --json` accepted an unpublished-version-format
control, reported nine files and exact SHA512, and did not change archive bytes.
That control had only the old shipped files with a scratch manifest version;
it was **not the candidate**. Dry-run neither signs an OIDC attestation nor sends
the publish PUT; the first real attestation is the ops-controlled 0.1.1 release.
The published0.1.0 dry-run refusal is retained too, not erased.

The one-off mac procedure is dropped, not claimed as maintained upgrade proof.
Historical branch proof/host-global-010 commit
`77024245cb0363d8bafaf1b38f464db4d7be607e`, script SHA256
`0efcc5530239d66e0cfb0dc6acf092096303b5b4434eecffd03d1af070f357ca`.
Delete that branch only after this change lands; the commit/hash remain here.
No code is copied from it into a new product mechanism.

Unchanged non-public exception: sessionController.agents.selectionFor,
selectForNextRequest and serializeImageAdmission, alpha.2 published types
lib/types/index.d.ts:49 and lib/types/agent.d.ts:101,107,129. Missing methods
fail only option-bearing opens with a path-free best-effort version diagnostic.
Upstream requests remain: public validated session-only selection with explicit
routing policy and creation-time options on SessionCreateRequest; add a safe
public native error surface (this plugin cannot sanitize arbitrary provider text).

DSH public default read: dsh-agent-default-model lib/index.js:34-44 and
lib/types/index.d.ts:38-42; controller fresh fallback lib/index.js:283-300.
Daemon v0.5.12 bus/internal/daemon/lane.go:63-71,201-236 and launch.go:108-120
explain one refusal response and shutdown exit status; DSH profile-boot
lib/profile-boot-BZ2ZjNWi.js:46-68,249-250 explains first-code-wins.
Workspace archive is not deletion; native no-log directories are skipped by
dsh-session-persistence-jsonl lib/index.js:3005-3010,3335-3356. No cleanup claim.

The hosted protocol fixtures are not a released daemon discovering a product on
a global host. Real D-049 host proofs and the post-publish registry checks remain
separate gates under the writer slot, not substituted by this matrix. No host
profile, protected sealed packet, owner process or daemon configuration changed
during this implementation. The home-project launcher upgrade is a separate
review/slot and is not part of W-128.
