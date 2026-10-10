# Changelog

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
