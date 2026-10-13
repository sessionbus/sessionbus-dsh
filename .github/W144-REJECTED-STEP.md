# Separate observation: rejected recovery pre-step

This is not part of the pending-error report and is not a runtime change.
Disposition of a possible second report belongs to the architect.

In the private Agent-only `blocked-recovery` probe, a relay was left in nextStep
by the first error. After public remove-then-steer, an agent/pre-step listener
returned `{kind: 'reject'}`. The second turn ended `blocked`, the inbox was
empty, and no second model request occurred. Raw events distinguish the explicit
canceled removal from the later pure claim; there was no implicit restoration.

Published alpha.2 AgentLoop lib/index.js:906 claims before assembly/decision;
909-922 obtains the decision; 960-963 returns with `blocked` on reject.
The published Agent type comment at runtime-types.d.ts:194-197 says a rejected
step leaves steering parked until the next wake. This probe's steering had
already been claimed, so it does not establish that unclaimed later steering
is lost: the independent reader separately observed that steering arriving
while rejection was pending stays parked. That timing distinction belongs in
any later investigation, not a blanket contradiction claim.

Retained analysis source hash:
`3bf69af29655b84636f35772920946afbcf05098f1f47671121f6df37f4529a8`.
Raw `pair/RESULTS.json` hash:
`f58c602432aea5119ba6da82c46d0010aef1fced7e10285e541f6e520a589fd4`.
The private source and per-case raw requests/events are beside the checked report;
they are neither a CI gate nor an upstream attachment.
