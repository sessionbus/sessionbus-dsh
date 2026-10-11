# W-125 proof and preservation map

## Consequences and ownership

DSH owns package installation and the compatibility floor. The installer owns
only its marked profile rows and an absent lane base-bundle entry. The operator
owns daemon deployment, PATH selection, model configuration and package-manager
policy. Ordinary installation is two native DSH commands; a global, npx or
project DSH supplies the plugin's runtime peers. Several installs may coexist.
The operations runbook is only for upgrading an explicitly named pnpm project
in place, not an installation prerequisite.

The separate exported no-upload entry copies the published helper's 308-byte
implementation unchanged. The plugin no longer owns an external-provider
dependency or peer and cannot change which external provider dashi-app hoists.
Lane/custom rows mount the own entry; web keeps its native upload service.
Dashi's matrix owns proof of the provider its composition actually mounts;
this repository's dashi case is metadata coexistence and a launcher lane,
not that provider proof. Existing unused external pins remain untouched.
The inert YAML reader adds js-yaml 4.3.2 and argparse (about 1.13 MB unpacked);
it never evaluates expressions or serializes user patches. plugin.cjs,
launcher.mjs and bin.mjs remain byte-identical to the base.

Every decidable failure is checked for all profiles before the first write:
manifest parsing/container shapes, bundle patches, patch parsing, row
ownership, and complete planned output. Each changed file uses a random-suffix
sibling, exclusive create, rename and failure cleanup, like the native
dsh-atomic-write writer (lib/index.js:66-75), without fsync or a new lock.
Two deliberate differences preserve what the owner provided: resolve and
replace the referent so a symlink survives (native replaces the link itself,
:51-52), and retain the exact old mode (native config-editor forces 0600,
lib/index.js:123). Ownership by another user, hard links, extended attributes
and ACLs are not preserved. Write-time I/O can still partially change a
profile across files; the error names completed profiles, the possibly partial
current profile, and profiles not attempted. There is no rollback or retry.
The fault control moves from direct-write to the atomic rename commit point,
and now also requires unchanged original bytes and no leaked temporary file.

## Guard dispositions

| Fact / former check | Disposition and adverse control |
| --- | --- |
| Valid profile path and stable product; lane product restricted | Retained. Unit invalid path/product controls. |
| Plugin already added to target profile | Retained. Missing manifest/dependency refusal; all-profile zero-write control. |
| Manifest and bundles shapes | Retained/completed in all-profile preflight. Malformed JSON, scalar/array containers, invalid bundles; valid/null controls. |
| Executing CLI anchor, floor and base availability | Removed from installer. Native alpha.1 add refuses and forced boot disables readably. Required rows must be active in the runtime oracle. |
| App bundle already supplies Sessionbus/upload row | Retained; profile-root-resolvable bundles only, never CLI lookup. Two native overlap controls demonstrate silent last-row-wins without the guard and unchanged-profile refusal with it. Unresolved native DSH bundles are not inspected. |
| Native patch dialect | Read-only declared parser, not regex. Writable block sequence / stock empty array, with BOM/CRLF/comment preservation. Nonempty top-level flow/JSON refuses before any write; read-only bundles still accept these forms and ordered file lists. Hostile `!!js` stays inert. |
| Unmarked mounting rows | Refuse before any profile changes; never adopt. Marked product repair remains. |
| Unmarked config-only lane defaults | Preserve byte-identically, report `kept as yours, lane default not applied`, never append a shadow. |
| Removal provenance | Remove only marked rows; unmarked matching mounts refuse, while owner config-only rows survive byte-identically. No package operations, even with broken DSH/offline. |
| Provider lookup, app-pin validation, registry deadline | Deleted with the withdrawn required-peer design. The own exported entry resolves from the direct plugin package. |
| Companion pins and uniform physical/lock copies | Operations policy/inventory only. Native runtime checks compatibility, one DSH version, actually mounted modules and sole registered upload service. Extra physical packages are not a failure. |
| Zod producer realpath / native schema contract | Existing alias controls and native domain-schema leg retained. Runtime peer range is authoritative; cross-copy native schema parsing remains proven. |
| Strict missing-peer refusal assumption | Withdrawn after failing controls. pnpm 10.28.1 clears strict checking for add mutations (tagged core install/index.ts:265-266,1509-1511). One labelled Linux isolated/auto-install-off/strict control asserts the actual missing-peer warning and exit 0; no remedy/pins. |

## Regression replacements, not removals of product evidence

- Provider range/pin selection, registry failure/deadline, physical-copy counts
  and package-removal tests tested the withdrawn W-122 mechanism. Replaced by
  no-child installer assertions, manifest/lock byte preservation, own subpath
  mount, actual service owner/callback, native overlap negatives, ordinary
  add/exec/uninstall, and preservation of an existing external pin on upgrade.
- Installer CLI-layout/floor tests replaced by stock native alpha.1 refusal
  and forced-boot denial, plus Linux/macOS global npm, pnpm 10/11/12, npx,
  project and mixed-install legs. The compatibility declaration remains
  literal and unchanged; no version exemption is used.
- Exact companion-minimum runtime rejection became a real peer-range test:
  the extracted runbook checker accepts a compatible profile-local Cordis
  and rejects below-range 4.0.4 from the plugin's native importer. Prepared
  companion/lock tests remain labelled project-operations regressions.
- YAML regex controls replaced with semantic native-array reading and source
  span preservation: key order, persona false IDs, inline mappings, comments, stock
  DSH template, inert expressions, malformed inputs, marked/unmarked rows,
  owner rows before/between/after marked spans, and EOF/null field boundaries.
- Cold packed imports/bin tests deliberately avoid fake CLI anchors and do
  not claim runtime proof; the native hosted legs own that evidence.
- Existing plugin, launcher and rename tests stay unchanged. The prepared
  operations leg retains token/no-group lane identity, actual durable text
  for ordinary and delivery-backed runs, ask-all negative permission control,
  pre-commit error results, real Agent boundary behavior, title/reconnect,
  cookie HTTP empty-request web root, active delivery/idle wake, trace, and
  released-daemon group replacement/ownership/self-group/persistence/refusal.
- Dashi metadata derives one/two plugin paths from the published app pin
  versus candidate version. Different versions are labelled coexistence,
  never candidate-inside-dashi proof. The published launcher lane still runs.
  Actual registered service assertions are separate from metadata/copy counts.

## Harness lifecycle and retained history

Each universal/floor/conflict/policy child owns a detached process group.
Normal universal stop verifies the fixture-reported native PID belongs to that
group, sends that PID SIGTERM and requires exit 0. After native exit, the group
has at most one second to disappear, then an occupied group fails. Group
TERM/KILL after five seconds is cleanup only, never a way to pass that check. A wrapper/inherited-pipe
negative proves parent-only stop leaks, and an outside-group PID is refused.
The original failed npx run stays in the scratch evidence.
The normal-exit observation bound is native shutdown grace 5000 + margin
5000 ms (DSH profile-boot createProcessShutdown:11-12,43-46). The old five-second
SIGKILL concealed the product's own grace in the forced alpha.1 floor control;
the initial corrected five-second observation also raced it. Both runs remain
history. Exit 0 and the independent post-exit empty-group assertion still hold;
there is no normal-stop kill, and cleanup escalation remains five seconds.
Normal stop first waits for native exit and requires an empty owned group,
before any cleanup escalation. The leaked-descendant control failed against
the old stop (it silently killed the leak after five seconds and returned
exit 0); it now rejects while the descendant is still alive. Only the ensuing
cleanup may send group TERM/KILL. Retained prepared shell and per-session-group
proofs now use that same group helper, via a portable detached-spawn adapter
for Bash. No bare PID is used for termination outside an asserted owned group.

The first hosted head also retains two Linux failures as history: a snapshot
reader met the fake producer's truncate/write window, and the 60-second
operation timer killed a cold npx acquisition. All sampled JSON producers
now write a same-directory temporary file and rename it; malformed reads
still fail without a catch or retry. Package acquisition (the version warm-up
and package adds) has no per-operation deadline and is bounded by the leg's
25-minute limit and owned-group cleanup. Every candidate installer exec has
its own 10-second completion bound (15-second cleanup escalation), while
package removal retains 60 seconds; observed readiness/delivery/idle states keep their
30-second bounds, and cleanup keeps its five-second escalation. Cleanup errors
retain the primary assertion in an AggregateError. The pack command names the
repository as its positional package directory and is tested from an unrelated
empty working directory; the proposed --prefix form also failed with ENOENT
and is retained as a negative control, not used as the pack operand.

The accepted premise packet retains the published pre.20 exact exec failure
at 121,380 ms on the writer lock; the new native exec path does no package
operations and passes. Its two-provider-copy native controls proved that
physical multiplicity itself is harmless but root hoisting can select the
plugin's stale helper for the app's row. The own subpath removes that second
owner. Neither sealed packet is modified.

### Committed published pre.20 failing-first record (executable repeat waived)

On 2026-10-11, DSH 0.2.1-alpha.2, published plugin pre.20, Node 25.9.0,
a freshly created profile with DSH's hoisted/auto-install-off defaults:

```sh
DSH_HOME=/tmp/sessionbus-w125-premise.KsoW0NyO/home \
  /tmp/sessionbus-w125-premise.KsoW0NyO/cli/node_modules/.bin/dsh \
  plugin --profile fresh-exec exec sessionbus-dsh-install --product dsh fresh-exec
```

Measured elapsed **121,380 ms**, native exit **1**, signal **null**; the patch
was byte-identical. The installer called a package add beneath the parent's
profile writer lock. Native stderr excerpt:

```text
Error: atomic-write: timed out waiting for the writer lock at /tmp/sessionbus-w125-premise.KsoW0NyO/home/profiles/fresh-exec/package.json.lock
    at withFileLock (.../@deepseek-ai/dsh-atomic-write/lib/index.js:206:37)
    at async runPlugin (.../@deepseek-ai/dsh/lib/plugin-BGnVfe_D.js:93:25)
dsh: plugin command failed
```

The prepared Linux-only operations baseline executes the published pre.20 bin
outside exec, then records and asserts the exact provider spec it actually
installed. A future registry maximum therefore cannot create a nested lock;
the ordinary candidate add still upgrades in place without cleanup. Every
universal candidate exec has the independent 10-second bound above, so
reintroducing package mutation cannot wait 121 seconds and pass. Actual
project-host lane/web upgrades remain a D-049 gate before the tag; this is
not a global-install upgrade claim.

### Review coverage and count-check dispositions

- The three original new unit tests that passed with the base installer are
  the runtime-oracle adverse controls, own-entry package metadata, and the
  owned-group wrapper fixture: each tests an oracle/package/harness fact,
  never calls the base installer, and was not claimed as an installer
  failing-first control. The other 18 exercise the changed installer behavior.
- The unhoisted app-boot / symlink-parent control again extracts the actual
  dashi metadata script's CLI-owner lookup; the synthetic-bin negative fails.
- The Linux project universal cell installs and removes an actual DSH-created
  custom non-web profile as well as lane/web; no manual profile fixture.
  Native removal deletes the dependencies container when the last package is
  removed: the plugin-absence assertion accepts an absent or empty map and
  rejects a remaining plugin; JSON parsing stays strict. Its original false
  failure is retained as harness history.
- `assertPinnedGraph` calls in the prepared operations leg reject retained
  old peer-only DSH records after an in-place upgrade. Companion copy-count
  gates are deleted: extra compatible copies do not establish a runtime
  failure. The native peer/runtime oracle remains the compatibility test.
- The runbook's named-project nonzero/target DSH lock check is operations-only,
  guarding a repair of the wrong project or retained old peer-only DSH records.
  Physical kit path and app-row checks that could inspect an unused copy are
  deleted; runtime resolution is authoritative. Optional project pin/inventory
  policy is not an ordinary plugin-install requirement.
- Both systems use Node 22 throughout. The pnpm 11 remedy consumes and verifies
  the actual README fence, executes it unchanged, and uses the public private
  global-dir setting established before the control. No pnpm layout inference.

CI wall time is reported per fresh global/npm/pnpm/npx/project/mixed cell.
pnpm 11 retains the default native-binding failure on each OS, then applies
the literal README config/remove/add remedy. Native fresh defaults are tested
before replay/approval fixtures are added. Hosted macOS and D-049 host proofs
must complete before acceptance/tag; local Linux results do not stand in for
those gates. No real host profile or owner process is changed by these legs.
