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
Lane/custom rows mount the own entry; web keeps its native upload service;
dashi-app keeps its provider. Existing unused external pins remain untouched.
The inert YAML reader adds js-yaml 4.3.2 and argparse (about 1.13 MB unpacked);
it never evaluates expressions or serializes user patches. plugin.cjs,
launcher.mjs and bin.mjs remain byte-identical to the base.

Every decidable failure is checked for all profiles before the first write:
manifest parsing/container shapes, bundle patches, patch parsing, row
ownership, and complete planned output. Write-time I/O can still partially
change a profile; the error names completed profiles, the possibly partial
current profile, and profiles not attempted. There is no rollback or retry.

## Guard dispositions

| Fact / former check | Disposition and adverse control |
| --- | --- |
| Valid profile path and stable product; lane product restricted | Retained. Unit invalid path/product controls. |
| Plugin already added to target profile | Retained. Missing manifest/dependency refusal; all-profile zero-write control. |
| Manifest and bundles shapes | Retained/completed in all-profile preflight. Malformed JSON, scalar/array containers, invalid bundles; valid/null controls. |
| Executing CLI anchor, floor and base availability | Removed from installer. Native alpha.1 add refuses and forced boot disables readably. Required rows must be active in the runtime oracle. |
| App bundle already supplies Sessionbus/upload row | Retained; profile-root-resolvable bundles only, never CLI lookup. Two native overlap controls demonstrate silent last-row-wins without the guard and unchanged-profile refusal with it. Unresolved native DSH bundles are not inspected. |
| Native patch dialect | Read-only declared parser, not regex. Native array, JSON/flow, ordered bundle file list; malformed/non-array refusal before any write; hostile `!!js` stays inert. |
| Unmarked mounting rows | Refuse before any profile changes; never adopt. Marked product repair remains. |
| Unmarked config-only lane defaults | Preserve byte-identically, report `kept as yours, lane default not applied`, never append a shadow. |
| Removal provenance | Remove only marked rows; unmarked matching rows refuse. No package operations, even with broken DSH/offline. |
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
  span preservation: key order, persona false IDs, flow/JSON, comments, stock
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
group, sends that PID SIGTERM and requires exit 0. Group TERM/KILL after five
seconds is cleanup only; an occupied group fails. A wrapper/inherited-pipe
negative proves parent-only stop leaks, and an outside-group PID is refused.
The original failed npx run stays in the scratch evidence.

The accepted premise packet retains the published pre.20 exact exec failure
at 121,380 ms on the writer lock; the new native exec path does no package
operations and passes. Its two-provider-copy native controls proved that
physical multiplicity itself is harmless but root hoisting can select the
plugin's stale helper for the app's row. The own subpath removes that second
owner. Neither sealed packet is modified.

CI wall time is reported per fresh global/npm/pnpm/npx/project/mixed cell.
pnpm 11 retains the default native-binding failure on each OS, then applies
the literal README config/remove/add remedy. Native fresh defaults are tested
before replay/approval fixtures are added. Hosted macOS and D-049 host proofs
must complete before acceptance/tag; local Linux results do not stand in for
those gates. No real host profile or owner process is changed by these legs.
