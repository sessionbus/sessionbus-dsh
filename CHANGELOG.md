# Changelog

## 0.1.5 — 2026-10-15

- Let peers activate without the Session Controller, including stock acp, headless and sdk profiles. Keep the controller as a lane-only native dependency: absence at host readiness prints one fatal reason and exits 1; dependency loss retains native teardown and the existing worker exit behavior. No polling, retry or extra controller row is added.
- Cancel stale async activation when native dependencies are replaced during imports. This pre-existing race is also present in 0.1.4: an old import could start a second worker or exit the replacement host after failing.
- Move maintained native selectors to DSH alpha.3, retain the alpha.2 support floor, and clarify terminal versus redirected/service diagnostic visibility.

## 0.1.4 — 2026-10-13

- Route non-fatal peer diagnostics to DSH's named logger at error severity, never the running interactive host's terminal; non-terminal stderr keeps all diagnostics and opt-in trace. Fatal startup failures keep their one stderr reason before exit 1 and also log it; opt-in traces use debug, raising only that named logger's level. Lane stderr and exit behavior are unchanged.
- Log equal socket errors once per outage for each session, also to non-terminal stderr for service visibility, with a new diagnostic after recovery and another failure. Keep the kit's two-second reconnect. `/sessionbus-groups` shows a failed last connection attempt without calling the bus or waiting; it is not a current-admission guarantee.

## 0.1.3 — 2026-10-13

- Explain that `injected` is admission, not reading or a reply, and that input admitted during a turn can remain waiting when that turn errors or is cancelled; another message or typed prompt wakes it. No runtime or receipt behavior changes.
- Pin the known DSH pending-wake gap and ordinary wake controls using a private home, released private daemon and controllable adapter. These are assertions of today's gap, not desired behavior.

## 0.1.2 — 2026-10-12

- Suppress the expected unopened-worker connection-close warning after this plugin's own Open callback refuses. Other unopened losses still warn; the native refusal, shutdown status and kit are unchanged (W-134).
- Keep one profile-only host-proof runner with an explicit package operation (archive upgrade, registry re-pin or none) and a separate explicit choice to run acceptance. Call-time disk captures, native lane predicates and replay of a public recorded fixture replace one-off proof scripts. It does not update an owner's personal project or retry a stopped proof.

## 0.1.1 — 2026-10-12

- Collected bound-turn failures now retain native code and message; both early and bound native errors use the same formatter, keeping partial assistant text clearly separated. Both fields replace C0/C1 controls, DEL and Unicode line/paragraph separators with spaces; code is bounded at 128 and message at 1024 UTF-8 bytes including a visible truncation mark. Other native error text is not redacted. No separate stack, cause object or extra fields are copied, although the native message can contain cause text. Assistant text is not truncated; the kit's 1 MiB frame limit can make a result unavailable with `native result failed validation`. A settled terminal cannot be overwritten by stale or duplicate events (W-128).
- Validate session-independent Open options before fresh session creation, including the three selector methods, permission presets and effort-only validation against the public current profile default; the serializer's post-create selection check remains commit-time truth. No-option create/resume cancellation behavior is unchanged. No session archive, deletion, retry, worker exit-code change or profile-default write is added. The window between validation and setup can still leave native session residue; refusal code/reason, not shutdown exit status, describes a refused Open.
- Bind releases to the accepted archive checksum in the annotated plain-version tag (D-052). Require exactly one 64-hex token in the strict archive line and refuse carriage returns, nonplain/mismatched versions and changed packed bytes before publication. Pack with npm 11.12.1 and publish that archive with trusted-publisher provenance to latest. An existing registry version must have the same archive integrity; auth/network errors are not absence. Create the GitHub release only after the registry archive is published or verified; an existing GitHub release is left unchanged on rerun.
- Strengthen hosted proof with the actual own-upload provider plus native refusal and the real stock-provider negative control; upgrade published 0.1.0 in place on maintained global-install rows with owner settings preserved. The harness captures source hashes, argv/exit and wire requests/results in its local evidence directory; hosted logs expose case results, not those unretained files. Drop the one-off mac side-branch procedure after merge; the maintained global matrix owns that regression.

## 0.1.0 — 2026-10-11

- Lane `open.model` and `open.reasoning_effort` now select only that native session, including effort-only resume; they never save the profile default (W-126). Validate exact adapter routes through the public LLM resolver, accepting valid unadvertised models and refusing unsupported effort natively. Keep controller-owned creation/presets/resume and reuse its session-only selection methods through the explicitly approved alpha.2 non-public holder; absence fails only an option-bearing open, never falls back to the profile-saving GUI API. Cancellation is honored before the native selection commit, without replay or undo.
- Publish plain version 0.1.0 to `latest` (D-051), superseding the prerelease line without moving published versions or tags. The existing release workflow already selects `latest` and creates a non-prerelease GitHub release for a plain version.
- Core resolution replaces the GUI catalog gate: an unknown provider or adapter-rejected model fails at open; a mistyped model id accepted by a permissive adapter is not refused at open and fails at the first request if the backend rejects it. Empty or non-string model/effort values are explicit errors; an empty model no longer silently falls back to the current model. Missing-seam version metadata is best-effort and reports `unknown version` without exposing resolution paths.

- Make installation two native DSH commands on any supported DSH install. DSH owns packages and compatibility; the installer owns rows, never queries a registry, nests a package-manager lock or boots DSH. Removal is rows-only too; package removal is a separate DSH command. Existing package pins and manifest fields are preserved (W-125).
- Ship the separate `@sessionbus/dsh/file-uploads-none` entry instead of a dependency or peer on the external upload-provider package. Its 308-byte service implementation is copied unchanged from our helper's 0.1.3 / 0.2.0-alpha.1 entry; service order and native upload refusal are unchanged. Marked lane/custom rows upgrade to the subpath; old exact provider pins remain unused by the installer and are reported, never deleted. Web has no no-upload row; dashi-app retains ownership of its provider.
- Retain the profile-root app-row conflict guard: alpha.2 otherwise silently lets later rows replace the app's Sessionbus identity or upload provider. Unmarked plugin/upload mounts refuse before any profile changes; unmarked config-only lane defaults remain the owner's without shadow rows. Read patches with the exact declared js-yaml 4.3.2 dependency, with inert !!js scalars and source-position edits of marked rows only; every other byte stays intact. This adds js-yaml and argparse (about 1.13 MB unpacked), not a process or service. W-125 left plugin runtime, launcher and bin unchanged; W-126 changes the option-bearing lane-open runtime as described above. Universal hosted and real installed-host acceptance are required before the tag.
- Replace changed files atomically while preserving the existing mode and symlink referent. Owner config-only rows also survive removal. Cross-file I/O failure can still leave earlier writes completed; ownership by another user, hard links, extended attributes and ACLs are not preserved.

## 0.1.0-pre.20 — 2026-10-11

- Move `@antst/dsh-file-uploads-none` from a dependency to a required peer at the unchanged `^0.1.0 || ^0.2.0-alpha.1` range. The installer exact-pins the profile-owned provider in lane, web and custom profiles, using an installed dashi-app's exact dependency when present or the highest matching registry release otherwise. Web never gains a no-upload row; uninstall leaves provider/companion pins intact. Other-base helper prereleases remain excluded. Plugin runtime, launchers and wire behavior are unchanged (W-122).
- Prove ordinary pre.19 lane upgrade and standalone web each have one physical/lock provider, strict missing-peer refusal with auto-install disabled, and published-dashi coexistence without a one-provider claim. The dashi single-provider in-place proof follows its pre.20 re-pin; real lane/web host acceptance is required before this tag.
- Preflight all profiles before writing, query each registry in its own context with a 60 s metadata-only bound, and refuse missing or version-mismatched profile-local dashi-app ownership without fallback. A newly added plugin is saved exactly rather than with a caret. The host-install runbook intentionally pins the provider in the host project as well as standalone profiles.

## 0.1.0-pre.19 — 2026-10-11

- Add the native human-only `/sessionbus-groups` command: show, replace with a comma list, or reset with `-` (no explicitly empty override). Overrides persist per native root in DSH storage; forks use defaults and lanes refuse the command. Overlapping attachment replacement preserves non-persistent lane ownership, the private self group, and later delivery. Cancellation ends before the connection attempt; a failed five-second identity check reports change in progress without teardown, awaiting old-peer supersession or candidate terminal rejection. If neither arrives, existing kit close/reconnect semantics apply, with no swap deadline or polling. Post-admission saving failures preserve live groups and the prior stored value; uncertain requests are never replayed. An old reconnect hello already in flight during an outage remains a known shutdown race (W-120).
- Add commands/storage-domain DSH peers at the existing alpha.2 floor and Zod as a peer at the storage-domain producer's range. Installation checks derive its exact pin from that producer and require matching name/version, reporting separate paths without rewriting unrelated Zod majors. Real installed-host acceptance remains pending the coordinated host-writer slot.

## 0.1.0-pre.18 — 2026-10-10

- Widen @antst/dsh-file-uploads-none to `^0.1.0 || ^0.2.0-alpha.1` so profiles pinning 0.2.0-alpha.1 share one provider copy while 0.1.3 remains supported (W-119). Stable 0.2.x is admitted; a prerelease on a different base, such as 0.2.1-alpha.x, is not and needs a later range change. No plugin runtime or wire behavior changes.

## 0.1.0-pre.17 — 2026-10-10

- DSH flag day: require DSH 0.2.1-alpha.2 or newer and Sessionbus daemon v0.5.9 or newer (kit remains 0.5.12). Upgrade the host DSH graph first; the installer refuses below-floor hosts before changing a profile. Manual `pnpm add` bypasses this guard. Keep pre.16 on DSH 0.1.x until the host upgrade.
- Attribute native relay messages to the V4 producer kind `plugin:sessionbus-dsh`; the sender envelope, admission receipts, active delivery and idle wake are unchanged (W-115).
- The dashi packed acceptance proof was NOT RUN: dashi 0.2.0-alpha.1 is not released (W-114). CI visibly reports this pending case; lane, web and real-Agent proofs remain mandatory. Setting `DASHI_APP_VERSION` makes the matching dashi proof mandatory.
- Re-pin the host runbook and packed proof to the alpha.2 CLI-derived companion minima; old DSH legs are no longer supported.
- Preserve the lane's deployment persona under alpha.2's `personaPrefix` key; only provider/model prompt variables remain supported, so native working-directory tools replace the retired `{{cwd}}` interpolation. Re-run the installer after upgrading to rewrite the pre.16 lane patch.

## 0.1.0-pre.16 — 2026-10-07

- Pin `@sessionbus/kit` 0.5.12, the published kit for Sessionbus v0.5.12. A failed lane interrupt callback now answers Internal ("product interrupt failed"), and a later interrupt calls the product again; before, the caller got a false success and further interrupts of that run were not forwarded. Successful and in-flight duplicate interrupts are unchanged. A superseded interactive peer now ends without waiting for its courtesy reply write, and a failed write is handled; with kit 0.5.9 that failure was an unhandled promise rejection, which terminates a Node process under default rejection handling.

## 0.1.0-pre.15 — 2026-09-29

- Require Sessionbus v0.5.9, a flag day: the unreleased lane policy field `idle_message` is removed from the tool schema and rejected as an argument, and message wake is mandatory. Upgrade the daemons and hub first, including the offline lane-row edit in the [core v0.5.8 release notes](https://github.com/sessionbus/sessionbus/releases/tag/v0.5.8).
- Pin `@sessionbus/kit` 0.5.9, the published kit for Sessionbus v0.5.9 (0.5.8 was never published).
- docs/HOST-INSTALL.md targets this release, kit 0.5.9, the Sessionbus v0.5.9 daemon (revision b4855293e9296e6544f0c0c27a755dfd401f56b9) and an SDK 0.5.9 or later controller. The dashi profile needs a Dashi release that pins this plugin.

## 0.1.0-pre.14 — 2026-09-21

- Replace the `/sessionbus` list command with a user- and model-invocable DSH skill so `/sessionbus <text>` stays the user's message and receives canonical Sessionbus guidance (W-099).
- Wake idle interactive roots through DSH steering, carry the canonical sender envelope on delivered input, and advertise daemon-owned message-triggered lane runs with boundary-safe native admission (W-100).
- Keep peer publication on the kit reconnect path after a failed daemon connection, with one diagnostic line per attempt (W-102).
- Reject unsupported non-empty lane `open.arguments` instead of ignoring them (W-102).
- Grant only the `sessionbus` tool by default; every other tool stays under native DSH permission policy (W-102).
- Prove daemon-generated `trace: content` copies wake idle dashi parents and retain the ordinary sender envelope (W-102).
- Pin the successor Sessionbus kit and make the lane `not_running` boundary proof unconditional in every packed DSH leg (W-103).

## 0.1.0-pre.13 — 2026-09-21

- Depend on @antst/dsh-file-uploads-none ^0.1.0 so stable dashi profiles share one provider copy; the host runbook targets dashi 0.1.0 and this plugin release (W-098).

## 0.1.0-pre.12 — 2026-09-20

- Opt-in diagnostics: SESSIONBUS_DSH_TRACE=1 prints the plugin's mode, readiness, root lifecycle, publication gate and socket connection on stderr; the host runbook's web-peer check uses a same-group observer and drives the idle peer with one prompt (W-095).

## 0.1.0-pre.11 — 2026-09-20

- Peer mode observes DSH root creation globally (web-client roots publish), reports any publication failure on stderr, and discovers the daemon socket the way the daemon does (SESSIONBUS_SOCKET, else XDG_RUNTIME_DIR, else /tmp/sessionbus-<uid>) (W-093).

## 0.1.0-pre.10 — 2026-09-20

- The installer refuses to add a row that one of the profile's bundles already provides (dashi-app 0.1.0-alpha.20 ships the dashi row) and marks the rows it writes; `--remove` deletes only marked rows (W-090).
- docs/HOST-INSTALL.md: no installer run on the dashi profile from dashi-app 0.1.0-alpha.20 on.

## 0.1.0-pre.9 — 2026-09-20

- Peer mode publishes only with the native session id, updates titles through the kit's rehello(signal, name, info), and replaces the identity when the durable session id changes; the fake daemon enforces the daemon's identity rules (W-089).

## 0.1.0-pre.8 — 2026-09-20

- The installer merges into an existing lane profile manifest and preserves every other dependency, bundle and field (W-088).
- docs/HOST-INSTALL.md: check loops stop at the first failure; host assertions are the lockfile, the executing install anchor, the headless boot and the healed fallback closure; the hoisted top-level projection is reported, not asserted.

## 0.1.0-pre.7 — 2026-09-20

- Run input text is taken from the kit's run seed ({text} or {delivery.body}) and stored as a plain text part; proofs assert the exact durable text on every DSH version (W-087).
- A turn that fails before the input commit ends the run as failed with DSH's error code and message instead of an unavailable record (W-086).
- docs/HOST-INSTALL.md: physical graph checks (top-level projection and healed profile fallback), one-boot reconciliation, provider parity with an offline registration check, and the rule that provider plugins must be the release built for the host's DSH floor (dsh-codex 0.3.0 for openai-codex on 0.1.5-rc.2).

## 0.1.0-pre.6 — 2026-09-20

- Supersedes 0.1.0-pre.5, which was tagged but never published to npm (release runner npm too old for trusted publishing; W-085).
- A host with dashi installed may register `dashi` as the only product: `sessionbus-dsh-install --product dashi` for the lane profile (W-084).
- Release workflow publishes through npm trusted publishing on npm 11.5+ (W-085).

## 0.1.0-pre.5 — 2026-09-20

- A host with dashi installed may register `dashi` as the only product: `sessionbus-dsh-install --product dashi` for the lane profile (W-084).
- docs/HOST-INSTALL.md: the graph repair is one helper based on exact pins of stale peer-only DSH records; zero DSH records is coherent for lane and web profiles.

## 0.1.0-pre.4 — 2026-09-19

- Supersedes 0.1.0-pre.3, which was tagged but never published to npm; do not reference it.
- The `sessionbus` tool is permitted by default in every composition (lane profile, dashi row, web or custom peer) through DSH's tools/pre-execute decision; no opt-out; a session without comms is an ordinary launch without the plugin (W-081).
- @sessionbus/kit 0.5.5: accepts the daemon's optional `policy.trace` on spawn/resume responses (W-083).
- docs/HOST-INSTALL.md: the host install runbook (daemon service PATH, product registration, in-place profile upgrade, rollback).

## 0.1.0-pre.3 — 2026-09-19

- The `sessionbus` tool is permitted by default in every composition (lane profile, dashi row, web or custom peer) through DSH's tools/pre-execute decision; no opt-out; a session without comms is an ordinary launch without the plugin (W-081).
- docs/HOST-INSTALL.md: the host install runbook (dev1 handoff), with the daemon service PATH, product registration, in-place profile upgrade and rollback steps.

## 0.1.0-pre.2 — 2026-09-19

- DSH compatibility floor: every DSH peer is `>=0.1.5-rc.2`; tested on 0.1.5-rc.2, 0.1.6-alpha.1 and 0.1.6-alpha.2.
- Package-owned `sessionbus-dsh` launcher; the plugin row's `product` field is required and written by the installer.
- `sessionbus-dsh-install --remove <profile>` uninstalls without booting DSH.
- Lane mode never reads SESSIONBUS_GROUPS; peer mode uses config groups, else the environment.
- Depends on the published `@antst/dsh-file-uploads-none@0.1.0-alpha.18`.

## 0.1.0-pre.1

- Initial preview of Sessionbus peer and lane modes, validated with DSH
  0.1.5-rc.2 and 0.1.6-alpha.2.
