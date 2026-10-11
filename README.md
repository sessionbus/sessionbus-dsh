# sessionbus for DSH

`@sessionbus/dsh` connects DSH roots to sessionbus and runs daemon-managed DSH lanes.
Source and issue tracking live in
[sessionbus/sessionbus-dsh](https://github.com/sessionbus/sessionbus-dsh), and
daemon releases come from
[sessionbus/sessionbus](https://github.com/sessionbus/sessionbus/releases).
It depends on the exact `@sessionbus/kit` version `0.5.12`.
It supports DeepSeek Harness `0.2.1-alpha.2` and later; the tested version is
`0.2.1-alpha.2`. Pre.17 is a DSH flag day: keep pre.16 on older DSH hosts
until the host graph is upgraded. Sessionbus daemon v0.5.9 or newer is required.
A DSH profile must install every DSH package at one uniform DSH version; adding
one prerelease package can otherwise pull newer prereleases through DSH's caret peers.
The default grant applies only to the `sessionbus` tool through DSH's
`tools/pre-execute` waterfall; every other tool continues through native DSH
permission policy. Native messages use the producer-owned V4 kind
`plugin:sessionbus-dsh`, with `form: relay`; the sender envelope is unchanged.
The package has no TypeScript declaration surface. DSH owns V3-to-V4 log
migration; this plugin neither reads nor rewrites recorded logs.
The plugin reads the token once, deletes it from process.env, and retains it
nowhere in the plugin; DSH's immutable launch snapshot keeps it for the process
lifetime (trusted host).

## Installation

See [Installing a DSH lane host](docs/HOST-INSTALL.md) for the complete
preflight, installation, verification, and rollback procedure for
`@sessionbus/dsh` `0.1.0-pre.20` with kit `0.5.12` on DSH alpha.2.
The published dashi-app `0.2.0-alpha.1` still pins plugin pre.18; its packed
case proves coexistence, not pre.20 inside dashi. Do not run a
dashi 0.1.x release against the alpha.2 graph. The installer checks the host's
DSH floor before changing a profile; a manual `pnpm add` bypasses that guard.
pnpm is required for the prerelease floors; strict npm does not admit them.
The runbook's provider-parity step must be completed for both the lane and plain
peer profiles before either one runs a model turn.
The quick-start commands below assume pnpm's default peer auto-install. With
`auto-install-peers=false` and `strict-peer-dependencies=true`, first follow the
runbook's `pin_uploads_provider` step and add the plugin plus that exact provider
pin together; otherwise the initial add fails before the installer can run.

Create the base-only lane profile for the package-owned `sessionbus-dsh`
product with:

```sh
dsh plugin --profile sessionbus add @sessionbus/dsh && dsh plugin --profile sessionbus exec sessionbus-dsh-install
```

On a host that already uses dashi, one product can own both peers and lanes:

```sh
dsh plugin --profile sessionbus add @sessionbus/dsh && dsh plugin --profile sessionbus exec sessionbus-dsh-install --product dashi
```

In that form `SESSIONBUS_PRODUCTS` contains `dashi`, not `sessionbus-dsh`,
and the daemon maps it to `@antst/dashi-launcher`'s `dashi` bin.

Add the peer plugin to another profile, such as `web`, with:

```sh
dsh plugin --profile web add @sessionbus/dsh && dsh plugin --profile web exec sessionbus-dsh-install --product dsh web
```

The installer writes only profile-local rows and leaves an existing
`sessionbus` row's other fields unchanged while adding or updating its required
`product`. With no profile arguments it configures only the `sessionbus` lane
profile and derives product `sessionbus-dsh`. Use product `dashi` for the dashi
lane variant, `dsh` for a standalone web or custom peer profile, or another
stable operator-chosen identifier matching `^[a-z0-9][a-z0-9-]{0,31}$`.
The dashi-app bundle owns its dashi-profile row and
exact plugin dependency; do not run this installer against that profile.
Non-web profiles also receive the no-upload provider required by DSH's Session
Controller; ordinary text prompts work while file-upload receipts are rejected.
Pre.20 declares `@antst/dsh-file-uploads-none` as a required peer at
`^0.1.0 || ^0.2.0-alpha.1`, not a nested dependency. Every profile managed by
the installer gets an exact pin: the installed dashi-app's exact provider pin
when present, otherwise the highest registry release matching that range.
The app must be installed in that profile's own `node_modules` at a version
satisfying its manifest spec. All profile guards and pin lookups complete before
any profile changes; each registry query uses that profile's context and has a
60 s bound, with native errors propagated and no retry or fallback. A later
package-operation failure can leave earlier profiles changed. When the plugin
is missing, the same add saves its dependency exactly, not with a caret.
The web profile gets the package pin but never a no-upload loader row.
DSH and the Cordis/Zod companions must still be coherent as the runbook requires.
With pnpm defaults, auto-install supplies a matching missing peer under pnpm's
preferences (the `latest` tag when it satisfies, e.g. `0.1.3` today);
this is acceptable, not the strict-peer proof. The installer explicitly uses
`maxSatisfying` for its pin. With auto-install disabled and strict peers enabled,
installing without a provider fails: supply its exact pin in the same add.
Other-base helper prereleases (such as `0.2.1-alpha.x`) remain outside the range.

For the two-product form, register the daemon's `sessionbus-dsh` product as the
package's `sessionbus-dsh` bin. For the one-product form, register only `dashi`
as the `dashi` bin. Both launchers select the installed `sessionbus` profile
when given a launch token. Install the selected launcher alongside `dsh` at the
host level and put their shared `node_modules/.bin` on the daemon service's
`PATH`; the `dashi` launcher resolves its child `dsh` by name.

Without an explicit socket, peers use `$XDG_RUNTIME_DIR/sessionbus/presence.sock`
or `/tmp/sessionbus-<uid>/presence.sock`, matching the daemon's discovery rule.
Peer publication retries through the kit's reconnect path when the daemon is
unavailable, and each failed connection attempt writes one diagnostic line.
Set `SESSIONBUS_DSH_TRACE=1` to write one-line mode, readiness, root-lifecycle,
publication-gate, and socket-connection diagnostics to stderr; tracing is off
by default.

The lane advertises no native extra arguments. A non-empty `open.arguments`
request is rejected rather than silently ignored.

Uninstall without invoking DSH by running the installed bin from the profile:

```sh
pnpm --dir "$DSH_HOME/profiles/web" exec sessionbus-dsh-install --remove web
```

When the DSH CLI works, `dsh plugin --profile web exec
sessionbus-dsh-install --remove web` is the equivalent convenience form. The
installer removes the package first, then strips its managed `sessionbus` and
`file-uploads-none` rows. Managed rows carry an ownership comment; removal
refuses a matching unmarked row instead of deleting someone else's config.
Uninstall leaves the profile-owned provider and companion package pins in
place; they may serve other consumers. It never checks versions or boots DSH.

`SESSIONBUS_GROUPS` configures peer identities only. Lane membership is owned
by the daemon; the plugin accepts and does not consume groups in `session.open`.

## Per-session groups

In the web UI, dashi, or the dsh CLI, `/sessionbus-groups` shows this root's declared groups,
`/sessionbus-groups a,b` replaces them (including the profile defaults), and
`/sessionbus-groups -` restores the profile defaults. The native human command
is not a model tool or skill. Lane mode and non-root agents refuse it; lane
membership remains daemon-owned. Lists are ordered, unique, nonempty group
names without NUL/newlines. An explicitly empty declared list is not expressible:
no argument shows the list and `-` means the profile default (which may be empty).
A fork with a new session id gets defaults.

The override is stored in DSH's `sessionbus_groups` storage domain, table
`groups`, keyed by the native session id, and is read on restart/resume.
Changing groups opens the new attachment before retiring the old one, preserving
owned non-persistent lanes and the daemon-assigned private `session:<id>` group
(not part of the declared list). Old-group observers can lose visibility;
new-group observers gain it. In-flight calls on the superseded connection can
fail, and uncertain sends are never replayed. One five-second `list/self_info`
check confirms admission because kit 0.5.12's `ready` alone does not. Cancellation
is honored only before `connectPeer` is invoked, the kit's public attempt boundary.
After that, the change runs to completion even if the command is cancelled.

A terminal candidate rejection keeps the old attachment and stored list, reporting
the daemon's reason when the kit exposes it. If the identity check fails or times
out, nothing is detached: the command reports "change in progress;
`/sessionbus-groups` with no argument shows the result". The serialized operation waits for one of
two terminal signals: the old peer closes as superseded (-32012), confirming
admission, or the candidate closes with an error, rejecting the change. Transport
loss on the candidate uses the kit's existing reconnect, not a plugin retry. If
neither terminal signal arrives, the operation remains pending under those same
kit close/reconnect semantics; there is no swap deadline or polling loop. Show
remains available; later changes and title updates wait. A failure after the
progress response has one sanitized `sessionbus:` stderr diagnostic.
A terminal rejection of the old peer's reconnect also ends the pending change
and unpublishes it with that diagnostic. A second change queued behind a pending
one has no progress response of its own; it checks cancellation only once the
first operation settles.

A saving failure after a live identity change reports
`live groups changed, saving failed: <native error>; restart will use the prior value`;
the new live identity remains, and the prior durable value is unchanged.
Saving a same-list set/reset can fail without changing the identity; that message
says `live groups unchanged` instead. A narrow known limitation remains: after a
daemon outage, an old peer's reconnect hello already in flight can race shutdown
after replacement. A `sessionbus: superseded` diagnostic can mean the group change
lost to that reconnect; stable group removal is not claimed in that window.
No extra recovery/replay mechanism is added.
Native domain `put` does not validate; this plugin validates before every write.
Invalid stored values therefore require external damage in this release and
refuse activation at the next open with the native table/key diagnostic.
Stop the affected profile, preserve the offending record for diagnosis, and
delete only `$DSH_HOME/storages/sessionbus_groups/groups/<native-session-id>.json`
before restarting to use defaults (adjust the root if your storage-json row
overrides DSH's default). Native storage-json treats malformed or foreign-version
documents as absent; this is its separate native boundary, not plugin validation.

Pre.19 requires the native `commands` and `storageDomain` services in every mode;
lane profiles must carry dsh-base's rows (the shipped profiles do). It adds those
DSH peers and a Zod peer. Follow the
runbook to pin Zod to the version resolved by `dsh-storage-domain` in the executing
CLI closure; the plugin and that producer must resolve the same Zod name/version.
Separate physical copies are valid: native domain open calls the supplied
schema's parser rather than checking object identity. Paths and unrelated Zod
majors are reported, not rewritten.

## Run results

A DSH error before its input commit returns `failed`, native stop reason `error`, and result `<code>: <message>` verbatim from the durable `turn/end`.

See [Lane without a TUI](docs/LANE-WITHOUT-TUI.md) for the daemon launch contract.
