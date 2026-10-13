# W-134: refused-Open stderr and one maintained profile proof

## Consequence analysis (reviewed before implementation)

Base: released 0.1.1, main `64d445fc68c24f9ca4223c85852820f9542c5637`.
Candidate: 0.1.2. No dependency, peer, installer, launcher, provider entry,
permission, selection, turn result, delivery, reconnect or exit-status change.
The only runtime change is one transient fact in the lane worker's lifecycle.
Node remains necessary for the existing DSH service callbacks; this adds no
installed runtime or dependency. The unshipped proof uses Node's filesystem,
subprocess and YAML interfaces already needed by the existing native proofs,
and the agent's existing Sessionbus tool, not another SDK client or daemon.

The kit constructs `sessionbus connection closed` on connection closure
(`@sessionbus/kit` 0.5.12, `sdk/js/connection.js:51-53`). Its worker service
rejects a failed Open through the structured refusal, then propagates the
connection cause from its serving promise (`sdk/js/index.js:51-61,95-96`).
Our `workerExit` printed that cause through `warn`, even when our own Open
callback had already refused. The released daemon then prepends captured
worker stderr to the structured reason
([v0.5.12 launch.go:101-114](https://github.com/sessionbus/sessionbus/blob/v0.5.12/bus/internal/daemon/launch.go#L101-L114)).
Thus the kit owns the error text, but this plugin owns the redundant print.
0.1.0 (`826a294`) and 0.1.1 have the same generic warning branch: source
equivalence, not a new runtime measurement of 0.1.0's three refusal tails.

The Open wrapper records refusal only when its callback rejects and its
cancel signal is not aborted. It rethrows the original error untouched.
The unopened-close branch suppresses only its own warning after that fact;
it still requests the same shutdown status. An unopened close with no refused
Open, including a pending option Open aborted by transport, still warns.
An accepted Open, describe-only behavior, peer publication and later delivery
retain their old lifecycle. No string filter, log reorder, retry, second
state, kit change or daemon dependency is added. Capacity, admission receipts,
active steering, idle wake, native identity, permissions and terminal result
ownership are unaffected: the change neither consumes input nor changes any
connection. Trace output remains explicit opt-in output.

Race limit: if refusal and cancellation occur in the same tick, the observed
`signal.aborted` decides whether the warning prints. Both facts are true at
that instant and only this one log line depends on their ordering. With daemon
v0.5.12, the caller still receives captured stderr followed by the reason;
with tracing off the usual refused-Open tail becomes the reason alone unless
Node, DSH, another loaded plugin or the kit also writes there. Structured-reason-first ordering is the daemon
owner's separate item, not patched here.

Kit limit: when the refusal frame itself cannot be written (a reason over the
1 MiB frame limit, or the wire closing before that write), the reason is lost
in both versions and the caller gets the daemon's own text. Once our refusal
was recorded, 0.1.2 prints nothing where 0.1.1 printed the generic close line.
No attempt to reconstruct the lost reason or to change kit framing is added.

## Failing-first and continuity

Before changing the warning branch, the new refusal control on base printed
the extra line and failed. The final exact control bodies were also rerun on
the detached base source:

```sh
node --test --test-name-pattern='refused Open suppresses|unopened close without|pending option Open aborted' plugin.test.cjs
```

Base: **2 pass / 1 fail**, the refusal test fails because stderr is
`sessionbus: sessionbus connection closed`. Candidate: **3 pass / 0 fail**.
The latter two passing base controls pin unchanged warning/exit behavior.
The transport-abort control also fails against the draft unconditional
refusal flag: it hides the transport warning. The corrected cancel-aware flag
passes. The first attempt at that control omitted the kit request's outer
`open` field and failed for an unrelated missing agent; that attempt is retained
in local harness history and is not counted as evidence.

Evidence is local in `/tmp/sessionbus-w134-evidence.mFpWxT`: base-final and
boundary-final stdout/stderr, cancel-real-before stdout/stderr, the complete
unit output and native prepared/project proof logs. Private host packets are
not added to git. Hosted CI runs the real prepared regression, alpha.1 floor
refusal and fourteen Linux/macOS universal install rows, including published
0.1.1 in-place upgrades in the eight global rows. A plain `publishedVersion`
constant names the newest published baseline and moves with each release.
The three real-host refusal tails will
be observed only under the next separately granted host-proof brief.

## Maintained runner: explicit choices, not phases

`.github/scripts/prove-host.cjs` replaces one-off profile scripts. It exports
`runProof(parameters, tools)` for the existing agent's native tools. Its static
Node entry performs local observations; it is not a second bus client. One
runner file, one replay test (`host-proof.test.cjs`) and one reduced public
fixture (`.github/fixtures/host-proof.json`); the existing owned-process-group
helper is copied and hashed into each packet. No owner home-project operation.

Every invocation supplies both independent choices:

| Operation | Acceptance | Meaning |
| --- | --- | --- |
| `archive` or `registry` | `true` | package action, then one fresh lane |
| `none` | `false` | current-state closure; verify sealed references by hash, repeat nothing |
| `none` | `true` | current-state verification, then one fresh lane; no package action |

`mode` is `lane` or `peer`; peer requires `acceptance: false`. A peer packet
verifies files/state only and makes no web delivery or native runtime claim.
An operation with acceptance false is also explicit; it does not silently
inherit a completed acceptance result from an earlier packet. Closure uses
`references: [{file: "/absolute/sealed/MANIFEST.sha256", sha256: "..."}]`.
The runner verifies those bytes and records the anchors, but neither imports
old call results nor repeats old calls. There is no continuation state.

The agent loads the checked-out source and invokes the same exported runner:

```js
const loaded = await tools.exec_command({cmd: "sed -n '1,$p' /absolute/repo/.github/scripts/prove-host.cjs", login: false, max_output_tokens: 30000});
if (loaded.exit_code !== 0) throw new Error("source read failed");
const api = new Function("module", loaded.output + ";return module.exports")({exports: {}, source: loaded.output});
const result = await api.runProof(parameters, tools);
text(result); // only packet/result/manifest digest, never capture bodies
```

The fully read source must fit the loader output budget; truncation refuses
syntax or the running/copy hash comparison, never permits a different source.
The runner itself returns only bounded facts from the static observer. Full
raw stdout/stderr go to packet files, not tool stdout; each command captures
argv, cwd, environment variable names, timestamps, exit and stream hashes.
Bus requests/results are saved at the moment of each call. The final seal is
returned to the caller and does not claim to hash its own future response.

Required parameters name the executable directly (`node`, `dsh: [argv]`),
the data home and target (`dshHome`, `profileDir`, `profile`), package
(`version`, `archive`, `archiveSha256`), explicit new `packet`, and `source`.
Also supply `product`, `protected: [{path, metadataOnly?}]`, `sessionsDir`, `cacheDir`,
`zstd`; optionally protected `ownerPid`/`daemonPid`. Lane acceptance additionally
names `host`, `input`, `answer`. For peer installer arguments name
its peer product (normally `dsh`). The archive operand must already be durable;
the script never moves or edits it. `DSH_HOME` selects the same named profile
whose files are observed; it is not an inferred executing-CLI installation.
The executable is resolved exactly as the direct argv starts it, without a
login shell or reading any process environment.

The complete parameter check runs before any tool call. Lane is exactly the
`sessionbus` profile; peer is a different profile. Paths are canonical explicit
absolute operands; the packet is outside the DSH data home and protected roots.
Only the stock alpha.2 session root (`dshHome/sessions`) and projection-cache
root (`dshHome/storages/session_projcache/sessions`) are supported; custom backend
paths are refused, not inferred. Required argv/product/decoder/version/checksum,
the explicit acceptance choice, sealed references and every refusal are checked
there. Filesystem/source/archive/executable checks happen in the read-only boot
before the package action. Invalid input returns STOP without creating a packet.

Optional `retained` contains only previously stopped proof lanes: list each
by session ID and require disconnected/not-running; after acceptance forget
them with captured calls. Accepted lanes are acknowledged and explicitly
forgotten. Their by-ID result must be an array without that row or exactly
`-32001 unknown_session`; other errors stop. Optional `refusals` names fresh
workspaces (`case-1`, `case-2`, etc., never credential-like labels) and exact
open/reason pairs from the brief; each requires one
spawn_failed with the reason-alone tail and no new native directory.
An unexpectedly accepted refusal is a STOP that names its live lane too.

Native acceptance reads the settled V4 log: one relay input by
`plugin:sessionbus-dsh`/`relay` source, one bound completed turn, one request
header on the literal owner's profile default, no selection event. The two
other healthy user/message sources are recorded, not prohibited. A send with
uncertain disposition stops and is never repeated. No result flag written by
the harness substitutes for a native observation.

The source copy and hash are first, parameters are explicit, each capture is
exclusive, and STOP seals what is already on disk. No add, send, close, repair,
rollback or retry follows a stopped assertion. A report-formatting failure
cannot discard the already recorded observations. The native worker left by
a stop follows native policy; its identity is recorded for a later brief.
The STOP names the failing step and every lane started but not observed gone.
A failed observer response, including nonzero exit or malformed output, is
captured before validating it. A failed seal returns an explicitly unsealed STOP
and never throws or retries. The final seal's own response remains outside its
self-referential manifest, as stated above. An observed-exited command is removed
from the signal registry immediately; no later group signal is sent to it.

## Replay and limits

The replay now runs the real exported runner **and observer** over a built
temporary tree. The process lister, command boundary, delay and Sessionbus calls
are replaced; command stand-ins capture argv/stdout/stderr/exit on disk and the
install stand-in calls the real shipped row installer. Archive and decoder
outputs are fixture data, not real registry acquisition or a real DSH boot.
Validation, native-log lookup/checks, settled/refusal predicates, report, own
observation/transport captures and sealing execute their production observer
code. No private packet is committed. The public fixture preserves reduced API
envelopes and real event shapes (`message.content` for assistant messages), with
identities/route/text substituted; its sequence labels are expectations, not
mocked PASS facts. Every real call argument is checked and each recorded call
is consumed once. Archive/lane, registry/peer and both independent none choices
are covered. The earlier order-only/mock-flag cases were removed.

The same probes kill eleven required mutations: lost thrown-bus, transport or
observer capture; an accepting roster predicate; allowing changed profile bytes,
owner rows or patch metadata; retry after observer/bus throw; omitted acceptance;
and closure without references. Baseline probes must pass before each mutation
is tested. The protected owner row with a legacy marker makes the independent
owner-span guard observable even when installer-changing upgrades may replace
other marked spans. No fake snapshot flags replace those bytes.

Other real-observer controls cover package pin/files/integrity, 1 MiB disk output,
three user messages with one relay, unknown_session after forget, complete open
pnpm state keys, unchanged-byte bin/cordis timestamp rewrites, credential/process
read spies and sealing after a failed report tool call. Missing prerequisites or
unsafe case labels consume zero tools. An unsealed failure is reported, not PASS.
The stale-source control executes the actual CLI through the exported runner:
it fails on the initial head because boot creates a packet without its copied
runner and attempts an impossible seal. The correction checks source identity
before creating anything, decides packet ownership before writing its boot
observation, and returns STOP with no packet or further call on a mismatch.
Failures after a packet was created still seal; existing packets stay untouched.
The row boundaries copy this package's own installer tokenEnd/rowSpan and
comment discipline read-only, never reserialize YAML. The small ASCII-only
workspace key copies published alpha.2 persistence's unexported projectKey
(`dsh-session-persistence-jsonl/lib/index.js:870-896`). No native files are edited.

Limits are deliberate and named, not PASS: this runner is Linux `/proc`,
settled alpha.2 V4/zstd logs, existing owned profiles with manifest/lock/plugin
and a literal provider/model default for lane header verification; packet and
proof cwd are ASCII. It observes no loaded DSH ctx or service-provider identity
and no peer delivery. Those remain existing native CI/host-driver evidence, not
an inferred claim from nine installed files. Acquisition has no per-command
deadline; the version command also allows cold npx acquisition under that outer
limit. Installer work retains a 60-second bound (rather than 10 seconds on a
loaded host); decode/unpack keep 10 seconds and the native result wait 60 seconds.
An owned group leak fails; after the parent exit is observed the runner never
signals that group and reports the failure rather than risk a recycled pid.
Protected process identity and ordinary tree bytes/links must hold;
ordinary metadata changes are separately disclosed, including bin rewrites,
pnpm workspace/install records and cordis.yml timestamps. Native history/cache
and pnpm-store entries are listed, not deleted; shared-store inventory covers
names/types only. Credential-bearing names and explicitly marked paths are
metadata-only, never opened; an unclassified sensitive file must be marked by
the brief. A same-size rewrite with restored times can escape metadata-only
coverage (ctime makes that hard without privilege). No daemon environment read.

The test process lister is replaced, and a spy rejects any `/proc` content read.
No test inspects real machine command lines. One actual stdout/stderr/group
capture control starts its own Node child and uses the approved POSIX helper's
`ps` group-ID check, not command lines. That one test is explicitly skipped on
Windows (negative POSIX group IDs/ps are unavailable); the runner's native use
is Linux-only. Linux and macOS unit fixtures use POSIX paths; Windows replay is
not claimed. Native DSH/registry/global coverage is the hosted matrix, not this
stand-in or its mocked delay/process listing.

## Pack and gates

The maintained runner is 1057 lines / 44,769 bytes and its test is 619 lines /
25,402 bytes, both at a maximum of 120 columns (ceilings: 1100 and 650 lines).
The earlier mock-flag cases and the one-call quote/bus-value/hash helpers were
removed. The runner's six parts account for every line:

| Part | Lines | Past stop or reviewer finding answered |
| --- | ---: | --- |
| Parameters and lifecycle predicate | 118 | Refuses wrong profile, omitted inputs, unsafe labels and packet placement before any tool call. |
| Call-time runner and terminal STOP | 219 | Preserves failed calls, identifies all live lanes, distinguishes retained from forgotten rows and never retries a mutation or send. |
| Disk maps, owned spans and native-log predicates | 225 | Fixes the parser anchor, three-user-message assumption and owner-span boundary while keeping credential files metadata-only. |
| Owned command capture | 72 | Keeps large output off tool stdout, observes exit before signalling and gives the row installer a loaded-host margin. |
| Real observer | 346 | Records open-schema pnpm state, bin/cordis metadata, source ownership and report/seal results instead of replaying invented PASS flags. |
| Direct argv, native process boundary and CLI | 77 | Identifies the command that actually runs, never reads environ and permits tests to replace process observations without inspecting the host. |

Pack on Linux x64 with npm 11.12.1. Expected packed deltas against the proven
0.1.1 archive: README.md, package.json, plugin.cjs only; other six files
byte-identical. The runner, fixture, test, proof map, changelog and operations
runbook are unshipped. No workflow or installed dependency change.
Final archive/file hashes, local gate summaries and the exact-head hosted run
and bot disposition are reported in the handoff, not invented in this record.
