# W-155 implementation plan and consequence record

Authority: phase-0 REPORT-sessionbus-dsh.md a96e1f72 and architect rulings
ca041be70d8c2cc392a376ffea1779b1cbf165c45289bd054b69ccfa3f4697d6,
read in full. Base cb8a563a97e14810e9bce8d118ac7d48e19aa072.

## Scope and mechanism

Release candidate 0.2.0 folds in unreleased 0.1.6. One supported public API
family: exact validation/install DSH0.2.2-rc.3, Node>=24.9.0, no old adapter.
Existing JavaScript remains necessary: this is an in-process Cordis plugin
calling the host's JavaScript services and the JS kit. No new language/runtime,
process, transport, model adapter, journal, dependency owner or queue is added.

Peer root authority is subagents.rootOf over agents.list, with exact live
identity. A conditional required-service scope and readiness guard give a named
fatal refusal when subagents is missing, not a forever-pending common inject.
Lane controller scope remains separate. This deliberately makes subagents
required for peers in custom compositions. Managed children are not published;
ordinary forks remain independent roots; stale/replaced instances never inherit
presence or delivery. Only native UNAUTHORIZED from root lookup is exclusion;
other errors must not be silently treated as a root.

Lane options validate using llm.resolveCallConfig and select through agent.model
inside native runMaintenance. Fresh invalid options still fail before create
when session-independent validation can decide. Idle resumes use their current
selection, never the profile default. A busy resume with options refuses cleanly;
no waiting queue/private image lock/profile-saving GUI API. Recheck native idle
admission after asynchronous rename. Maintenance and open cancellation both own
the validation signal. Failure after create/rename preserves those partial
effects; abort after durable model selection does not roll it back or retry.
Model-only selection omits an adapter-default effort rather than pinning it.

Unchanged: kit0.5.16, frozen common artifact, skill, native session identity,
permission presets, OS-user transfers/auto-allow, relative-path binding,
diagnostic terminal routing, group persistence, reconnect and delivery receipts.
Earlier removals/worker remain unjoined; no worker.closed wait or registry.

## Proof ownership and adverse cases

Start with failing controls for missing root service, ordinary/fork roots,
managed/unmanaged children, same-id replacement, busy resume refusal, native
maintenance exclusion/cancellation, validation failures and applied-then-aborted
selection. Replace obsolete private-selector tests with public counterparts;
keep their default-unchanged, failure-before-create and continuity requirements.
Lifecycle replacement/disposal controls remain real Cordis4.1 controls.

Replace reflection with public inventory + selected package resolution + actual
no-upload/tool/native behavior, with missing/duplicate/wrong-entry negatives.
Replace sdkSchemas with public definitions and real native/PTC executor
projection; keep all renderer-independent golden bytes and root-false mutation
controls. Existing alpha.3 literals remain historical; new-version measurements
are not silently declared old-oracle PASS.

The native measurement on rc.3 first ran with the existing fail-closed renderer
branch: six independent oracles and nine lifecycle controls held, with TS/Python
explicitly UNVERIFIED (exit 1). TS is 9076 bytes/e02cad11e886f77d7af214911a5ed7dd5a59313379146abd099e297b99d7c8e7;
Python is 9323 bytes/44334eb1f1ec509bff103b90991b43c8607aef2b174e6c1071fdfaafc48cbd3a.
For this newly authorized single-family release, keep the old fixture byte-exact
as historical input, add a separate rc.3 renderer fixture from that observation,
and require the exact rc.3 producer before using it. All eight projections then
have strict length/hash oracles; mutated TS/Python must fail too. This is a
deliberate new renderer pin, not refreshed alpha.3 history or a permissive
off-baseline branch. Any other producer refuses before claiming validation.

Pending input uses fresh rc.3 adverse/recovery observations: insert/claim/native
history/request are separate facts. Idle wake, active next-step, end-boundary,
preparation refusal, error, cancel(keep/discard), retry exhaustion and later typed
or peer recovery are separate controls. Never replay uncertain native attempts,
disconnect to hide a missed callback, or call a stranded/lost item delivered to
the model. A native loss is a STOP/upstream finding, not an adapter fallback.

STOP 1b253400 was accepted as an upstream DSH GAP in RULING-W155-STOP.md
5c4964e7. The sealed failing run is not rerun as continuity success. The new
exact-rc.3 KNOWN-GAP oracle requires one public inbox claim and refusal,
no retention, no user-message commit, no model consumption, and blocked end.
Any repaired fact fails the oracle for deliberate re-evaluation. Other versions
remain UNVERIFIED/non-zero. Ordinary wake/error/cancel/recovery controls remain
separate, with no queue, rollback, replay, disconnect or lock in the plugin.
The native source trigger inventory is recorded in W155-PROOFS.md; the public
README names shipped archive gates rather than inventing budget/policy triggers.

## Order and boundaries

1. Public runtime controls and correction, version/pins and docs.
2. Exact owned scratch install; units; native root/schema/prefix/selection;
   public runtime observer positives/negatives; explicit below-floor refusal.
3. Full packed/universal native gates on real rc.3, supported Node, Linux/macOS
   hosted matrices. Under C4's later ruling, record the complete native
   assembled LlmCallOptions delta, not provider wire or a cache claim.
4. Pack byte comparison: tool JSON and skill stay byte-identical. Full held
   real-model transfer acceptance remains NOT RUN and outside this local work.
5. One branch/PR, architect review and exact-head CI/bot. No merge/tag/publish,
   owner-host installs, real credentials, owner process signal, or fleet action.

df before install/gate/pack/native run. Coordinate windows with dsh-exec; remove
generated dependencies/caches/stores/unpacked/capture scratch after checks,
retaining source, archives and cited evidence. Roller is serial after this PR.
