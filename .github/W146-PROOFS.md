# W-146: peer diagnostics belong to the host logger

## Consequences and preserved behavior

The socket error callback bypassed the deferred groups error's duplicate guard.
Kit 0.5.12 reconnects each peer every two seconds, so an absent socket wrote one
line for the first attempt and another for every retry into the interactive
host's terminal. The prior reconnect test even required two such stderr lines.

Peer-mode diagnostics now use the published named Cordis logger, including
configuration, context capture, activation, publication, title updates, deferred
groups failures and opt-in debug traces. Non-fatal diagnostics never write to a
terminal or console. Non-terminal stderr retains all 0.1.3 diagnostics and
opt-in trace, alongside their logger records; the sole difference is connection
deduplication once per outage for each session, retaining service-journal
visibility. The two
fatal startup paths retain exactly their former one
stderr line before exit 1, and also log at error: a launch that ends must say why.
The published `@deepseek-ai/cordis@4.0.5-alpha.1` API is
`lib/types/context.d.ts:26-27` and `lib/types/logger.d.ts:77-101`; its default
exporter retains structured messages in the native buffer, without terminal I/O
(`lib/index.js:598-604`). Presentation, exporters and retention belong to DSH,
not to a new plugin log file or storage domain. This does not promise that a
host's own configured exporter cannot write a terminal.
Required diagnostics use ERROR, which the default buffer keeps without changing
the host's level. Cordis drops warn/debug at its default threshold 1 before
export (`lib/index.js:473-474`). Only when the existing trace option is on does
the named facade set its public `level` to 3 for debug records; trace off leaves
it untouched. An exporter's explicit level filter still takes precedence. No
global logger or exporter is changed, and no plugin diagnostic uses warn.
Every logger call passes the literal text as the argument to `%s`, not as a
format string. DSH alpha.2 buffers the record but supplies no presentation;
the session's no-argument command is the terminal user's connection-failure
visibility surface, not a presentation of all logger records.

Launch mode is selected once from the immutable launch snapshot when available,
after capturing the services and before validating the product. Capture keeps
0.1.3's tolerance for an unavailable live launch-environment service. The one
synchronous mode callback selects the startup diagnostic sink; it does not add
a second token read or a lifecycle observer. Invalid peer activation still
requests exit 1 with its original stderr reason and an error log. Invalid lane
activation still
writes the same stderr text and requests the same exit. A failure before mode
can be read uses the peer fatal path: one stderr reason and an ERROR record,
never an assumption that the host is a lane.

An existing peer record holds only its last failed socket attempt's flattened
message. Equal errors are logged once until the socket connects; a different
error is a distinct diagnostic. A later failure after connection is logged
again. Updating this field occurs at the socket callback, not after a queued
title or groups change, which prevents delayed diagnostics from rewriting a
later recovery. Active/current-record guards suppress stale diagnostics.
Replacement and disposal discard the record as before.

`/sessionbus-groups` with no argument still returns the declared groups at once,
without any bus call or waiting for serialized work. A failed last attempt adds
one labelled line and its error. A successful socket connection clears that
line; this is not proof of current hello admission or model readiness. Group
mutation, persistence, cancellation and uncertain outcomes are unchanged.

Lane stderr, opt-in lane trace, exit codes and refused-Open suppression stay
unchanged. Kit reconnect timing, presence, message ownership, tool permissions,
inbound/outbound delivery, active/idle wake, native identity, terminal results
and later valid delivery are unchanged. No send is added or replayed, no pending
input is discarded, and there is no backoff, polling, new dependency or process.

The production diff against 37d1e97 is exactly +28/-16 lines in `plugin.cjs`
(44 diff lines, 12 net), within the granted 46-line ceiling. It is not compressed
into a new framework. Other runtime
files and the lock/dependency graph do not change. The universal driver's plain
published baseline moves from 0.1.2 to 0.1.3, the newest published release.

## Repository evidence

`plugin.test.cjs` spies on the real `process.stderr.write`, not just an injected
collector, and on every console severity. Its eight peer paths require zero
non-fatal terminal output, exactly one fatal stderr line and records named
`sessionbus-dsh`: configuration, capture,
activation, publication, terminal publication, title, deferred groups and trace.
Trace records require debug; other diagnostics require error. The startup control
reads the token once even with invalid configuration, and retains exact lane
stderr and exit behavior.
The apply-to-running-peer control exercises the captured logger through delivery
and a later diagnostic; removing that captured service must fail. Another
control pins capture-first startup when the live launch-environment getter
throws. Literal percent forms stay unchanged and arrive as logger arguments.

The real-kit socket control covers repeated ENOENT attempts, the unchanged
2000 ms schedule, recovery with the same peer object, a second outage, a distinct
socket failure, immediate last-attempt output while serialized work is pending,
zero calls from show, and shutdown, with both terminal and non-terminal stderr.
The former receives zero lines; the latter exactly one across retries and one
more after recovery and another outage. Actual late socket errors from disposed and
superseded roots cannot log or modify the replacement's shown state. The old
publication/groups/trace assertions now require the same diagnostic in the
logger and their original non-terminal stderr text, with zero terminal output;
their lifecycle/continuity assertions remain.
All existing lane controls remain, including refused Open, transport loss,
bound errors, delivery, cancellation and shutdown.

The final W-146 controls run against unchanged 0.1.3 runtime source fail for
non-fatal stderr writes (including the real first socket failure), missing fatal
error records, the token not being read before product validation, and unchanged
host-level expectations. The earlier show control also observes `[]` despite a
failed attempt. Preliminary controls were retained
as they grew to include capture, real sockets and stale roots; none is a retry of
a failed product gate. Passing controls do not substitute for a real host check.

Ten intentional implementation mutations are all rejected: non-fatal stderr,
missing fatal stderr, warn instead of error, error instead of trace debug, lost
log records, an unconditional level increase, a lost mode handoff, repeated
socket diagnostics, stale socket diagnostics and failure to clear after recovery.
The actual corrected source is restored and passes afterward.

The correction controls first fail on the reviewed head for literal diagnostic
text used as a format, live-context startup intolerance and absent service
stderr. They pass after the correction; removing the captured logger then fails
the apply-to-running-peer control. The initial version of that new control used
the wrong delivery callback arguments; that retained test-harness failure was
corrected before it was counted as evidence. The deferred-groups observer is
executed directly with generated stderr-only and logger-only failures, not just
checked for assertion text. Both fail, and its clean control passes.

The last sink ruling removes the connection-only exception: the stream's own
TTY state is the only non-fatal stderr condition. Four diagnostic paths and
opt-in trace run against both real stderr spies: zero lines for a terminal, the
0.1.3 lines for a service, and logger records in both. On the preceding head all
five service controls fail for their missing lines. Restored legacy stderr
assertions initially reject that superseded logger-only expectation; their
original service text and the logger assertions are now both required.

One local npx row passed its lane and option assertions, then its row-removal
exec was SIGTERM'd at the existing ten-second bound while the root filesystem
was full and scratch removal stalled in I/O. This was the host condition, not
a candidate finding. The failed stdout, stderr, request and exit are retained;
only that unchanged row was rerun after the named disk cause was cleared and
passed in 86 seconds, including both row and package removals. Completed
gate scratch is removed, retaining logs and cited sealed evidence, and every
new local gate checks for at least 10 GiB free first.

The corrected npm 11.12.1 Linux x64 pack has nine files, 28,616 archive bytes and
92,468 unpacked bytes. Its SHA-256 is
`5d44d6fd9faac514a685d556e2235386a1147f5061c9b6673e1dbc6bca1ae7aa`.
Against published 0.1.3 only README.md, package.json's version line and plugin.cjs
change. All six other files, their modes, dependencies, peers and lock remain
identical. plugin.cjs hashes to
`de29a51bca7a107c470e660a279b5f8cc64ba8a2663cee5bb8920d572d7c545e`.

The full suite, packed DSH alpha.2 proof, native alpha.1 refusal and universal
Linux rows are run locally with raw output retained. The unchanged hosted matrix
covers Linux and macOS installation rows. The normal-install host proof is a
separate pre-tag gate; it has not been run by this implementation.

The first packed gate stopped at its old assertion requiring one peer stderr
socket line. That retained failure proves the old oracle contradicts this item,
not that native admission or delivery failed. The existing ask-all fixture now
registers a public native logger exporter to a generated work-local JSONL file.
The final replacement asserts one error socket record and the same one line on
the fixture's non-terminal stderr before and
after the same delayed-daemon recovery. Permission, active/idle delivery, trace
and later round-trip assertions are unchanged; no timer is increased. This
fixture is only a synthetic repository gate, not normal-install host evidence.
The next native run exposed the default severity threshold: the fixture was
installed, but warn records reached neither it nor the default buffer. That
failure is retained too. A preliminary unconditional-level proposal was
withdrawn on review: the final implementation uses error for required facts,
and only opted-in trace changes its named level. The fixture also requires the
very same record in the default native buffer and no trace-off debug records;
merely enabling its own exporter cannot satisfy the oracle.
The next run passed native-buffer logging, recovery and web delivery, then
stopped at the corrupt-groups startup oracle requiring stderr. This was a real
startup regression, not an obsolete oracle: the user got exit 1 without a reason.
The ruling restores fatal stderr and also logs the reason. The exact original
stderr, exit and byte-identical corrupt-record checks stay unchanged. The two
no-deferred-diagnostic checks read the native log alongside their original stderr
checks, so neither a logger-only nor stderr-only deferred error passes. A proposed
oracle replacement was withdrawn before any pass;
an isolated diagnostic attempt also stopped before boot because its parent work
directory was not created, and is retained without claiming a result.
One withdrawn in-flight level-proposal run met a shell read-offset
error when its script was edited while running; it remains history, never PASS.
During the fatal-test update one broad edit changed the disposal test's assertion
instead of the missing-product assertion. The failing unit run is retained; the
two exact assertions were corrected without a runtime change, then pass again.

## Normal-install host check and dashi procedure

Install the reviewed archive into the real sessionbus and web profiles by the
README commands; do not change the daemon, its configuration or running owner
processes. Start only the proof's own web process with the supported
`SESSIONBUS_SOCKET` pointing at a verified absent short path. No other variable
or configuration differs. The profile must not set an explicit socket, which
would override the environment. Over fifteen idle seconds require no plugin
stderr on a PTY and exactly one line with stderr to a file, one native diagnostic
in both, and the command's last-failed-attempt line. A
second own instance on the real socket must connect and exchange a peer message.
No login link or token is written into evidence captures.

For the dashi release, its normally installed candidate bundle must pin 0.1.4;
composed resolution must confirm that loaded copy, not a hoisted physical alias.
Start the own ordinary inline instance with the same one-variable absent-socket
override, idle fifteen seconds, invoke `/sessionbus-groups`, and confirm input
and repaint remain usable. Stop only that instance. Nothing here requires a
private home, store, daemon, profile fixture or a replay adapter. The published
dashi 0.2.0 bundle pins 0.1.1, so updating another profile is not this evidence.
The dashi candidate's proof owns that inline check; it is not claimed as run here.
