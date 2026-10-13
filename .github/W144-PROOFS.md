# W-144: receipt admission and pending peer input

## Consequences and scope

0.1.3 is a documentation and proof release. It changes the shipped README and
package version, not plugin.cjs, delivery, receipts, scheduling, queues, nextTurn
precedence, permissions, selection, installers, launchers or the daemon. An
`injected` receipt still reports admission, not reading or an answer. The README
names what users see after an error/cancel, the later wake and the safe manual
action: another message or a prompt, not a copy of the already-admitted input.

The public remove-then-steer shape B' was evaluated, not adopted: two non-atomic
durable operations can lose safe pending input and falsely record cancellation.
It schedules other pending work, can spend another full retry budget, and should
wait for DSH's answer about the intended wake API; a later message already wakes.

No runtime observer, new state, synthetic message, private wake API, retry or
second inbox owner is added. Outgoing tools, identity/presence, reconnect,
capacity, lane collection and terminal output are unchanged. Uncertain sends are
not repeated. Existing proofs stay in place. No real home, profile, permanent
daemon or real model is used by the new proof. Host proof and publication require
the architect's separate D-049 brief; this PR does not authorize them.

## Maintained proof

`.github/scripts/prove-peer-pending-input.mjs` takes the explicit published DSH manifest,
candidate profile's installed plugin manifest, a fresh work directory and the
released daemon executable. It uses a private HOME, DSH_HOME and XDG roots,
private peer profile and socket, and a controllable in-process LlmAdapter.
Node is necessary to call the published Agent/Context/session-controller APIs.
The daemon is the existing checksum-verified v0.5.12 acquired by the prepared
Linux leg; no new dependency, acquisition or matrix dimension is added.
This proof is Linux-only and refuses another platform explicitly. Before starting
the daemon it checks both the main socket and the longest derived
`lanes/<32 hex>.sock` path in bytes against Linux's 107-byte pathname limit.
The daemon derives lane paths 44 bytes longer than the socket directory (and
`op-<32 hex>.sock` paths 41 bytes longer): directory length 63 fits, 64 refuses.
The main socket is in the existing prepared work parent, not another /tmp root.
An exited child ends readiness immediately with its status and captured stderr
tail; the 10 s observation bound is unchanged. Cleanup unregisters a proved-empty
group before checking its exit status, so a non-zero exit does not trigger a
second signal to that empty group. Socket-length and readiness unit controls
exercise the actual driver functions without starting a daemon.
One upload step in that same job keeps only the generated peer-pending-input
capture tree for seven days. It contains synthetic inputs/results, source
copies/hashes, private-profile configuration, native logs and the seal, not
tokens or an environment dump. File-path values point inside the prepared
runner's work directory; the adapter is executed from its captured source copy.
The prepared run uses its existing KEEP_PROOF switch so EXIT cannot erase this
artifact before upload. No other prepared proof directory is uploaded.

The driver stores its source/hash, every public prompt/cancel and bus
request/result, model requests, gate transitions, native events and native
inbox/phase observations. It prints one line per case and seals the private
capture tree after native shutdown. A sender receipt and model consumption are
asserted independently. Every send is made once. Read-only publication polling
and readiness waits have explicit 10 s fixture bounds; no package operation is
introduced. Only the detached private daemon's owned group is cleaned up.
If a failed observation leaves the controllable adapter held, cleanup cancels
only its private roots with `disposed` before releasing its gates. It cannot
manufacture a recovery result; the original failure remains terminal.

Case families (independent roots for peer and typed-prompt recovery):

- **Known gap: active then error.** A held request, one injected relay, then
  INVALID_REQUEST: idle with that exact nextStep item, no new turn or request.
  A second peer message or public typed prompt claims old and new input once.
- **Known gap: active then cancellation.** Public session cancel keeps the
  pending relay; abort ends the turn, no automatic wake. Both recovery routes
  claim it later. This is a documented native keepInbox boundary, not a fix.
- **Positive control: normal end.** The same active relay reaches the next
  model step of the original turn; it is not an idle-wake proof.
- **Positive control: idle after error.** A relay arriving after the seeded
  error already made the Agent idle immediately opens a turn and is claimed.
  That turn may error, abort or finish normally; subsequent valid input works.
- **Known gap: retry exhaustion.** Native dsh-llm-retry repeats the same held
  step once, TIMEOUT only, 1 ms backoff. Both failed requests exclude the relay;
  after exhaustion it stays pending until a second peer message wakes it.

These are **known-gap assertions, not wanted behavior**. If DSH automatically
wakes and consumes pending input after error/cancel or during retry, the driver
fails with a message naming that upstream improvement and asking for this proof
and documentation to be updated. A missing item without evidence of a new turn
or request fails separately as an unexpected state, not as an improvement.
A plugin-added wake would also be credited to upstream by the oracle; only the
captured native removal/insertion events distinguish those causes.

The error/abort/normal integration covers 12 cases, plus retry exhaustion (13).
It does not measure a real pi-ai idle watchdog or six 300 s attempts. The default
five retries and approximately thirty minutes for six wholly idle requests are
source reading and arithmetic; the measured case uses one retry and 1 ms delay.
The proof does not claim to explain any particular production incident: input
arriving after error-idle wakes normally.
The native profile runs in-process with public session prompts; it is not a
dashi TUI or web-browser UI proof. The unit test evaluates the driver's actual
known-gap oracle on fabricated observations to pin the upstream-improvement
message and distinguish unexplained loss; it does not claim a native wake.
DSH encodes the cwd plus three bytes in one session-directory component; the
255-byte filename limit bounds this capture directory at about 194 bytes
(computed, not tested), far beyond the hosted length.

## Source and existing coverage

Published DSH 0.2.1-alpha.2 AgentLoop lib/index.js:800-811 (waking send/steer),
854-868 (running wake/latch), 103-110 and 906 (claim), 1010-1036 (error/abort),
1037-1041 (bypassed pending continuation), 887-899 (idle and latched wake),
1051 and 1130-1147 (same-step retry). Public session cancel uses keepInbox at
api-session-controller lib/index.js:996-1002. The fixture reads private phase
only as a diagnostic; product code gains no private-interface dependency.

Existing agent-steer-boundary proves the normal turn-end microtask gap and our
macrotask admission boundary; it does not prove active error-end wake. Existing
universal active/idle delivery uses normally completed turns. Lane failed-turn
record controls are not peer continuity controls. No earlier proof is removed.
Global upgrade rows now start from newest published 0.1.2, not historical 0.1.1.

## Evaluated public pair, not adopted

Five probes: first pair on [A,B] yields [B,A]; last pair preserves our relative
order; a repeated error leaves no relay/no third turn; a queued user prompt is
claimed too; a rejected recovery pre-step claims input with no model request.
See W144-REJECTED-STEP.md for that separate finding and its scope.

## Local gate and packed delta

Node v25.9.0, npm 11.12.1, Linux x64:

```text
tests 203; pass 203; fail 0; cancelled 0; skipped 0; todo 0
DSH 0.2.1-alpha.2 peer pending-input known gaps and recovery: 13/13 PASS
DSH 0.2.1-alpha.2 sessionbus-dsh lane, web active/idle/trace delivery,
real-Agent boundary, packed install and uninstall: PASS
dashi 0.2.0-alpha.2 packed: PASS (not a TUI boot)
```

Candidate archive `sessionbus-dsh-0.1.3.tgz`:
`4fd87eed4bbb93756c90b6cbfd9ee141b9db0237fd4e234f416cc660bccca622`.
27,855 B compressed / 90,425 B unpacked, nine regular files. Against registry
0.1.2 (27,451 / 89,307 B), only README.md and package.json differ; +404 compressed
and +1,118 unpacked bytes. Seven shipped code/skill/runbook entries stay equal,
including plugin.cjs `139599105dce90c491689913ac8d0458d46509cf404090d348f585b23a06e896`.
Hosted results and CodeRabbit review are reported at the proposed head, not
inferred from these local checks. No host installation, tag or publish occurred.
