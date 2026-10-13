# sessionbus for DSH

`@sessionbus/dsh` connects DSH roots to sessionbus and runs daemon-managed DSH lanes.
Source and issue tracking live in
[sessionbus/sessionbus-dsh](https://github.com/sessionbus/sessionbus-dsh), and
daemon releases come from
[sessionbus/sessionbus](https://github.com/sessionbus/sessionbus/releases).
It depends on the exact `@sessionbus/kit` version `0.5.12`.
The installer reads configuration with `js-yaml@4.3.2`; it never executes
`!!js` expressions or rewrites unrelated configuration.
It supports DeepSeek Harness `0.2.1-alpha.2` and later; the tested version is
`0.2.1-alpha.2`. Pre.17 is a DSH flag day: keep pre.16 on older DSH hosts
until the host graph is upgraded. Sessionbus daemon v0.5.9 or newer is required.
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

Have DSH `0.2.1-alpha.2` or newer on `PATH`. Global npm, global pnpm, npx and
project installations are supported; choose the intended `dsh` on `PATH` when
several installs coexist. DSH's own `plugin` command manages the profile's
packages (and requires pnpm as DSH documents), regardless of how DSH was installed.
With npx, prefix each command below with the same npx DSH invocation.
The package manager's global binaries must already be on PATH.
Install DSH itself according to DSH's documentation; this section installs the plugin.

### DSH installed globally with pnpm 11

The default pnpm 11 global virtual store can prevent DSH's native loader
from finding its installed platform binding. The error includes:

```text
No usable native binding found for node-addon-require-builtin-darwin-arm64
```

The suffix identifies your platform. This DSH/pnpm layout issue is tracked
in [Discussion 9432](https://github.com/deepseek-ai/deepseek-harness/discussions/9432).
Disable the global virtual store and reinstall DSH:

<!-- install:pnpm-global-remedy -->
```sh
pnpm config set --global --json enableGlobalVirtualStore false
pnpm remove -g @deepseek-ai/dsh && pnpm add -g @deepseek-ai/dsh@0.2.1-alpha.2
```

The setting affects subsequent installations; it does not migrate existing
installations by itself.

### Configure the profile

Configure the lane profile for the `sessionbus-dsh` product:

```sh
dsh plugin --profile sessionbus add --save-exact @sessionbus/dsh@0.1.4
dsh plugin --profile sessionbus exec sessionbus-dsh-install
```

On a host that already uses dashi, one product can own both peers and lanes:

```sh
dsh plugin --profile sessionbus add --save-exact @sessionbus/dsh@0.1.4
dsh plugin --profile sessionbus exec sessionbus-dsh-install --product dashi
```

In that form `SESSIONBUS_PRODUCTS` contains `dashi`, not `sessionbus-dsh`,
and the daemon maps it to `@antst/dashi-launcher`'s `dashi` bin.

Add the peer plugin to another profile, such as `web`, with:

```sh
dsh plugin --profile web add --save-exact @sessionbus/dsh@0.1.4
dsh plugin --profile web exec sessionbus-dsh-install --product dsh web
```

DSH creates fresh profiles with `nodeLinker: hoisted` and
`autoInstallPeers: false`; these are DSH's defaults, not pnpm's global defaults.
The installer does not add or remove packages or start DSH. It changes only
its profile entries and the lane's base-bundle declaration, and leaves an existing
marked peer `sessionbus` row's other fields unchanged while adding or updating its required
`product`. With no profile arguments it configures only the `sessionbus` lane
profile and derives product `sessionbus-dsh`. Use product `dashi` for the dashi
lane variant, `dsh` for a standalone web or custom peer profile, or another
stable operator-chosen identifier matching `^[a-z0-9][a-z0-9-]{0,31}$`.
The dashi-app bundle owns its dashi-profile row and
exact plugin dependency; do not run this installer against that profile.
Non-web profiles also receive the no-upload provider required by DSH's Session
Controller; ordinary text prompts work while file-upload receipts are rejected.
The no-upload row uses this package's separate `@sessionbus/dsh/file-uploads-none`
entry. There is no dependency or peer on `@antst/dsh-file-uploads-none`; web
receives no no-upload row, and dashi-app keeps ownership of its own provider.
For a lane or web profile upgraded in place in a Linux project, re-running
the installer upgrades its marked pre.20 entries. Any old provider pin
is left untouched and reported, not removed. An unmarked plugin or upload row belongs to
the user: remove it and rerun, or keep that profile outside the installer.
Removing the marker from a config-only lane default makes it yours: the installer
keeps that row unchanged, prints `kept as yours, lane default not applied`, and
does not append a shadowing default. A marked lane-default row belongs to the
installer and is replaced whole; in a marked peer `sessionbus` row only `product`
is repaired and its other fields are kept. Unrelated owner rows, comments and expressions
remain byte-identical, including the lane's provider and default-model rows.
All structural and row-ownership guards complete before any profile changes.
The installer supports block-form YAML lists and DSH's empty `[]` template,
including comments, a UTF-8 BOM and CRLF line endings. Convert a nonempty
flow/JSON top-level list to block form, or keep that profile outside the installer.
An owner-only indentless list is kept unchanged; an indentless list containing
installer-marked rows refuses editing. Profile files must be valid UTF-8.
Each changed file is replaced atomically, preserving its existing mode exactly
and replacing a symlink's referent without replacing the link; the containing
directory must be writable. Unlike DSH's
native settings writer, this does not force 0600 or replace symlinks themselves.
Ownership by another user, hard links, extended attributes and ACLs are not
preserved. A later filesystem write failure can still leave earlier files or
profiles changed; it cannot leave a half-written file. Removal strips only
marked rows and also keeps the owner's unmarked config-only rows unchanged.
Before replacing a file, the installer compares it with the bytes it read at
the start and refuses if they differ. A change in the instant between that
comparison and the rename is not detected. Rerunning is safe because installation
is idempotent.

The plugin is tested with DSH's profile defaults (`nodeLinker: hoisted`,
`autoInstallPeers: false`); its DSH peers come from the DSH installation,
not packages added to the profile.
`dsh plugin add` prints pnpm missing-peer warnings for the DSH packages and
exits 0; this is expected because the executing DSH supplies those peers.

DSH enforces the supported version, including the refusal
`Plugin @sessionbus/dsh@0.1.4 is incompatible with dsh 0.2.1-alpha.1`.
Do not grant a version exemption to bypass it. A model provider must already be
configured and registered in each profile that will run turns; see the operations
runbook's provider-parity step when upgrading an existing project.

For the two-product form, register the daemon's `sessionbus-dsh` product as the
package's `sessionbus-dsh` bin. For the one-product form, register only `dashi`
as the `dashi` bin. Both launchers select the installed `sessionbus` profile
when given a launch token. These two profile commands do
not deploy the daemon or configure its products. Its service `PATH` must resolve
the selected launcher and its child `dsh`; they need not share a directory.
An ephemeral npx cache is not a persistent daemon-product deployment. The
operator owns that setup, independently of the login shell.

[Upgrading a project DSH install in place](docs/HOST-INSTALL.md) is an operations
procedure for a long-lived pnpm project, not a prerequisite for ordinary plugin
installation. It addresses that project's upgrade history, not global or fresh
installs.

Without an explicit socket, peers use `$XDG_RUNTIME_DIR/sessionbus/presence.sock`
or `/tmp/sessionbus-<uid>/presence.sock`, matching the daemon's discovery rule.
Peer publication retries through the kit's reconnect path when the daemon is
unavailable. In peer mode non-fatal diagnostics use DSH's named
`sessionbus-dsh` logger at error severity, never the running host's terminal.
Fatal startup failures also print their one-line reason to stderr before exit 1,
so a failed launch explains why it ended. Equal socket errors are
logged once per outage and again after a successful connection and later
failure; reconnect timing is unchanged. The host owns log presentation.
`/sessionbus-groups` adds the last connection attempt's error when it failed;
it makes no bus call and does not wait or promise current admission.
Set `SESSIONBUS_DSH_TRACE=1` for mode, readiness, root-lifecycle,
publication-gate and socket-connection traces: debug logs in peer mode,
stderr in daemon-managed lane mode. Tracing is off by default, and lane
diagnostics continue to use stderr owned by the daemon.

The lane advertises no native extra arguments. A non-empty `open.arguments`
request is rejected rather than silently ignored.
`open.model` and `open.reasoning_effort` apply to that lane's session only, never the profile default; effort alone keeps the session's current model, including on resume.
Both options must be non-empty strings; an empty model is an error, not a request to use the current model. Models are validated by the provider adapter: an unknown provider fails at open, but a mistyped model accepted by the adapter can fail at the first model request instead.
For fresh lanes, model/effort and permission options are checked before creating
the session; effort alone uses the profile's current default. The session's actual
selection is checked again before committing it. A default or capability change,
cancellation, native setup or storage error between these checks can still leave
a created session behind. The plugin does not archive
or delete DSH's sessions. Resume creates no new session, but its rename can
remain if a later option check fails. A directory left without a log is invisible to DSH's
session list and cannot be resumed by id; DSH does not automatically remove it.
A refused open is answered by `spawn_failed` with DSH's reason; `exit_code` in
its data is the worker's shutdown status after the daemon stopped it and says
nothing about the refusal.
With daemon v0.5.12 the refusal tail contains captured worker stderr followed
by the reason. This plugin no longer prints its expected connection-close warning
after refusing Open. With diagnostic tracing off, the tail is the reason alone
unless Node, DSH, another loaded plugin or the kit also writes to stderr.

A turn ending with native reason `error` includes DSH's own code and message
in its collected result, after any partial assistant text. Other failed stop
reasons do not carry that diagnostic. In both fields, C0/C1 controls, DEL,
U+2028 and U+2029 become spaces; the code is bounded at 128 UTF-8 bytes and
the message at 1024, including a visible truncation mark. This is line discipline,
not secrecy filtering. Only these two fields are copied, not a separate stack,
cause object or other fields; DSH's message can itself contain cause text.
The plugin adds no credential or environment data and makes no promise to
remove sensitive text a provider put in its message.
The kit's 1 MiB frame limit still applies to the whole result. Assistant text
is not truncated here; a result exceeding that limit becomes an unavailable
record with the kit's reason `native result failed validation`.

Remove the rows, then let DSH remove the package:

```sh
dsh plugin --profile web exec sessionbus-dsh-install --remove web
dsh plugin --profile web remove @sessionbus/dsh
```

If DSH is broken, invoke the already-installed `sessionbus-dsh-install` bin
directly with `--remove web` to remove the rows without booting or version-checking
DSH. Managed rows carry an ownership comment; removal refuses an unmarked
matching mounting row. The installer never removes packages; existing package
pins are left for their owners.

`SESSIONBUS_GROUPS` configures peer identities only. Lane membership is owned
by the daemon; the plugin accepts and does not consume groups in `session.open`.

## Message receipts

A send returns a receipt for each recipient. `injected` means the message was
admitted into the recipient's inbox, not that it was read or answered.
In an interactive DSH or dashi session, a message delivered while the recipient's
turn is running is taken at that turn's next step. If the turn ends in an error
or is cancelled before taking it, the message stays waiting: nothing starts a
new turn for it until another message arrives or the user types a prompt. You
can therefore see a delivered message with no answer, then both messages appear
when the next message or prompt wakes the session. Send another message or
prompt that session; do not resend the already-admitted message just because
it has no answer. Fewer error-ended turns (for example a provider timeout that
fits how long your model takes to answer) make this less frequent, but do not
guarantee an answer.
DSH has discussions about [error-ended turns](https://github.com/deepseek-ai/deepseek-harness/discussions/4952)
and [retained input after cancellation](https://github.com/deepseek-ai/deepseek-harness/discussions/4832).

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
progress response has one flattened `sessionbus:` error diagnostic in DSH's logger.
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
DSH peers and a Zod peer. Native runtime resolution supplies those peers; ordinary
installation does not require profile-local Cordis or Zod pins. The plugin and
storage-domain producer must resolve compatible Zod schemas through their own
package resolution.
Separate physical copies are valid: native domain open calls the supplied
schema's parser rather than checking object identity. Paths and unrelated Zod
majors are reported, not rewritten.

## Run results

Both early and user-message-bound native errors return `failed`, native stop
reason `error`, and the two-field diagnostic described above; any partial
assistant text is retained and separated from it.

See [Lane without a TUI](docs/LANE-WITHOUT-TUI.md) for the daemon launch contract.
