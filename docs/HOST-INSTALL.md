# Operations: upgrading a project DSH install in place

This is an operations procedure for upgrading DSH in a long-lived **pnpm
project** and preserving its existing profiles and daemon deployment. It is
not the ordinary plugin install path; use the two commands in the
[README](../README.md#installation) for global npm/pnpm, npx or fresh project
installs. Name the project and the `dsh` you intend to upgrade; other DSH
installs may coexist and are not scanned, counted or changed. Stale peer-only
lock records, snapshots and the optional project-local companion pins below
belong to this operations procedure, not to DSH's plugin requirements.

The Linux/systemd user-service procedure uses `umka-dev1` as a worked example,
not a requirement for an installation layout or operating system. Its GNU
tools and `/proc` checks are Linux-specific. Run it as the ordinary account returned by `id -un`, never with
`sudo`, and refer to its home as `$HOME` in commands. On `umka-dev1` that
account is `antst` and its home is `/home/antst`; earlier references to `pdev`
were wrong. The target set is DSH `0.2.1-alpha.2`, `@antst/dashi-launcher`
`0.2.0-alpha.2`, `@antst/dashi-app` `0.2.0-alpha.2`, `@sessionbus/dsh`
`0.1.3`, `@sessionbus/kit` `0.5.12`, and the Sessionbus daemon
`v0.5.9` or newer. The dsh host runs `v0.5.12` at revision
`fd85d7ee3a19735b2712fbbacdef30d62720cd5b`; v0.5.12 is not a higher host minimum.
The published dashi target pins plugin pre.20 and its own exact upload provider.
The 0.1.3 candidate beside that pin is a labelled coexistence case, not a
one-plugin-copy claim. Upload acceptance observes the mounted row and the
registered service, never a count of physical packages or lock records.
Use the plugin source at
[sessionbus/sessionbus-dsh](https://github.com/sessionbus/sessionbus-dsh) and
daemon release artifacts from
[sessionbus/sessionbus](https://github.com/sessionbus/sessionbus/releases).
Earlier Sessionbus-dsh prereleases are superseded; pre.3 and pre.5 were never
published. Do not continue past a failed assertion.

The blocks assume one Bash session with plain `set -eu` enabled before the
first block. `pipefail` is not required; the package-record, pnpm-output and
credential-presence assertions also work if it is inherited. This is not a
blanket guarantee for unrelated pipelines.

Pre.17 is a DSH flag day: upgrade the project runtime to alpha.2 before adding
this plugin. DSH's native package command rejects incompatible declared peers;
the rows-only installer neither guesses the executing CLI's layout nor boots
DSH to check it. Pre.16 keeps running on the old graph until the upgrade.
DSH owns recorded-log V3-to-V4 migration; loading old logs on alpha.2 is not
tested here. The native new-write lane/web/Agent packed cases are mandatory;
the published dashi case reports the versions and actual active resolution.

None of the commands below prints `SESSIONBUS_LAUNCH_TOKEN`,
`SESSIONBUS_GROUPS`, the local key, or the federation secret. The only
environment assignments intentionally displayed are the daemon's filtered
`PATH=` and `SESSIONBUS_PRODUCTS=` lines.

### Release history, not install targets

Dashi alpha.18 lacked the `sessionbus` profile row and launcher token path.
Alpha.19 was partially published, alpha.20 carried empty application
tarballs, and alpha.21 repaired the release pipeline. Dashi 0.1.0 was the
first stable cut. They are historical releases, not install targets for this
runbook.
The previous targets were dashi 0.1.2/0.1.3, plugin pre.15/pre.16, kit
0.5.9/0.5.12 and DSH 0.1.5-rc.2. Earlier umka observations were DSH
0.1.2-rc.1, dashi alpha.17 and plugin pre.1; the old graph-repair reproduction
had 233 records (25 old, 208 target), then 231 target records, and an optional
physical reconciliation moved 214 old entries to 231. These counts are
historical inventory, not alpha.2 expected counts. The dsh-codex 0.3.0
example was verified on the old DSH line only; it is not an alpha.2 provider target.
The current dsh and umka sessionbus/web baseline is plugin pre.16 on kit 0.5.12
with DSH 0.1.5-rc.2. Inventory again before an authorised host upgrade.

Run these exact probes immediately before starting:

```sh
npm view @antst/dashi@0.2.0-alpha.2 version && npm view @antst/dashi-app@0.2.0-alpha.2 version
npm view @antst/dashi-launcher@0.2.0-alpha.2 version && npm view @antst/dsh-file-uploads-none@0.2.0-alpha.2 version
npm view @sessionbus/dsh@0.1.3 version && npm view @sessionbus/kit@0.5.12 version
```

Expected output, in order:

```text
0.2.0-alpha.2
0.2.0-alpha.2
0.2.0-alpha.2
0.2.0-alpha.2
0.1.3
0.5.12
```

An `E404` means stop; it is not permission to substitute a preview URL or a
different version. A freshly published version can resolve before all four
dashi tarballs propagate. HEAD every tarball until each returns HTTP 200
before the first profile add:

```sh
for package in \
  @antst/dashi@0.2.0-alpha.2 \
  @antst/dashi-app@0.2.0-alpha.2 \
  @antst/dashi-launcher@0.2.0-alpha.2 \
  @antst/dsh-file-uploads-none@0.2.0-alpha.2; do
  tarball=$(npm view "$package" dist.tarball)
  ready=
  for attempt in $(seq 1 60); do
    status=$(curl --head --location --silent --show-error --output /dev/null --write-out '%{http_code}' "$tarball" || true)
    if [ "$status" = 200 ]; then ready=1; break; fi
    sleep 5
  done
  test "$ready" = 1
  printf '%s tarball HTTP 200\n' "$package"
done
```

Expected output is four `tarball HTTP 200` lines. Any other final status stops
the run before package metadata or the physical graph can be changed.

## 1. Preflight inventory

Use one shell for the whole procedure so the paths and rollback record remain
authoritative. The PATH export is local to this task shell; do not edit a shell
startup file. Every direct DSH or dashi invocation below uses the absolute
paths the operator selects. The task PATH lets the `sessionbus-dsh` launcher
resolve its child `dsh` by name; the rows-only installer starts no child.
Set `DSH_INSTALL_DIR` to the project being upgraded and `DSH_BIN` to that
project's executable before the block. The umka worked example uses
`DSH_INSTALL_DIR=/home/antst` and `DSH_BIN=/home/antst/node_modules/.bin/dsh`;
these are examples, not discovery defaults.

```sh
set -eu
HOST_USER=$(id -un)
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
: "${DSH_INSTALL_DIR:?name the pnpm project to upgrade}"
: "${DSH_BIN:?name that project's dsh executable}"
test -f "$DSH_INSTALL_DIR/package.json"
test -f "$DSH_INSTALL_DIR/pnpm-lock.yaml"
HOST_BIN_DIR="$(dirname "$DSH_BIN")"
LOGIN_DSH=$(command -v dsh || true)
printf 'host user=%s\nhost home=%s\n' "$HOST_USER" "$HOME"
printf 'login-path dsh=%s\n' "${LOGIN_DSH:-<not found>}"
export PATH="$HOST_BIN_DIR:$PATH"
DASHI_BIN="$HOST_BIN_DIR/dashi"
test -x "$DSH_BIN"
printf 'pnpm='; pnpm --version
printf 'node='; node --version
printf 'npm='; npm --version
printf 'explicit dsh=%s\n' "$DSH_BIN"
```

Expected output on `umka-dev1` includes:

```text
host user=antst
host home=/home/antst
login-path dsh=/home/antst/node_modules/.bin/dsh
pnpm=10.28.1
node=v25.3.0
npm=11.6.2
explicit dsh=/home/antst/node_modules/.bin/dsh
```

The `login-path dsh` line is observational for the already-prepared task
shell; it does not select the install. The operator's explicit project and
executable select the scope, even when another global or project DSH exists.

Inventory the selected project and every profile before changing them:

```sh
printf '%s\n' 'selected project direct packages:'
pnpm --dir "$DSH_INSTALL_DIR" list --depth 0 @deepseek-ai/dsh @antst/dashi-launcher @sessionbus/dsh || true
printf '%s\n' 'profiles:'
find "$DSH_HOME/profiles" -mindepth 1 -maxdepth 1 -type d ! -name node_modules -printf '%f\n' 2>/dev/null | LC_ALL=C sort || true
for profile_dir in "$DSH_HOME"/profiles/*; do
  [ -d "$profile_dir" ] || continue
  [ "${profile_dir##*/}" = node_modules ] && continue
  printf '\nprofile %s direct packages:\n' "${profile_dir##*/}"
  pnpm --dir "$profile_dir" list --depth 0 @deepseek-ai/dsh @antst/dashi-app @sessionbus/dsh || true
done
"$DSH_BIN" --version
```

Expected output inventories the current versions and profiles, without assuming
the historical umka baseline. The final line is the current DSH version. On
the existing hosts, upgrade profiles in place, never delete or recreate them.
Record whether web exists before taking snapshots.

Confirm the selected project's files. This procedure deliberately does not
enumerate other installs, assert that only one exists, or translate a global
install into a home project:

```sh
test -x "$DSH_BIN"
test -f "$DSH_INSTALL_DIR/node_modules/@deepseek-ai/dsh/package.json"
test -d "$DSH_HOME/profiles/dashi"
test -d "$DSH_HOME/profiles/sessionbus"
if [ -e "$DSH_HOME/profiles/web" ]; then
  printf '%s\n' 'web profile: existing'
else
  printf '%s\n' 'web profile: absent'
fi
printf '%s\n' 'DSH_INSTALL_DIR selected'
```

Expected output:

```text
web profile: existing
DSH_INSTALL_DIR selected
```

The presence line is `web profile: existing` or `web profile: absent`; both
are valid inventory results. Preserve an existing web profile in its snapshot.

If an assertion fails, stop and report the selected project's inventory. A
global install uses the README, not this in-place project repair procedure.

Inventory the running daemon without restarting it. The lane proof uses the
inventory-confirmed `$HOME/e2e-work`, not the user service process's cwd (which
may be `/`). Read effective PATH only from the running process, and redact the
unit's possible PATH authorities rather than printing their contents:

```sh
SESSIONBUS_UNIT=sessionbus.service
SESSIONBUS_PID=$(systemctl --user show "$SESSIONBUS_UNIT" -p MainPID --value)
test "$SESSIONBUS_PID" -gt 0
LANE_CWD="$HOME/e2e-work"
test -d "$LANE_CWD"
SERVICE_PATH_LINE=$(tr '\0' '\n' < "/proc/$SESSIONBUS_PID/environ" | grep '^PATH=')
test "$(printf '%s\n' "$SERVICE_PATH_LINE" | wc -l)" -eq 1
SERVICE_PATH=${SERVICE_PATH_LINE#PATH=}
SERVICE_UNIT_PATH=$(systemctl --user show "$SESSIONBUS_UNIT" -p FragmentPath --value)
SESSIONBUS_SERVICE_ENV="${XDG_CONFIG_HOME:-$HOME/.config}/sessionbus/service.env"
SERVICE_DROPIN="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/sessionbus.service.d/override.conf"
printf 'lane cwd=%s\n%s\nunit=%s\n' "$LANE_CWD" "$SERVICE_PATH_LINE" "$SERVICE_UNIT_PATH"
PATH="$SERVICE_PATH" command -v sessionbus
SESSIONBUS_DAEMON_VERSION=$(PATH="$SERVICE_PATH" sessionbus --version)
printf 'daemon version=%s\n' "$SESSIONBUS_DAEMON_VERSION"
node - "$SESSIONBUS_DAEMON_VERSION" <<'NODE'
const version = /^sessionbus v(\d+)\.(\d+)\.(\d+)\s/.exec(process.argv[2])
if (!version || Number(version[1]) === 0 && (Number(version[2]) < 5 || Number(version[2]) === 5 && Number(version[3]) < 9)) {
  throw new Error('Sessionbus daemon v0.5.9 or newer is required; stop before package changes')
}
NODE
node --input-type=module - "$DSH_INSTALL_DIR" <<'NODE'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const anchor = realpathSync(join(process.argv[2], 'node_modules/@deepseek-ai/dsh/package.json'))
console.log(`preflight DSH=${JSON.parse(readFileSync(anchor)).version}; install target >=0.2.1-alpha.2`)
NODE
if PATH="$SERVICE_PATH" command -v sessionbus-dsh dsh >/dev/null 2>&1; then
  printf '%s\n' 'service PATH already resolves sessionbus-dsh and dsh'
else
  printf '%s\n' 'service PATH does not resolve sessionbus-dsh and dsh'
fi
systemctl --user cat "$SESSIONBUS_UNIT" | grep -E '^[[:space:]]*(EnvironmentFile|Environment)=' | sed -E 's/^([[:space:]]*(EnvironmentFile|Environment))=.*/\1=<redacted>/'
grep '^SESSIONBUS_PRODUCTS=' "$SESSIONBUS_SERVICE_ENV"
systemctl --user is-active "$SESSIONBUS_UNIT"
```

Expected `umka-dev1` output identifies `/home/antst/.config/systemd/user/sessionbus.service`,
no drop-ins, the effective PATH below, only `sessionbus` resolving under it,
one products assignment containing `dashi` but not `sessionbus-dsh`, and an
active service:

```text
lane cwd=/home/antst/e2e-work
PATH=/home/antst/.local/bin:/usr/local/bin:/usr/bin:/bin
/home/antst/.local/bin/sessionbus
daemon version=sessionbus v0.5.12 (fd85d7ee3a19735b2712fbbacdef30d62720cd5b)
service PATH does not resolve sessionbus-dsh and dsh
Environment=<redacted>
EnvironmentFile=<redacted>
SESSIONBUS_PRODUCTS=<existing value containing dashi>
active
```

On this host the unit's `Environment=` owns PATH and its
`EnvironmentFile=-/home/antst/.config/sessionbus/service.env` does not set
PATH. On another host, stop here if an EnvironmentFile sets PATH: edit that
file's PATH assignment instead, because it can override a drop-in. The
umka-dev1 branch below adds a drop-in because its EnvironmentFile does not set
PATH.

Record exact rollback facts and make recoverable copies before the first
mutation. The service environment copy is private, and the existing dashi and
sessionbus and web profile manifests, lockfiles, and patch files are preserved:

```sh
ROLLBACK_ROOT="$HOME/.local/state/umka-dev1-dsh-upgrade/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ROLLBACK_ROOT/host" "$ROLLBACK_ROOT/profiles/dashi" "$ROLLBACK_ROOT/profiles/sessionbus" "$ROLLBACK_ROOT/profiles/web" "$ROLLBACK_ROOT/service"
chmod 700 "$ROLLBACK_ROOT"
if [ -f "$DSH_HOME/settings.yaml" ]; then
  cp --preserve=mode "$DSH_HOME/settings.yaml" "$ROLLBACK_ROOT/settings.yaml"
  chmod 600 "$ROLLBACK_ROOT/settings.yaml"
  cmp -s "$DSH_HOME/settings.yaml" "$ROLLBACK_ROOT/settings.yaml"
fi
cp --preserve=mode "$DSH_INSTALL_DIR/package.json" "$ROLLBACK_ROOT/host/package.json"
cp --preserve=mode "$DSH_INSTALL_DIR/pnpm-lock.yaml" "$ROLLBACK_ROOT/host/pnpm-lock.yaml"
for profile_name in dashi sessionbus web; do
  for file in package.json pnpm-lock.yaml cordis.patch.yml; do
    if [ -f "$DSH_HOME/profiles/$profile_name/$file" ]; then
      cp --preserve=mode "$DSH_HOME/profiles/$profile_name/$file" "$ROLLBACK_ROOT/profiles/$profile_name/$file"
    fi
  done
done
cp --preserve=mode "$SESSIONBUS_SERVICE_ENV" "$ROLLBACK_ROOT/service/service.env"
chmod 600 "$ROLLBACK_ROOT/service/service.env"
stat -c '%a' "$SESSIONBUS_SERVICE_ENV" >"$ROLLBACK_ROOT/service/service-env-mode"
stat -c '%u:%g' "$SESSIONBUS_SERVICE_ENV" >"$ROLLBACK_ROOT/service/service-env-owner"
cp --preserve=mode "$SERVICE_UNIT_PATH" "$ROLLBACK_ROOT/service/sessionbus.service"
if [ -f "$SERVICE_DROPIN" ]; then
  cp --preserve=mode "$SERVICE_DROPIN" "$ROLLBACK_ROOT/service/override.conf"
  : >"$ROLLBACK_ROOT/service/dropin-existed"
fi
printf '%s\n' "$SERVICE_PATH" >"$ROLLBACK_ROOT/service/effective-path"
sessionbus roster --local --json | node --input-type=module -e '
  let body = ""; for await (const chunk of process.stdin) body += chunk
  console.log(JSON.stringify(JSON.parse(body).local.products.sort()))
' >"$ROLLBACK_ROOT/service/products.json"
node --input-type=module - "$DSH_INSTALL_DIR" "$DSH_HOME" <<'NODE' >"$ROLLBACK_ROOT/versions.env"
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const [root, home] = process.argv.slice(2)
const version = (base, name) => {
  const file = join(base, 'node_modules', ...name.split('/'), 'package.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : ''
}
for (const [key, value] of [
  ['PREVIOUS_DSH_VERSION', version(root, '@deepseek-ai/dsh')],
  ['PREVIOUS_DASHI_LAUNCHER_VERSION', version(root, '@antst/dashi-launcher')],
  ['PREVIOUS_HOST_SESSIONBUS_DSH_VERSION', version(root, '@sessionbus/dsh')],
  ['PREVIOUS_DASHI_APP_VERSION', version(join(home, 'profiles/dashi'), '@antst/dashi-app')],
  ['PREVIOUS_DASHI_SESSIONBUS_DSH_VERSION', version(join(home, 'profiles/dashi'), '@sessionbus/dsh')],
  ['PREVIOUS_LANE_SESSIONBUS_DSH_VERSION', version(join(home, 'profiles/sessionbus'), '@sessionbus/dsh')],
  ['PREVIOUS_WEB_SESSIONBUS_DSH_VERSION', version(join(home, 'profiles/web'), '@sessionbus/dsh')],
]) console.log(`${key}=${JSON.stringify(value)}`)
NODE
printf '%s\n' 'ROLLBACK_ROOT created'
```

Expected output is `ROLLBACK_ROOT created`. The directory contains only
package metadata, lock graphs, profile patches, the filtered PATH value, the
unit, and private legacy-settings and service-environment backups. No
credential or settings value is printed.

## 2. Upgrade the host DSH graph in place

### Stage the one-shot legacy settings import

Before the home upgrade or any 0.2 boot, including help and diagnostic boots,
coordinate an exclusive upgrade/boot window. Do not stop another owner's
process or let another launcher race this migration. Alpha.2's settings service
imports `$DSH_HOME/settings.yaml` after the Loader settles
(`@deepseek-ai/dsh-settings/lib/index.js:339,347-362`). It renames the file to
`settings.yaml.imported` **before** writing sections into the active profile's
`cordis.patch.yml`, the configEditor's document path
(`dsh-config-editor/lib/index.js:24-25`). The import lands in one profile only;
[reported upstream](https://github.com/deepseek-ai/deepseek-harness/discussions/9419).
Other profiles do not inherit those writes.

Hide the already-backed-up legacy file during graph repair. Stop on an existing
staging file or on both a legacy file and an import marker; do not overwrite or
replay an earlier import. If only `.imported` exists, the import has already run:
leave it there and use the explicit per-profile restoration below instead.

```sh
test ! -e "$DSH_HOME/settings.yaml.pre-0.2"
if [ -f "$DSH_HOME/settings.yaml" ]; then
  test ! -e "$DSH_HOME/settings.yaml.imported"
  cmp -s "$ROLLBACK_ROOT/settings.yaml" "$DSH_HOME/settings.yaml"
  mv "$DSH_HOME/settings.yaml" "$DSH_HOME/settings.yaml.pre-0.2"
  printf '%s\n' 'legacy settings backed up and staged; import deferred'
else
  printf '%s\n' 'no legacy settings to stage; existing import marker left untouched'
fi
```

Expected output is exactly one of those two status lines. Until the intentional
import step after the profile upgrades, every repair/check boot finds no legacy
file and imports nothing. Never put `.imported` back at `settings.yaml`, even
after partial failure.

Upgrade the explicitly named project and verify its selected binary:

```sh
cd "$DSH_INSTALL_DIR"
pnpm add --save-exact @deepseek-ai/dsh@0.2.1-alpha.2
"$DSH_BIN" --version
```

Expected final line:

```text
0.2.1-alpha.2
```

The following repair is operations-only for this project's in-place upgrade,
not a plugin-install prerequisite. Its target-version lock checks catch retained
old peer-only DSH packages; the running composition is still checked separately.
Define one bounded repair for the project and every profile graph. It inspects the
lock records, promotes every stale DSH peer provider and stale, missing or
duplicate CLI companion to an exact direct dependency in one command,
installs that frozen graph, boots the real DSH, and checks its native runtime
resolution. The registry must answer successfully before any removal; only a
reachable packument whose versions omit the target proves absence. Network,
auth and registry errors stop the repair without removal. Remove only absent
direct dependencies through pnpm; obsolete transitive records must disappear
through resolution. The post-install check refuses any surviving absent record.
A profile graph with no DSH records is coherent. It never deletes
`node_modules`, edits or deletes a lockfile, prunes a fallback extra, or runs a
broad dedupe. The embedded closure checker reads only `HOME` and `DSH_HOME`
from the environment and prints only inventory/result lines:

Pre.19 adds a Zod peer: derive its exact pin from the executing CLI's
`dsh-storage-domain` producer (4.5.4 in the host inventory; a fresh install may
resolve a newer version), not from a bare CLI
anchor that may resolve unrelated Zod 3. Require producer/plugin name/version
equality, not global Zod uniqueness or equal physical paths: native domain open
calls the supplied schema's `.parse`, and separate same-version copies work.
Retain and report other majors and both importer paths. No installer guard is
added; these are the existing installation and runtime checks.
Canonicalize an existing manifest or module file with `realpathSync` before
passing it to `createRequire`: that API does not resolve its anchor's symlinks.
A pnpm alias can otherwise walk up to unrelated hoisted Zod 3 even though the
producer's real file context resolves Zod 4. Keep synthetic profile importers logical;
they are native resolution keys, not necessarily files on disk.
Upload-service assertions belong only to profiles whose own manifest depends on
`@sessionbus/dsh` or `@antst/dashi-app`. Other profiles can resolve the plugin
through legacy `profiles/node_modules` (present on both measured hosts) without
owning a plugin or lockfile; report that name/version/path as an observation,
not as a profile-owned provider assertion. Owning profiles assert the mounted
row and its sole registered service, not a physical or lockfile count. This
offline closure check deliberately disables the bus/task row and proves
metadata resolution only; it does not prove Sessionbus admission or a model
turn. Section 5's real product proof must reject skipped, disabled or pending
required rows even when the CLI exits zero.

```sh
cat >"$ROLLBACK_ROOT/registry-version.mjs" <<'NODE'
import { spawnSync } from 'node:child_process'
export function registryHasVersion(name, version) {
  const query = spawnSync('npm', ['view', name, 'versions', '--json'], { encoding: 'utf8' })
  if (query.status !== 0) throw new Error(query.stderr || query.stdout || `registry query exit ${query.status}`)
  const answer = JSON.parse(query.stdout)
  const versions = typeof answer === 'string' ? [answer] : answer
  if (!Array.isArray(versions) || !versions.every(value => typeof value === 'string')) throw new Error(`invalid registry versions for ${name}`)
  const available = versions.includes(version)
  console.log(`registry ${name}@${version}: reachable packument, ${available ? 'PRESENT' : 'ABSENT'}`)
  return available
}
NODE
node --input-type=module - "$DSH_INSTALL_DIR" "$ROLLBACK_ROOT/cli-companion-pins.json" "$ROLLBACK_ROOT/registry-version.mjs" <<'NODE'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [installDir, destination, registryFile] = process.argv.slice(2)
const { registryHasVersion } = await import(pathToFileURL(registryFile).href)
const anchor = realpathSync(join(installDir, 'node_modules/@deepseek-ai/dsh/package.json'))
const { dependencies } = JSON.parse(readFileSync(anchor, 'utf8'))
const pins = Object.fromEntries(Object.entries(dependencies).flatMap(([name, declaration]) => {
  if (!name.startsWith('@deepseek-ai/') || name.startsWith('@deepseek-ai/dsh')) return []
  const floor = /^(?:\^|~|>=)?(\d+\.\d+\.\d+(?:-[\da-z.-]+)?)$/i.exec(declaration)
  if (!floor) throw new Error(`cannot derive CLI minimum for ${name}: ${declaration}`)
  return [[name, floor[1]]]
}))
// Zod's owner is storage-domain in the executing CLI closure, not a bare CLI-anchor lookup.
const pending = [anchor], seen = new Set()
while (pending.length) {
  const manifest = pending.shift()
  if (seen.has(manifest)) continue
  seen.add(manifest)
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')), owner = createRequire(realpathSync(manifest))
  if (pkg.name === '@deepseek-ai/dsh-storage-domain') {
    const zod = realpathSync(owner.resolve('zod/package.json'))
    pins.zod = JSON.parse(readFileSync(zod, 'utf8')).version
    console.log(`storage-domain zod@${pins.zod} -> ${zod}`)
    break
  }
  for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    if (!name.startsWith('@deepseek-ai/dsh')) continue
    try { pending.push(realpathSync(owner.resolve(`${name}/package.json`))) }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error }
  }
}
if (!pins.zod) throw new Error('executing CLI closure has no storage-domain Zod producer')
for (const [name, version] of Object.entries(pins)) {
  if (!registryHasVersion(name, version)) throw new Error(`CLI declares absent companion ${name}@${version}; stop, do not substitute a version`)
}
writeFileSync(destination, `${JSON.stringify(pins)}\n`)
console.log(`CLI companion pins: ${JSON.stringify(pins)}`)
NODE
# OPERATIONS-ONLY: after an in-place project upgrade, retained old companion
# records can select an incompatible loader/service API. This project-policy
# check is not a universal plugin-install requirement; native runtime peer
# resolution is the compatibility oracle for ordinary installation.
cat >"$ROLLBACK_ROOT/check-cli-companions.mjs" <<'NODE'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const [root, pinFile] = process.argv.slice(2)
const pins = JSON.parse(readFileSync(pinFile, 'utf8'))
const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8').split('\nsnapshots:\n', 1)[0]
const records = [...lock.matchAll(/^  '?(@deepseek-ai\/[^@']+|zod)@([^':]+)'?:$/gm)]
for (const [name, pin] of Object.entries(pins)) {
  const versions = records.filter(([, packageName]) => packageName === name).map(([, , version]) => version)
  if (name === 'zod') {
    if (!versions.includes(pin)) throw new Error(`storage-domain zod@${pin} missing; found ${versions.join(', ') || 'none'}`)
    console.log(`storage-domain zod@${pin}: present; other Zod versions ${versions.filter(version => version !== pin).join(', ') || 'none'}: REPORTED`)
    continue
  }
  if (versions.length !== 1 || versions[0] !== pin) {
    throw new Error(`${name} must resolve once at CLI minimum ${pin}; found ${versions.join(', ') || 'none'}`)
  }
  console.log(`CLI companion ${name}@${pin}: one version`)
}
NODE
cat >"$ROLLBACK_ROOT/check-profile-closure.mjs" <<'NODE'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const [profile, installDir = process.env.HOME] = process.argv.slice(2)
if (!profile || !installDir) throw new Error('usage: check-profile-closure.mjs PROFILE [INSTALL_DIR]')
const dshHome = process.env.DSH_HOME ?? join(process.env.HOME, '.dsh')
const anchor = realpathSync(join(installDir, 'node_modules/@deepseek-ai/dsh/package.json'))
const require = createRequire(anchor)
const cli = JSON.parse(readFileSync(anchor, 'utf8'))
const wanted = Object.fromEntries(Object.keys(cli.dependencies).filter(name => name.startsWith('@deepseek-ai/dsh')).map(name => [name, cli.version]))
wanted['@deepseek-ai/dsh-base'] = cli.version
function assertRuntimeSelection(name, version, resolved) {
  const selected = resolved && JSON.parse(readFileSync(join(resolved.dir, 'package.json'), 'utf8'))
  if (resolved?.name !== name || resolved?.version !== version ||
      selected?.name !== name || selected?.version !== version) {
    throw new Error(`runtime selection mismatch ${name}: ${selected?.version ?? 'missing'} at ${resolved?.dir ?? 'missing'}`)
  }
  console.log(`runtime ${name}@${selected.version} -> ${realpathSync(resolved.dir)}: PASS`)
}
const [{ runProfile }, { loadLayeredEnv }] = await Promise.all([
  import(pathToFileURL(require.resolve('@deepseek-ai/dsh/profile-boot')).href),
  import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href),
])
const overlay = mkdtempSync(join(tmpdir(), 'dsh-runtime-resolution-check-'))
const patchFile = join(overlay, 'no-task-or-bus.yml')
const disabled = profile === 'headless' ? ['headless-startup', 'headless-runner'] : profile === 'dashi' ? ['dashi'] : ['sessionbus']
writeFileSync(patchFile, disabled.map(id => `- id: ${id}\n  disabled: true\n`).join(''))
let shutdown
const stdoutWrite = process.stdout.write, stderrWrite = process.stderr.write
try {
  // Web startup can print a token-bearing URL; do not print native startup output.
  process.stdout.write = process.stderr.write = () => true
  const boot = await runProfile({
    environment: loadLayeredEnv('dsh'), profile, patchFiles: [patchFile],
    args: profile === 'web' ? ['--no-open', '--port', '0'] : [],
  })
  shutdown = boot.shutdown
  process.stdout.write = stdoutWrite; process.stderr.write = stderrWrite
  const packages = boot.ctx.pluginPackages
  if (!packages?.current) throw new Error('native runtime resolution not mounted')
  const importer = pathToFileURL(join(dshHome, 'profiles', profile, 'cordis.yml')).href
  for (const [name, version] of Object.entries(wanted)) {
    const resolved = packages.packageOf(name, importer)
    assertRuntimeSelection(name, version, resolved)
  }
  // Native open accepts cross-copy schemas: compare names/versions and report both paths.
  const storage = packages.packageOf('@deepseek-ai/dsh-storage-domain', importer)
  if (!storage?.dir) throw new Error('runtime storage-domain producer is missing')
  const producerZod = realpathSync(createRequire(realpathSync(join(storage.dir, 'package.json'))).resolve('zod/package.json'))
  const plugin = packages.packageOf('@sessionbus/dsh', importer)
  const pluginManifest = plugin?.dir && JSON.parse(readFileSync(join(plugin.dir, 'package.json'), 'utf8'))
  const directory = join(dshHome, 'profiles', profile)
  const profileManifestFile = join(directory, 'package.json')
  const profileManifest = existsSync(profileManifestFile) ? JSON.parse(readFileSync(profileManifestFile, 'utf8')) : {}
  const ownsPlugin = ['@sessionbus/dsh', '@antst/dashi-app'].some(name => Object.hasOwn(profileManifest.dependencies ?? {}, name))
  if (ownsPlugin && pluginManifest) {
    const pluginImporter = pathToFileURL(realpathSync(join(plugin.dir, 'plugin.cjs'))).href
    const producer = packages.packageOf('@deepseek-ai/dsh-app-boot', pluginImporter)
    if (!producer?.manifestPath) throw new Error('native compatibility producer missing')
    const semver = createRequire(realpathSync(producer.manifestPath))('semver')
    for (const [name, range] of Object.entries(pluginManifest.peerDependencies ?? {})) {
      const selected = packages.packageOf(name, pluginImporter)
      if (!selected || selected.name !== name || !semver.satisfies(selected.version, range, { includePrerelease: true })) {
        throw new Error(`unresolved or incompatible plugin peer ${name}@${selected?.version ?? 'missing'}: ${range}`)
      }
      if (name.startsWith('@deepseek-ai/dsh') && selected.version !== cli.version) throw new Error(`mixed plugin DSH peer ${name}@${selected.version}`)
      console.log(`runtime plugin peer ${name}@${selected.version} -> ${realpathSync(selected.dir)}: PASS`)
    }
  }
  if (ownsPlugin && pluginManifest?.peerDependencies?.zod) {
    const pluginZod = realpathSync(createRequire(realpathSync(join(plugin.dir, 'plugin.cjs'))).resolve('zod/package.json'))
    const selected = JSON.parse(readFileSync(pluginZod, 'utf8')), expected = JSON.parse(readFileSync(producerZod, 'utf8'))
    if (selected.name !== expected.name || selected.version !== expected.version) throw new Error(`runtime plugin Zod version mismatch: ${selected.name}@${selected.version} at ${pluginZod} != storage-domain ${expected.name}@${expected.version} at ${producerZod}`)
    console.log(`runtime plugin/storage-domain zod@${selected.version}: PASS; plugin=${pluginZod}; producer=${producerZod}`)
  }
  if (ownsPlugin) {
    const implementations = Reflect.ownKeys(boot.ctx.reflect.store).map(key => boot.ctx.reflect.store[key])
      .filter(value => value?.name === 'fileUploads' && value.fiber.state === 2)
    if (implementations.length !== 1) throw new Error('expected one active fileUploads implementation')
    const rows = [...boot.ctx.loader.entries()].filter(row => row.fiber === implementations[0].fiber)
    if (rows.length !== 1) throw new Error('expected one mounted upload-provider row')
    const row = rows[0], mounted = packages.packageOf(row.options.name, row.parent.tree.ctx.baseUrl)
    if (!mounted) throw new Error('mounted upload provider has no native package owner')
    if (pluginManifest?.exports?.['./file-uploads-none'] && profile === 'sessionbus') {
      if (row.options.name !== '@sessionbus/dsh/file-uploads-none' || mounted.name !== '@sessionbus/dsh') throw new Error('lane must mount its own provider entry')
    }
    console.log(`runtime upload row ${row.options.name}: ${mounted.name}@${mounted.version} -> ${realpathSync(mounted.dir)}; registered services=1: PASS`)
  } else if (plugin) {
    console.log(`fallback ${plugin.name}@${plugin.version} -> ${realpathSync(plugin.dir)}: REPORTED ONLY (profile does not own the plugin)`)
  }
  console.log(`runtime storage-domain zod@${JSON.parse(readFileSync(producerZod, 'utf8')).version} -> ${producerZod}: PASS`)
  const entries = packages.current.entries
  let current = 0
  for (const entry of entries) {
    const manifest = JSON.parse(readFileSync(join(entry.packageDir, 'package.json'), 'utf8'))
    if (manifest.name !== entry.name || manifest.version !== entry.version) throw new Error(`runtime manifest mismatch ${entry.name}`)
    if (entry.name.startsWith('@deepseek-ai/dsh') && manifest.version !== cli.version) throw new Error(`mixed runtime ${entry.name}@${manifest.version}`)
    current++
  }
  console.log(`profile=${profile}\nexpected=${entries.length}\ncurrent=${current}\nmissing=0\nwrong=0`)
  const legacy = join(dshHome, 'profiles/node_modules')
  const names = existsSync(legacy) ? readdirSync(legacy).filter(name => !name.startsWith('.')).flatMap(name =>
    name.startsWith('@') ? readdirSync(join(legacy, name)).map(child => `${name}/${child}`) : [name]) : []
  console.log(`legacy_extras=${names.length}: REPORTED ONLY`)
  for (const name of names.sort()) console.log(`legacy_entry=${name}`)
} finally {
  try { if (shutdown) await shutdown.shutdown(0) }
  finally {
    process.stdout.write = stdoutWrite; process.stderr.write = stderrWrite
    rmSync(overlay, { recursive: true, force: true })
  }
}
NODE

check_dsh_graph() {
  graph_root=$1
  target_version=$2
  physical_mode=${3:-optional}
  profile=${4:-headless}
  node --input-type=module - "$graph_root" "$target_version" "$physical_mode" <<'NODE' || return
import { join } from 'node:path'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
const [root, target, physicalMode] = process.argv.slice(2)
const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8').split('\nsnapshots:\n', 1)[0] ?? ''
const records = [...lock.matchAll(/^  '?(@deepseek-ai\/dsh[^@']*)@([^':]+)'?:$/gm)].map(([, name, version]) => ({ name, version }))
if (records.some(record => record.name === '@deepseek-ai/dsh-invariants')) {
  console.error('removed @deepseek-ai/dsh-invariants must have no lock record')
  process.exitCode = 1
}
const counts = new Map()
for (const { version } of records) counts.set(version, (counts.get(version) ?? 0) + 1)
console.log(`DSH packages: ${records.length}`)
console.log(`DSH versions: ${[...counts.keys()].sort().join(', ')}`)
for (const [version, count] of [...counts].sort()) console.log(`DSH ${version}: ${count}`)
const stale = records.filter(record => record.version !== target)
if (stale.length) {
  for (const value of [...new Set(stale.map(record => `${record.name}@${record.version}`))].sort()) console.error(value)
  process.exitCode = 1
}

const scope = join(root, 'node_modules/@deepseek-ai')
const physical = []
if (existsSync(scope)) for (const entry of readdirSync(scope).sort()) {
  if (entry !== 'dsh' && !entry.startsWith('dsh-')) continue
  const path = join(scope, entry)
  try {
    const version = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).version
    const targetPath = realpathSync.native(path)
    physical.push({ name: `@deepseek-ai/${entry}`, version, targetPath })
    console.log(`DSH physical @deepseek-ai/${entry}@${version} -> ${targetPath}`)
  } catch (error) {
    console.error(`DSH physical @deepseek-ai/${entry}: ${error.message}`)
    if (physicalMode !== 'report') process.exitCode = 1
  }
}
const physicalVersions = [...new Set(physical.map(record => record.version))].sort()
const physicalCounts = new Map()
for (const { version } of physical) physicalCounts.set(version, (physicalCounts.get(version) ?? 0) + 1)
console.log(`DSH physical projection: ${physicalMode === 'report' ? 'REPORTED' : 'ASSERTED'}`)
console.log(`DSH physical packages: ${physical.length}`)
console.log(`DSH physical versions: ${physicalVersions.join(', ')}`)
for (const [version, count] of [...physicalCounts].sort()) console.log(`DSH physical ${version}: ${count}`)
if (physicalMode === 'required' && physical.length === 0) {
  console.error(`DSH physical projection is empty: ${root}`)
  process.exitCode = 1
}
if (physicalMode !== 'report' && physical.some(record => record.version !== target)) {
  console.error(`DSH physical projection is not uniformly ${target}: ${root}`)
  process.exitCode = 1
}
NODE
  node "$ROLLBACK_ROOT/check-cli-companions.mjs" "$graph_root" "$ROLLBACK_ROOT/cli-companion-pins.json" || return
  node "$ROLLBACK_ROOT/check-profile-closure.mjs" "$profile" "$DSH_INSTALL_DIR" || return
  printf 'DSH graph coherent: %s\n' "$graph_root"
}

repair_dsh_graph() {
  graph_root=$1
  target_version=$2
  physical_mode=${3:-optional}
  profile=${4:-headless}
  stale_file=$(mktemp)
  if node --input-type=module - "$graph_root" "$target_version" "$stale_file" "$ROLLBACK_ROOT/cli-companion-pins.json" "$ROLLBACK_ROOT/registry-version.mjs" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [root, target, planFile, companionFile, registryFile] = process.argv.slice(2)
const { registryHasVersion } = await import(pathToFileURL(registryFile).href)
const packages = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8').split('\nsnapshots:\n', 1)[0] ?? ''
const records = [...packages.matchAll(/^  '?(@deepseek-ai\/[^@']+|zod)@([^':]+)'?:$/gm)].map(([, name, version]) => ({ name, version }))
const stale = [...new Set(records.filter(record => record.name.startsWith('@deepseek-ai/dsh') && record.version !== target).map(record => record.name))].sort()
const pins = [], absent = []
for (const name of stale) {
  if (registryHasVersion(name, target)) pins.push(`${name}@${target}`)
  else absent.push(name)
}
for (const [name, pin] of Object.entries(JSON.parse(readFileSync(companionFile, 'utf8')))) {
  const versions = records.filter(record => record.name === name).map(record => record.version)
  if (name === 'zod' ? !versions.includes(pin) : versions.length !== 1 || versions[0] !== pin) pins.push(`${name}@${pin}`)
}
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const direct = new Set(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(field => Object.keys(manifest[field] ?? {})))
writeFileSync(planFile, JSON.stringify({ pins: pins.sort(), absent, remove: absent.filter(name => direct.has(name)) }))
NODE
  then
    :
  else
    repair_status=$?
    rm -f "$stale_file"
    return "$repair_status"
  fi
  pin_lines=$(node -e 'for (const pin of JSON.parse(require("fs").readFileSync(process.argv[1])).pins) console.log(pin)' "$stale_file") || return
  remove_lines=$(node -e 'for (const name of JSON.parse(require("fs").readFileSync(process.argv[1])).remove) console.log(name)' "$stale_file") || return
  absent_count=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).absent.length)' "$stale_file") || return
  stale_packages=(); obsolete_direct=()
  if [ -n "$pin_lines" ]; then mapfile -t stale_packages <<<"$pin_lines"; fi
  if [ -n "$remove_lines" ]; then mapfile -t obsolete_direct <<<"$remove_lines"; fi
  if [ "${#obsolete_direct[@]}" -gt 0 ]; then
    pnpm --dir "$graph_root" remove "${obsolete_direct[@]}" || return
  fi
  if [ "${#stale_packages[@]}" -gt 0 ]; then
    pnpm --dir "$graph_root" add --save-exact "${stale_packages[@]}" || return
  fi
  if [ "$absent_count" -gt 0 ] && [ "${#obsolete_direct[@]}" -eq 0 ] && [ "${#stale_packages[@]}" -eq 0 ]; then
    pnpm --dir "$graph_root" install --lockfile-only --fix-lockfile --ignore-scripts || return
  fi
  pnpm --dir "$graph_root" install --frozen-lockfile || return
  node --input-type=module - "$graph_root/pnpm-lock.yaml" "$stale_file" <<'NODE' || return
import { readFileSync } from 'node:fs'
const [lockFile, planFile] = process.argv.slice(2)
const { absent } = JSON.parse(readFileSync(planFile, 'utf8'))
const lock = readFileSync(lockFile, 'utf8').split('\nsnapshots:\n', 1)[0]
for (const [, name] of lock.matchAll(/^  '?(@deepseek-ai\/[^@']+)@([^':]+)'?:$/gm)) {
  if (absent.includes(name)) throw new Error(`absent target package still in lock: ${name}`)
}
console.log('absent target packages: zero lock records')
NODE
  rm "$stale_file"
  if [ "$physical_mode" = report ]; then
    node --input-type=module - "$DSH_INSTALL_DIR" "$target_version" <<'NODE' || return
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const [installDir, target] = process.argv.slice(2)
const anchor = realpathSync(join(installDir, 'node_modules/@deepseek-ai/dsh/package.json'))
const version = JSON.parse(readFileSync(anchor, 'utf8')).version
console.log(`DSH executing install anchor: ${anchor}`)
console.log(`DSH executing version: ${version}`)
if (version !== target) process.exitCode = 1
NODE
  fi
  "$DSH_BIN" --profile headless --help >/dev/null || return
  printf '%s\n' 'headless boot exit=0; runtime resolution, not physical healing'
  check_dsh_graph "$graph_root" "$target_version" "$physical_mode" "$profile"
}

repair_dsh_graph "$DSH_INSTALL_DIR" 0.2.1-alpha.2 report headless
test "$?" -eq 0 || exit 1
# OPERATIONS ONLY: verify this named project owns DSH records before accepting
# its in-place repair. Uniform target records catch retained old peer-only DSH
# packages; counts are not a universal installation/runtime oracle.
DSH_RECORD_COUNT=$(awk "/^snapshots:/ {exit} /^  '?@deepseek-ai\/dsh[^@']*@/ {count++} END {print count+0}" "$DSH_INSTALL_DIR/pnpm-lock.yaml") || exit 1
if [ "$DSH_RECORD_COUNT" -eq 0 ]; then
  printf '%s\n' 'host DSH graph has no package records' >&2
  exit 1
fi
printf '%s\n' 'host DSH graph nonzero'
```

After the exact-pin command and frozen install, expected final output is a
nonzero uniform target graph and expected=current closure (counts are measured
from this graph, not copied from the historical inventory):

```text
DSH executing install anchor: <package directory resolved beside the real dsh bin>/package.json
DSH executing version: 0.2.1-alpha.2
headless boot exit=0; runtime resolution, not physical healing
DSH packages: <nonzero current count>
DSH versions: 0.2.1-alpha.2
DSH 0.2.1-alpha.2: <same current count>
DSH physical @deepseek-ai/dsh@<reported version> -> <resolved package directory>
<one physical line per top-level DSH package>
DSH physical projection: REPORTED
DSH physical packages: <inventory count>
DSH physical versions: <one or more reported versions>
DSH physical <version>: <count>
CLI companion @deepseek-ai/cordis@4.0.5-alpha.1: one version
CLI companion @deepseek-ai/cordis-plugin-include@1.0.10-alpha.1: one version
CLI companion @deepseek-ai/cordis-plugin-loader@1.0.6-alpha.1: one version
CLI companion @deepseek-ai/cordis-plugin-timer@1.1.7-alpha.1: one version
CLI companion @deepseek-ai/schemastery@3.18.5-alpha.1: one version
storage-domain zod@<producer version, 4.5.4 in the inventory>: present; other Zod versions <reported versions or none>: REPORTED
runtime @deepseek-ai/dsh-base@0.2.1-alpha.2 -> <new installation package>: PASS
<one runtime selection line per CLI companion>
runtime storage-domain zod@<producer version> -> <producer-resolved package.json>: PASS
<when the profile has a Zod peer: runtime plugin/storage-domain zod@<same producer version>: PASS; plugin=<package.json>; producer=<possibly separate package.json>>
profile=headless
expected=<closure count>
current=<same closure count>
missing=0
wrong=0
legacy_extras=<inventory count>: REPORTED ONLY
legacy_entry=<old shared-directory package name>
DSH graph coherent: /home/antst
host DSH graph nonzero
```

Worked companion example (pnpm 10.28.1, hoisted, auto-install-peers=false,
no `.pnpmfile`): a fresh alpha.2 CLI plus pre.17 consumer resolved one copy of
each companion at the five minima above. Retaining a direct Cordis 4.0.2 pin
instead left both 4.0.2 and 4.0.5-alpha.1 in the lock and physical root Cordis
at 4.0.2, while all 263 DSH records were still alpha.2. The former DSH-only
check missed that split. The companion check now refuses it with
`@deepseek-ai/cordis must resolve once at CLI minimum 4.0.5-alpha.1; found 4.0.2, 4.0.5-alpha.1`.
The existing repair collects `@deepseek-ai/cordis@4.0.5-alpha.1` in the same
exact-pin add as any other stale entries. Exact CLI companion pins repaired
the scratch graph to one version each without a hook. These are reproduction
counts, not expected host/profile counts; derive pins once from the executing
CLI, then assert every resulting lock and the native closure on the real host.

Worked removed-package example from the real dsh host
(`/tmp/w115-host-dsh-alpha2-repair.log`, 2026-10-10): the old collector tried
`@deepseek-ai/dsh-invariants@0.2.1-alpha.2` and stopped with
`ERR_PNPM_NO_MATCHING_VERSION`. Its reachable registry packument contained 29
published versions but no alpha.2 target; invariants was removed in alpha.1.
The corrected collector also verified no target for code-runtime and
subagent-in-process-driver. Only those two were direct host dependencies,
so `pnpm remove` removed them; invariants was excluded from the add and vanished
transitively. One exact-pin add and a frozen no-op install produced 290 DSH
records, all alpha.2, with zero records of the three absent names. A network or
auth failure cannot take this path. These counts are evidence, not fixed targets.

DSH owns the plugin floor (`0.2.1-alpha.2`). Its native add refuses an incompatible
plugin with `Plugin @sessionbus/dsh@0.1.3 is incompatible with dsh
0.2.1-alpha.1`; a forced boot disables the row with the same readable reason.
Stop on that refusal; do not grant a version exemption. The rows-only installer
does not infer a CLI installation from a bin, home directory or package layout.

pnpm 10.28.1 retains already auto-installed peer providers in the lock even
when their published ranges reject those versions; scoped updates, dedupe, and
lock pruning do not repair that in-place state. The exact pins are permanent
manifest dependencies, equivalent to dashi's catalog owning one DSH version.
Every later host or profile package add calls the same function. For the host,
the mandatory assertions are a lock uniform at the target, the executing
install anchor at the target, one companion version at every CLI minimum, and
a successful native runtime-resolution check. Any leftover lock version,
wrong executing anchor, failed boot, or wrong native package selection stops the run
with the rollback copy intact. Physical projections are reported inventory, not runtime assertions; they may
contain unused old packages. The executing native resolution is authoritative. The old shared physical entries are listed as legacy
extras only, never asserted as a current closure and never hand-linked/pruned.

DSH 0.2 replaces physical fallback healing with an immutable in-memory table
(`dsh-app-boot/lib/index.js:748-784`), installed through native ESM/CommonJS
interception before profile rows mount (`:1718-1722,3353-3363`;
CLI `lib/profile-boot-BZ2ZjNWi.js:205-215,271-275` at alpha.2). App-boot's README
states that runtime resolution creates no links (`README.md:67,137-144`).
The checker boots the actual profile and queries `ctx.pluginPackages.packageOf`
from its root importer, asserting one DSH version and resolving the plugin's
peers from its own importer against their declared ranges. Exact companion
pins are an operations choice for this project's lock graph, not a runtime
requirement. Selected realpaths are reported, not required equal. DSH's native
lookup prefers profile-local candidates (`dsh-app-boot/lib/index.js:1490-1538`):
a compatible local companion passes; a below-range peer or mixed DSH version
fails. It checks every native table
manifest and reports expected=current. The disposable overlay disables only
headless task admission/runner, dashi's terminal driver, or the sessionbus row;
no model turn or daemon publication occurs. Web startup output is suppressed
because its URL can carry a token. Native shutdown and overlay cleanup run once.
No profile manifest/lock/patch is edited by this diagnostic.

The dsh host's obsolete physical-link oracle reported expected 578/current 380,
missing 130/wrong 68 after a successful alpha.2 help invocation. The actual
booted runtime check then passed 581/581 with all six installation selections;
512 legacy physical entries were left untouched. These are measured inventory,
not alpha.2 fixed counts. There is no shared fallback rebuild command on 0.2;
only DSH's own per-profile `.dsh-module-fallback` cleanup remains
(`dsh-app-boot/lib/index.js:615-631,1058`). Unmapped names and explicit native
CommonJS paths can still see ordinary ancestor files: legacy extras do not
certify old plugins as compatible. Do not add a link-healing mechanism.

Every profile exact-pin install below also scans nested `node_modules` package
manifests against that profile's lock. A lock-tracked package is left alone; an
untracked directory is removed only after its name/version is re-read unchanged
and the exact record is re-confirmed absent from the lock. The following frozen
install must print both `Lockfile is up to date, resolution step is skipped` and
`Already up to date`. This explicit cleanup is necessary because pnpm 10.28.1
`prune` and `install --frozen-lockfile --force` both left such directories in
place on a hoisted profile during the measured in-place-upgrade reproduction.

If registry-verified obsolete names are only transitive lock records, with no
direct removal or exact-pin add planned, the repair runs one
`pnpm install --lockfile-only --fix-lockfile --ignore-scripts` before its frozen
validation. Plain frozen install and plain `--lockfile-only` retained orphan
records in a populated pnpm 10.28.1 fixture; `--fix-lockfile` removed them while
preserving unrelated resolution bytes. A still-referenced obsolete package
continues to fail the zero-absent-record assertion; it is never hand-deleted.

## 3. Upgrade dashi to 0.2.0-alpha.2 in place

Upgrade the host launcher, then immediately re-check the host graph because a
host-level `pnpm add` may re-resolve peers:

```sh
cd "$DSH_INSTALL_DIR"
pnpm add --save-exact @antst/dashi-launcher@0.2.0-alpha.2
test -x "$DASHI_BIN"
repair_dsh_graph "$DSH_INSTALL_DIR" 0.2.1-alpha.2 report headless
test "$?" -eq 0 || exit 1
```

Expected output reports launcher `0.2.0-alpha.2`, then a nonzero host DSH
count at the single version `0.2.1-alpha.2`.

Upgrade the existing dashi profile rather than replacing it, and re-check that
profile immediately after the add. If the add fails after touching the
physical tree, the failure branch restores the manifest and lock byte-for-byte,
permits the first frozen install to relink disturbed packages, requires the
second frozen install to be a full no-op, and proves the physical graph equals
the pre-step state. It then stops; do not retry until all four tarball HEAD
checks pass.

```sh
if ! "$DSH_BIN" plugin --profile dashi add @antst/dashi-app@0.2.0-alpha.2; then
  printf '%s\n' 'dashi profile add failed; restoring the pre-step graph' >&2
  cp --preserve=mode "$ROLLBACK_ROOT/profiles/dashi/package.json" "$DSH_HOME/profiles/dashi/package.json"
  cp --preserve=mode "$ROLLBACK_ROOT/profiles/dashi/pnpm-lock.yaml" "$DSH_HOME/profiles/dashi/pnpm-lock.yaml"
  cmp -s "$ROLLBACK_ROOT/profiles/dashi/package.json" "$DSH_HOME/profiles/dashi/package.json"
  cmp -s "$ROLLBACK_ROOT/profiles/dashi/pnpm-lock.yaml" "$DSH_HOME/profiles/dashi/pnpm-lock.yaml"

  first_install=$(pnpm --dir "$DSH_HOME/profiles/dashi" install --frozen-lockfile 2>&1)
  printf '%s\n' "$first_install"
  grep -Fqx 'Lockfile is up to date, resolution step is skipped' <<< "$first_install"

  second_install=$(pnpm --dir "$DSH_HOME/profiles/dashi" install --frozen-lockfile 2>&1)
  printf '%s\n' "$second_install"
  grep -Fqx 'Lockfile is up to date, resolution step is skipped' <<< "$second_install"
  grep -Fqx 'Already up to date' <<< "$second_install"

  . "$ROLLBACK_ROOT/versions.env"
  test "$(node -p 'require(process.argv[1]).version' "$DSH_HOME/profiles/dashi/node_modules/@antst/dashi-app/package.json")" = "$PREVIOUS_DASHI_APP_VERSION"
  test "$(node -p 'require(process.argv[1]).version' "$DSH_HOME/profiles/dashi/node_modules/@sessionbus/dsh/package.json")" = "$PREVIOUS_DASHI_SESSIONBUS_DSH_VERSION"
  check_dsh_graph "$DSH_HOME/profiles/dashi" 0.2.1-alpha.2 report dashi
  printf '%s\n' 'pre-step dashi profile graph restored; stop before retry' >&2
  exit 1
fi
repair_dsh_graph "$DSH_HOME/profiles/dashi" 0.2.1-alpha.2 report dashi
test "$?" -eq 0 || exit 1
DSH_RECORD_COUNT=$(awk "/^snapshots:/ {exit} /^  '?@deepseek-ai\/dsh[^@']*@/ {count++} END {print count+0}" "$DSH_HOME/profiles/dashi/pnpm-lock.yaml") || exit 1
if [ "$DSH_RECORD_COUNT" -eq 0 ]; then
  printf '%s\n' 'dashi profile DSH graph has no package records' >&2
  exit 1
fi
printf '%s\n' 'dashi profile DSH graph nonzero'
pnpm --dir "$DSH_HOME/profiles/dashi" list --depth 0 @antst/dashi-app @sessionbus/dsh
```

Expected output contains `dashi profile DSH graph nonzero`,
`@antst/dashi-app 0.2.0-alpha.2`, and a DSH package count at the single version
`0.2.1-alpha.2`. Its measured count is inventory, not a fixed acceptance
criterion. The published dashi-app alpha.2 carries plugin pre.20 and kit 0.5.12;
it owns its provider. Never substitute dashi 0.1.x or independently re-pin
its plugin. A physical leftover or another lock record is inventory, not a
runtime failure: inspect the mounted provider row and sole registered service.
No package is deleted solely because it is not represented in this lockfile.

## 4. Upgrade sessionbus-dsh and its profiles

Pre.21 owns a separate no-upload entry in its own package. The installer has
no provider lookup or package operations. DSH owns the add; the installer owns
its marked rows and its base-bundle entry. Existing external-provider pins
remain untouched and are reported as unused by the installer. Do not remove
one on the basis of a lock or physical-copy count; another composition may use
it. Dashi-app owns its own provider and Sessionbus row, so its profile is outside
the installer.

Install the package in the host project. This supplies the command for the
daemon's service PATH; the task shell PATH already lets the package-owned
launcher and installer find their child `dsh`. The host project intentionally
gets only the plugin package; there is no external upload-provider requirement:

```sh
cd "$DSH_INSTALL_DIR"
pnpm add --save-exact @sessionbus/dsh@0.1.3
test -x "$HOST_BIN_DIR/sessionbus-dsh"
repair_dsh_graph "$DSH_INSTALL_DIR" 0.2.1-alpha.2 report headless
test "$?" -eq 0 || exit 1
```

Expected output reports `@sessionbus/dsh 0.1.3`,
and a nonzero host DSH
count at the single version `0.2.1-alpha.2`.

Upgrade the installed sessionbus profile in place. Re-running the installer
repairs its old row by adding the required stable product `sessionbus-dsh`. The
sessionbus profile add
prints `declares no dsh.bundle — installed as a plain dependency`; this is
expected because that lane profile consumes the host DSH graph. Section 5 adds
the selected model provider's packages to this lane profile and the plain web
profile before either one runs a model turn.
Re-running the installer merges its
row and base-bundle entry into the existing profile manifest; DSH alone changes
dependencies. The installer
does not remove provider packages, other bundles, or other manifest fields.
It replaces only the installer's marked row spans, preserving every other byte,
including the owner's `llm-pi-ai` and `agent-default-model` rows, comments and
inert `!!js` expressions. Unmarked config-only lane defaults stay the owner's
without a shadowing default; an unmarked Sessionbus or upload mount refuses.
The old marked `persona` row becomes
`personaPrefix`, retaining the model wording but not the unsupported `{{cwd}}`
interpolation. Alpha.2 supplies cwd through native working-directory tools
(`dsh-base/cordis.patch.yml:161-165`). Peer web installation never wrote that
persona row. Snapshot first; no profile reinstall is needed.

`@antst/dashi-app@0.2.0-alpha.2` and later already ship the `sessionbus` row
and their exact `@sessionbus/dsh` dependency. Do not run the installer against
the dashi profile: the dashi product runs the plugin version that dashi-app
pins, until dashi-app publishes a newer pin.

```sh
"$DSH_BIN" plugin --profile sessionbus add --save-exact @sessionbus/dsh@0.1.3
repair_dsh_graph "$DSH_HOME/profiles/sessionbus" 0.2.1-alpha.2 report sessionbus
test "$?" -eq 0 || exit 1
"$DSH_BIN" plugin --profile sessionbus exec sessionbus-dsh-install
pnpm --dir "$DSH_HOME/profiles/sessionbus" list --depth 0 @sessionbus/dsh
pnpm --dir "$DSH_HOME/profiles/dashi" list --depth 0 @sessionbus/dsh
grep -F 'config: { mode: lane, product: sessionbus-dsh }' "$DSH_HOME/profiles/sessionbus/cordis.patch.yml"
```

Expected output contains `@sessionbus/dsh 0.1.3` for the sessionbus
profile and the exact version pinned by dashi-app for the dashi profile, no DSH
version other than alpha.2 in the lane graph (which may have zero DSH records),
and this lane profile entry:

```text
config: { mode: lane, product: sessionbus-dsh }
```

Upgrade the existing plain, non-dashi web profile, or create it if it was absent
in the snapshot. It has no configured groups; the environment supplies its test
group. Re-check its graph immediately after the package add:

```sh
if [ ! -f "$DSH_HOME/profiles/web/package.json" ]; then
  "$DSH_BIN" --profile web --dump-default-config >"$ROLLBACK_ROOT/web-default-config.yml"
fi
"$DSH_BIN" plugin --profile web add --save-exact @sessionbus/dsh@0.1.3
repair_dsh_graph "$DSH_HOME/profiles/web" 0.2.1-alpha.2 report web
test "$?" -eq 0 || exit 1
"$DSH_BIN" plugin --profile web exec sessionbus-dsh-install --product dsh web
grep -F 'config: { product: dsh }' "$DSH_HOME/profiles/web/cordis.patch.yml"
if grep -Eq '(^|[[:space:]{,])groups:' "$DSH_HOME/profiles/web/cordis.patch.yml"; then
  printf '%s\n' 'unexpected configured groups in web profile' >&2
  exit 1
fi
printf '%s\n' 'web profile has no configured groups'
```

Expected output contains no DSH version other than alpha.2 (zero DSH records is
valid), the exact peer row below, and the no-groups confirmation:

```text
config: { product: dsh }
web profile has no configured groups
```

### Import into the chosen profile, then restore only missing profile selections

After the host and touched profile graphs pass, choose which prepared profile
should own the legacy sections. The example below chooses `web`; deliberately
change that choice and its normal app arguments if another profile should own
them. Inspect the private pre-upgrade patches and legacy backup locally: record
which profiles relied on the global provider/model and have **no provider/model
rows of their own**. Do not change any existing per-profile choice. Keep the
staged file hidden until all preparation is complete, then restore it and make
the very next boot the chosen profile, not another check or help command.

Define a keys-only projection for the before/after evidence. It does not evaluate
`!!js` expressions or print any config values; row ids and config key paths are
the only output. The YAML parser is the executing CLI's existing dependency,
resolved from its real manifest, not from a synthetic `.bin` anchor:

```sh
profile_patch_keys() {
  node --input-type=module - "$DSH_INSTALL_DIR/node_modules/@deepseek-ai/dsh/package.json" "$1" "${2:-patch}" <<'NODE'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
const [cliManifest, patchFile, format] = process.argv.slice(2)
const require = createRequire(realpathSync(cliManifest))
const yaml = require('js-yaml')
const schema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', construct: text => text,
})])
let rows
try { rows = existsSync(patchFile) ? yaml.load(readFileSync(patchFile, 'utf8'), { schema }) : [] }
catch { throw new Error('profile patch cannot be projected; inspect it privately') }
if (format === 'legacy') {
  if (rows && (typeof rows !== 'object' || Array.isArray(rows))) throw new Error('legacy settings must be a section map')
  const ids = { 'ui-developer-tools': 'ui-settings', 'ui-onboarding': 'ui-settings-general', shell: process.platform === 'win32' ? 'pwsh-sandbox' : 'bash-sandbox' }
  rows = Object.entries(rows ?? {}).map(([id, config]) => ({ id: ids[id] ?? id, config }))
}
rows ??= []
if (!Array.isArray(rows)) throw new Error('profile patch must be an entry list')
const keys = new Set()
function fields(value, path) {
  if (Array.isArray(value)) for (const item of value) fields(item, `${path}[]`)
  else if (value && typeof value === 'object') for (const key of Object.keys(value)) {
    keys.add(`${path}.${key}`)
    fields(value[key], `${path}.${key}`)
  }
}
function entries(list) {
  for (const row of list) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('invalid patch row; inspect it privately')
    if (Object.prototype.hasOwnProperty.call(row, 'insert') && !Array.isArray(row.insert)) {
      throw new Error('invalid patch row; inspect it privately')
    }
    if (Object.prototype.hasOwnProperty.call(row, 'config') && typeof row.id !== 'string') {
      throw new Error('invalid patch row; inspect it privately')
    }
    if (typeof row.id === 'string') {
      keys.add(row.id)
      fields(row.config, `${row.id}.config`)
    }
    if (Array.isArray(row.insert)) entries(row.insert)
  }
}
entries(rows)
for (const key of [...keys].sort()) console.log(key)
NODE
}
printf '%s\n' 'keys-only patch projection ready'
```

Expected output is `keys-only patch projection ready`. An invalid patch stops
the projection without printing the parser's potentially value-bearing error.
This read-only inventory treats absent, blank, comments-only, and `null` patch
content as zero keys; it does not certify native validity. DSH rejects existing
non-array patches (`dsh-app-boot/lib/index.js:3714-3723`); use `[]` for a valid
empty patch. Scalars, maps, and malformed YAML still stop the inventory.
Config-bearing rows need explicit string ids for this keys-only evidence;
anonymous rows require private inspection, not silent omission or a claim of
native invalidity (the Loader can generate ids for inserted entries).

For a staged import, run the chosen profile normally in your own terminal/PTY,
with diagnostics redirected into the private rollback directory. This web
example binds a free loopback port and runs no model turn. In a second terminal,
wait for the `.imported` marker **and** the expected sections/keys in the owning
patch; inspect the restored selection privately before stopping your own
instance with SIGINT (Ctrl-C, expected exit 130). Do not use EOF or a help-only
boot as an import-success oracle, print the whole private log, or touch an
owner's process. The stock CLI prints no `settings: imported` line to the
terminal: cordis loggers go to exporters (`cordis/lib/index.js:473-484,598-604`);
see the [upstream follow-up](https://github.com/deepseek-ai/deepseek-harness/discussions/9419#discussioncomment-18860327).

```sh
if [ -f "$DSH_HOME/settings.yaml.pre-0.2" ]; then
  SETTINGS_OWNER_PROFILE=web
  SETTINGS_BOOT_ARGS=(--no-open --host 127.0.0.1 --port 0)
  SETTINGS_PATCH="$DSH_HOME/profiles/$SETTINGS_OWNER_PROFILE/cordis.patch.yml"
  test -f "$DSH_HOME/profiles/$SETTINGS_OWNER_PROFILE/package.json"
  profile_patch_keys "$SETTINGS_PATCH" >"$ROLLBACK_ROOT/settings-owner.before.keys"
  profile_patch_keys "$ROLLBACK_ROOT/settings.yaml" legacy >"$ROLLBACK_ROOT/settings-owner.expected.keys"
  if [ -f "$SETTINGS_PATCH" ]; then
    cp --preserve=mode "$SETTINGS_PATCH" "$ROLLBACK_ROOT/settings-owner.before.patch.yml"
  fi
  test ! -e "$DSH_HOME/settings.yaml"
  test ! -e "$DSH_HOME/settings.yaml.imported"
  mv "$DSH_HOME/settings.yaml.pre-0.2" "$DSH_HOME/settings.yaml"
  if "$DSH_BIN" --profile "$SETTINGS_OWNER_PROFILE" "${SETTINGS_BOOT_ARGS[@]}" >"$ROLLBACK_ROOT/settings-import.log" 2>&1; then :
  else test "$?" = 130; fi
  test ! -e "$DSH_HOME/settings.yaml"
  test -f "$DSH_HOME/settings.yaml.imported"
  cmp -s "$ROLLBACK_ROOT/settings.yaml" "$DSH_HOME/settings.yaml.imported"
  stat -c 'import marker mtime=%y' "$DSH_HOME/settings.yaml.imported"
  profile_patch_keys "$SETTINGS_PATCH" >"$ROLLBACK_ROOT/settings-owner.after.keys"
  if diff -u "$ROLLBACK_ROOT/settings-owner.before.keys" "$ROLLBACK_ROOT/settings-owner.after.keys"; then :
  else test "$?" = 1; fi
  node --input-type=module - "$ROLLBACK_ROOT/settings-owner.expected.keys" "$ROLLBACK_ROOT/settings-owner.after.keys" <<'NODE'
import { readFileSync } from 'node:fs'
const [expected, actual] = process.argv.slice(2).map(file => new Set(readFileSync(file, 'utf8').split('\n').filter(Boolean)))
const missing = [...expected].filter(key => !actual.has(key))
for (const key of missing) console.error(`import key missing: ${key}`)
if (missing.length) process.exit(1)
console.log('expected imported sections/keys present; values checked privately')
NODE
else
  printf '%s\n' 'no staged import; do not move an existing import marker back'
fi
```

Expected output for a staged import is `import marker mtime=<timestamp>`, a
keys-only patch diff (or no diff when the keys already existed), and
`expected imported sections/keys present; values checked privately`, with
exit 0 after the owned boot exited 130. Without a staged file, expected
output is the one `no staged import` line. The confirmation alone is not proof
that every section was accepted. A section rejected at import
(`dsh-settings/lib/index.js:358`) stays only in `.imported`: detect missing
mapped sections/keys in the projected patch, stop and re-author them by hand,
never move the file back for another import. Existing keys can make the diff
empty even when values changed; the keys check does not replace the private
value comparison, and no log receipt is claimed.

A concrete partial-import case: `settings.update` delegates to the write path
(`dsh-settings/lib/index.js:470-472`), which requires the mapped target to be
an active configurable row (`:501-506`). Legacy `ui-onboarding` maps to
`ui-settings-general` (`:302-308`), declared only by the web-app bundle
(`dsh-web-app/cordis.patch.yml:304-305`). A dashi-owned import without that web
row rejects the section and leaves it in `.imported`; restore it by hand only
in a profile that actually has the target row, not by inventing one in dashi.
Valid `agent-default-model` and `llm-pi-ai` sections do land in the normal dashi
composition: both are base-bundle rows (`dsh-base/cordis.patch.yml:85,130`).

For each other profile that previously relied on the global file and lacks its
own provider/model rows, privately copy **only the needed selection section**
from `settings.yaml.imported` (or the private backup) into that profile's
`cordis.patch.yml`: an id-targeted patch with the section's fields under
`config`. Apply the legacy section-id map from
`dsh-settings/lib/index.js:302-308`: `ui-developer-tools` -> `ui-settings`,
`ui-onboarding` -> `ui-settings-general`, `shell` -> `bash-sandbox` on Linux
(`pwsh-sandbox` on Windows); other section ids, including
`agent-default-model`, stay unchanged. Do not copy all legacy sections into all
profiles, add duplicate entries, overwrite their own rows, or switch providers.
Preserve other patch entries and privately verify the restored provider/model
equal the prior selection. For the web profile the native settings UI is the
interactive equivalent (`dsh-api-settings-controller/lib/index.js:401-410,460-468`
delegates to `settings.update`). There is **no** `dsh settings` CLI in alpha.2:
`dsh/lib/bin.js:115-129` treats `settings` as a profile name.

Before and after each manual document/UI edit, save keys-only evidence (replace
`<profile>` with that eligible profile, and perform the edit between the two
projections):

```sh
RESTORE_PROFILE='<profile>'
profile_patch_keys "$DSH_HOME/profiles/$RESTORE_PROFILE/cordis.patch.yml" >"$ROLLBACK_ROOT/$RESTORE_PROFILE.before.keys"
# Make the narrowly scoped profile-document or native-settings-UI edit here.
profile_patch_keys "$DSH_HOME/profiles/$RESTORE_PROFILE/cordis.patch.yml" >"$ROLLBACK_ROOT/$RESTORE_PROFILE.after.keys"
if diff -u "$ROLLBACK_ROOT/$RESTORE_PROFILE.before.keys" "$ROLLBACK_ROOT/$RESTORE_PROFILE.after.keys"; then :
else test "$?" = 1; fi
```

Expected output is only a diff of row ids/key paths, or none if unchanged; no
values. This projection cannot certify equality of values: check that privately
against the backup. Run section 5's registration checks before any model turn.

### Give the daemon its product command and advertisement

On the measured umka-dev1 layout, the service's current PATH lacks
`$HOME/node_modules/.bin`, its EnvironmentFile does not set PATH, and no
drop-in exists. Add that directory ahead of the existing effective PATH with
a direct controlled write of the already-backed-up owned drop-in. Separately,
inspect the single products assignment's quoting and append `sessionbus-dsh`
inside that assignment only. The script preserves every other byte and the
existing file inode, owner, and mode. It rejects multiple lines, mismatched
quotes, or product text outside the allowed identifier grammar.

```sh
grep '^SESSIONBUS_PRODUCTS=' "$SESSIONBUS_SERVICE_ENV"
case ":$SERVICE_PATH:" in
  *":$HOST_BIN_DIR:"*) printf '%s\n' 'service PATH already contains host bin' ;;
  *)
    mkdir -p "$(dirname "$SERVICE_DROPIN")"
    cat >"$SERVICE_DROPIN" <<EOF
[Service]
Environment="PATH=$HOST_BIN_DIR:$SERVICE_PATH"
EOF
    chmod 0644 "$SERVICE_DROPIN"
    ;;
esac
node --input-type=module - "$SESSIONBUS_SERVICE_ENV" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'
const file = process.argv[2]
const source = readFileSync(file, 'utf8')
const matches = [...source.matchAll(/^SESSIONBUS_PRODUCTS=([^\r\n]*)(\r?)$/gm)]
if (matches.length !== 1) throw new Error(`expected one SESSIONBUS_PRODUCTS assignment, found ${matches.length}`)
const match = matches[0]
const raw = match[1]
let quote = ''
let body = raw
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
  quote = raw[0]
  body = raw.slice(1, -1)
} else if (raw.includes('"') || raw.includes("'")) {
  throw new Error('SESSIONBUS_PRODUCTS has unsupported quoting')
}
const products = body.split(',').map(value => value.trim()).filter(Boolean)
if (products.some(value => !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(value))) throw new Error('SESSIONBUS_PRODUCTS contains an invalid product')
if (!products.includes('sessionbus-dsh')) products.push('sessionbus-dsh')
const next = `SESSIONBUS_PRODUCTS=${quote}${products.join(',')}${quote}${match[2]}`
writeFileSync(file, source.slice(0, match.index) + next + source.slice(match.index + match[0].length))
NODE
test "$(stat -c '%a' "$SESSIONBUS_SERVICE_ENV")" = "$(cat "$ROLLBACK_ROOT/service/service-env-mode")"
test "$(stat -c '%u:%g' "$SESSIONBUS_SERVICE_ENV")" = "$(cat "$ROLLBACK_ROOT/service/service-env-owner")"
grep '^SESSIONBUS_PRODUCTS=' "$SESSIONBUS_SERVICE_ENV"
systemctl --user daemon-reload
systemctl --user restart "$SESSIONBUS_UNIT"
systemctl --user is-active "$SESSIONBUS_UNIT"
SESSIONBUS_PID=$(systemctl --user show "$SESSIONBUS_UNIT" -p MainPID --value)
test "$SESSIONBUS_PID" -gt 0
SERVICE_PATH_LINE=$(tr '\0' '\n' < "/proc/$SESSIONBUS_PID/environ" | grep '^PATH=')
SERVICE_PATH=${SERVICE_PATH_LINE#PATH=}
printf '%s\n' "$SERVICE_PATH_LINE"
PATH="$SERVICE_PATH" command -v sessionbus-dsh dsh
PATH="$SERVICE_PATH" sessionbus --version
sessionbus roster --local --json | node --input-type=module -e '
  let body = ""; for await (const chunk of process.stdin) body += chunk
  const products = JSON.parse(body).local.products
  console.log(`sessionbus-dsh advertised: ${products.includes("sessionbus-dsh")}`)
  if (!products.includes("sessionbus-dsh")) process.exit(1)
'
```

Expected output shows the original products line, then the same quoting with
`,sessionbus-dsh` added once; only one service restart occurs. The final lines
are:

```text
active
PATH=/home/antst/node_modules/.bin:/home/antst/.local/bin:/usr/local/bin:/usr/bin:/bin
/home/antst/node_modules/.bin/sessionbus-dsh
/home/antst/node_modules/.bin/dsh
sessionbus v0.5.12 (fd85d7ee3a19735b2712fbbacdef30d62720cd5b)
sessionbus-dsh advertised: true
```

Do not edit a shell rc file. The task-shell export is temporary; the systemd
drop-in is the persistent authority used by daemon-launched products.

### Variant: dashi as the only registered product

This subsection is an alternative, not a step in the live `umka-dev1`
two-product procedure above. Choose the two-product form when the daemon needs
the package-owned `sessionbus-dsh` lane command independently of dashi. Choose
this variant on a dashi host when peers and lanes should share the one registered
product `dashi`.

Use the same profile package add, but replace the lane installer's default call
with this explicit product and verify the repaired row:

```sh
"$DSH_BIN" plugin --profile sessionbus exec sessionbus-dsh-install --product dashi
grep -F 'config: { mode: lane, product: dashi }' "$DSH_HOME/profiles/sessionbus/cordis.patch.yml"
```

Expected output includes:

```text
config: { mode: lane, product: dashi }
```

When `dashi` is already in `SESSIONBUS_PRODUCTS`, no product addition is
needed; do not append `sessionbus-dsh`. The daemon maps `dashi` to the installed
`dashi` bin. Apply the same service PATH drop-in used above, because the daemon
must resolve both that launcher and the child `dsh` that it starts. After the
single restart, verify both commands under the effective service PATH:

```sh
PATH="$SERVICE_PATH" command -v dashi dsh
```

Expected output on `umka-dev1` is:

```text
/home/antst/node_modules/.bin/dashi
/home/antst/node_modules/.bin/dsh
```

For the lane acceptance below, use product `dashi` in both `describe` and
`spawn`; all run, terminal-record, acknowledgment, forget, and process-cleanup
steps stay unchanged.

## 5. Match the selected provider in model-running profiles

The `sessionbus` lane and the plain `web` peer use their own active profile's
`agent-default-model` selection. Alpha.2 moved the legacy settings document
into profile configuration (`dsh-settings/lib/index.js:343-362`); do not read
`$DSH_HOME/settings.yaml`. Record the intended provider name from the owner's
configuration before adding provider packages. The worked example uses the
base bundle's `deepseek-official`; replace this explicit choice when the owner
uses another provider. The offline probe below can independently resolve a
profile's actual selection through the native settings API when its provider
argument is omitted. Print the provider name only, never configuration or
credential values:

```sh
MODEL_PROVIDER=deepseek-official
printf 'selected provider=%s\n' "$MODEL_PROVIDER"
```

Expected output for this worked example is `selected provider=deepseek-official`.
If the two profiles select different providers, verify each with its own
explicit provider or omit the argument to check its native selection; do not
assume a shared global default.

The alpha.2 base bundle registers `@deepseek-ai/dsh-llm-deepseek-api-key` as row
`llm-deepseek` (`dsh-base/cordis.patch.yml:513-514`); that plugin
owns provider `deepseek-official`
(`packages/llm/llm-deepseek/src/index.ts:84-90`). When the selected provider is
anything else, both model-running profiles need the same provider plugin
packages and exact versions already carried by dashi. Inventory dashi's direct
packages first:

```sh
pnpm --dir "$DSH_HOME/profiles/dashi" list --depth 0
```

Expected output contains `@antst/dashi-app 0.2.0-alpha.2` and the selected
provider's direct plugin packages with their exact installed versions.

The umka worked example selects `deepseek-official`, so it adds no provider
package to either profile:

```sh
PROVIDER_PACKAGE_SPECS=()
```

Expected output: none.

For another provider such as `openai-codex`, populate that array with the exact
provider packages independently verified against alpha.2. Inventory the existing
dashi profile, read each package's published manifest and bundle declaration,
and verify its registered adapter and native model turn on this DSH line before
adopting it. A peer range alone is not runtime compatibility evidence; do not
automatically reuse the historical 0.3.0 provider example. A missing compatible provider is a stop,
not permission to pin an older API graph or substitute a fake service.

The accepted dsh-host configuration uses `dsh-codex@0.3.2`. Its manifest's
`@deepseek-ai/dsh-invariants: ^0.2.0-rc.1` peer (`dsh-codex/package.json:86`)
is stale metadata: DSH 0.2.1 removed that package. Leave this one peer unmet;
never install it or add an override to satisfy it. Preserve `autoInstallPeers:
false` in each provider-bearing profile's `pnpm-workspace.yaml` (not just the
task shell), alongside its other workspace settings. The uniform-lock check
above explicitly rejects **any** invariants record; accepted means missing,
not an old DSH island. For every profile carrying that provider, verify:

```sh
for profile_root in "$DSH_HOME"/profiles/* "$DSH_HOME"/profiles/.[!.]* "$DSH_HOME"/profiles/..?*; do
  [ -d "$profile_root" ] || continue
  profile_name=${profile_root##*/}
  [ "$profile_name" != node_modules ] || continue
  if [ -f "$profile_root/node_modules/dsh-codex/package.json" ]; then
    grep -Eq '^autoInstallPeers: false[[:space:]]*$' "$profile_root/pnpm-workspace.yaml" || exit 1
    node --input-type=module - "$profile_root/pnpm-lock.yaml" "$profile_name" <<'NODE' || exit 1
import { readFileSync } from 'node:fs'
const [lockFile, profile] = process.argv.slice(2)
const packages = readFileSync(lockFile, 'utf8').split('\nsnapshots:\n', 1)[0]
if (/^  '?@deepseek-ai\/dsh-invariants@/m.test(packages)) throw new Error(`removed invariants package in ${profile} lock: stop`)
console.log(`${profile}: autoInstallPeers=false; invariants lock records=0 (accepted unmet peer)`)
NODE
  fi
done
```

Expected output is one `autoInstallPeers=false; invariants lock records=0
(accepted unmet peer)` line for each profile with dsh-codex installed. A missing
or unreadable workspace/lock, a missing workspace setting, or any invariants
lock record stops. This read-only check includes custom and hidden profile
directories; non-directories and the `node_modules` fallback are ignored, as
are profiles without this provider. It never repairs them automatically. This
metadata exception does not waive any other graph check.

For `deepseek-official`, leave that array empty because the base bundle already
owns the adapter. Otherwise add every exact spec to both profiles and repair
each graph immediately afterwards:

```sh
if [ "$MODEL_PROVIDER" != deepseek-official ]; then
  test "${#PROVIDER_PACKAGE_SPECS[@]}" -gt 0
  for profile_name in sessionbus web; do
    for package_spec in "${PROVIDER_PACKAGE_SPECS[@]}"; do
      "$DSH_BIN" plugin --profile "$profile_name" add "$package_spec"
    done
    repair_dsh_graph "$DSH_HOME/profiles/$profile_name" 0.2.1-alpha.2 report "$profile_name"
    test "$?" -eq 0 || exit 1
  done
fi
```

Expected output lists each exact provider package in both profiles, then shows
each lock and physical graph coherent at alpha.2 and native runtime selection
at the new installation, with legacy physical entries reported only.

When `MODEL_PROVIDER=deepseek-official`, a daemon-launched lane must be able to
resolve `DEEPSEEK_API_KEY`. The alpha.2 credentials-local precedence is inherited
process environment, `$DSH_HOME/.credentials.yaml`, invocation-cwd `.env`, then
`$DSH_HOME/.env`
(`dsh-credentials-local/lib/index.js:12-24`). Check only for
presence, in that order, against the daemon environment and the lane cwd; never
print a value or a credential file:

```sh
if [ "$MODEL_PROVIDER" = deepseek-official ]; then
  CREDENTIAL_SOURCE=
  if tr '\0' '\n' < "/proc/$SESSIONBUS_PID/environ" | grep '^DEEPSEEK_API_KEY=.' >/dev/null; then
    CREDENTIAL_SOURCE='daemon environment'
  elif [ -f "$DSH_HOME/.credentials.yaml" ] && node --input-type=module - "$DSH_HOME/.credentials.yaml" "$DSH_INSTALL_DIR/node_modules/@deepseek-ai/dsh/package.json" <<'NODE'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
const [file, anchor] = process.argv.slice(2)
const require = createRequire(realpathSync.native(anchor))
const { parse } = require('yaml')
const value = parse(readFileSync(file, 'utf8'))?.refs?.DEEPSEEK_API_KEY
process.exit(typeof value === 'string' && value.length > 0 ? 0 : 1)
NODE
  then
    CREDENTIAL_SOURCE='$DSH_HOME/.credentials.yaml'
  elif [ -f "$LANE_CWD/.env" ] && grep -q '^DEEPSEEK_API_KEY=.' "$LANE_CWD/.env"; then
    CREDENTIAL_SOURCE='lane cwd .env'
  elif [ -f "$DSH_HOME/.env" ] && grep -q '^DEEPSEEK_API_KEY=.' "$DSH_HOME/.env"; then
    CREDENTIAL_SOURCE='$DSH_HOME/.env'
  fi
  test -n "$CREDENTIAL_SOURCE"
  printf 'deepseek credential present via %s\n' "$CREDENTIAL_SOURCE"
fi
```

Expected output for `deepseek-official` names exactly one source without its
value. For another provider, this block produces no output.

The alpha.2 LLM service exposes
`listProviders()` (`dsh-llm/lib/index.js:1893`). Write this bounded
probe into the rollback directory. It passes the native launch environment to
DSH without printing it, suppresses boot output, makes no provider request, and prints
only its one result line. An explicit provider argument bypasses all settings
lookup. When omitted, the probe uses the native settings document location
and active `agent-default-model` entry (`dsh-settings/lib/index.js:399-402,413-451`)
rather than reading the removed `settings.yaml` (`:343-362`). Home resolution
uses `dsh-home-paths/lib/index.js:109-110`. Unavailable native settings or a
missing selection fails clearly; no guessed file or provider is substituted:

```sh
cat >"$ROLLBACK_ROOT/check-profile-provider.mjs" <<'NODE'
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const profile = process.argv[2]
if (profile === undefined) throw new Error('usage: check-profile-provider.mjs PROFILE [INSTALL_DIR] [PROVIDER] [CWD]')
const home = process.env.HOME
if (home === undefined) throw new Error('HOME is required')
const installDir = process.argv[3] ?? home
const dshManifest = realpathSync(join(installDir, 'node_modules/@deepseek-ai/dsh/package.json'))
const anchoredRequire = createRequire(dshManifest)
const { resolveDshHome } = await import(pathToFileURL(anchoredRequire.resolve('@deepseek-ai/dsh-home-paths')).href)
const dshHome = resolveDshHome()
let provider = process.argv[4]
if (provider !== undefined && provider.length === 0) throw new Error('explicit provider must be nonempty')
const cwd = process.argv[5] ?? process.cwd()

const dshLib = join(dirname(dshManifest), 'lib')
const bootFile = 'profile-boot.js'
if (!existsSync(join(dshLib, bootFile))) throw new Error('alpha.2 profile-boot entry not found')
const appBootEntry = anchoredRequire.resolve('@deepseek-ai/dsh-app-boot')
const [{ runProfile }, { loadLayeredEnv }] = await Promise.all([
  import(pathToFileURL(join(dshLib, bootFile)).href),
  import(pathToFileURL(appBootEntry).href),
])

const patchDir = mkdtempSync(join(dshHome, '.provider-check-'))
const patchFile = join(patchDir, 'disable-sessionbus.yml')
writeFileSync(patchFile, '- id: sessionbus\n  disabled: true\n')
const stdoutWrite = process.stdout.write
const stderrWrite = process.stderr.write
process.stdout.write = () => true
process.stderr.write = () => true
let shutdown
let providers
try {
  const boot = await runProfile({
    environment: loadLayeredEnv('dsh', cwd),
    profile,
    patchFiles: [patchFile],
    args: ['--no-open', '--port', '0'],
  })
  shutdown = boot.shutdown
  if (provider === undefined) {
    const settings = boot.ctx.get('settings')
    if (!settings || typeof settings.describe !== 'function' || !settings.documentPath) {
      throw new Error('native settings API/document path unavailable; supply an explicit provider')
    }
    provider = settings.describe({ redactSecrets: true }).find(value => value.ns === 'agent-default-model')?.value?.provider
    if (typeof provider !== 'string' || provider.length === 0) {
      throw new Error('native settings agent-default-model.provider unavailable; supply an explicit provider')
    }
  }
  providers = boot.ctx.llm.listProviders().map(value => value.id).sort()
} finally {
  try {
    if (shutdown !== undefined) await shutdown.shutdown(0)
  } finally {
    process.stdout.write = stdoutWrite
    process.stderr.write = stderrWrite
    rmSync(patchDir, { recursive: true, force: true })
  }
}
if (!providers?.includes(provider)) throw new Error(`${provider} is not registered in profile ${profile}`)
console.log(`profile=${profile} provider=${provider} registered`)
NODE
```

Expected output: none; the script file is private to this rollback run.

The temporary patch disables only row id `sessionbus` for these two boots. The
lane row refuses peer mode without a launch token, while a fake token would
open a daemon connection; neither is part of an offline provider check. Base
and provider composition remain untouched. Run the same probe for both model-
running profiles with the launch token and peer groups explicitly absent:

```sh
for profile_name in sessionbus web; do
  if ! env -u SESSIONBUS_LAUNCH_TOKEN -u SESSIONBUS_GROUPS DSH_HOME="$DSH_HOME" \
    node "$ROLLBACK_ROOT/check-profile-provider.mjs" \
    "$profile_name" "$DSH_INSTALL_DIR" "$MODEL_PROVIDER" "$LANE_CWD"; then
    printf 'provider check failed for profile=%s\n' "$profile_name" >&2
    exit 1
  fi
  if ! (
    cd "$LANE_CWD" &&
    env -u SESSIONBUS_LAUNCH_TOKEN -u SESSIONBUS_GROUPS DSH_HOME="$DSH_HOME" \
      node "$ROLLBACK_ROOT/check-profile-provider.mjs" "$profile_name" "$DSH_INSTALL_DIR"
  ); then
    printf 'native provider selection check failed for profile=%s\n' "$profile_name" >&2
    exit 1
  fi
done
```

The first invocation checks the explicitly requested provider's registration;
the second omits the provider and checks the profile's actual native selection.
Its subshell preserves the lane working directory without adding a probe flag
or changing the operator's shell directory. Either failure stops the loop.
Expected output for the worked example (both select `deepseek-official`) is:

```text
profile=sessionbus provider=deepseek-official registered
profile=sessionbus provider=deepseek-official registered
profile=web provider=deepseek-official registered
profile=web provider=deepseek-official registered
```

Both commands exit 0. Any missing selected provider or `NO_ADAPTER` failure
stops the run before the real-daemon turn.

## 6. Verification on the real daemon

Plugin pre.17 keeps both interactive and managed-lane delivery active. An
interactive message admitted while its DSH root is idle starts a native turn.
For a lane, the daemon always wakes the idle worker with one managed Run when
an ordinary message reaches it. In dashi,
`/sessionbus <free text>` is a DSH skill invocation: the typed text remains the
user message and the Sessionbus operating instructions are injected as skill
context before the model turn.

Use one long-lived originating controller built against Sessionbus SDK 0.5.9
or later for each spawn cell, and keep it connected through the terminal
record, acknowledgment, and close. Older callers with the pre-`policy.trace`
closed response schema can reject the successful Open response and disconnect;
the daemon has already committed the child, but the detached caller then sees
RPC `-32002 not_connected`. A one-shot caller is also invalid because its
identity disappears immediately after the call. Record the controller's
authenticated identity and SDK version before proceeding.

Command-driven control drivers that type into native sessions must launch with
a PTY and keep their input open until an explicit shutdown. A plain-pipe launcher
that closes stdin can stop the driver before its proof finishes; preserve that
as harness history, not a native failure or permission to replay work. This does
not change the ordinary web server's ignored-stdin launch.

Preserve the owner's default model during host proofs. The web HTTP
`session/selectModel` RPC also saves the profile default in the background
(`dsh-api-session-controller/lib/index.js:722-745`, save at `:740`).
`agentDefaultModel.saveSelection` uses the configuration editor when present
(`dsh-agent-default-model/lib/index.js:54-68`), whose target is the profile patch
(`dsh-config-editor/lib/index.js:24-25,123`), not just the selected session.
An in-process host driver instead validates the requested route with
`ctx.llm.resolveCallConfig` and uses the pure
`ctx.sessionController.agents.selectForNextRequest(agent, selection)`
(`dsh-api-session-controller/lib/index.js:321-323`) for its exact proof roots.
Assert the native `modelSelection` projection or the next request header;
`agent.options` retains immutable launch values. Do not edit defaults, disable a
provider row, or restart an owner process to make a proof pass.

### Lane: package-owned launcher selects `dsh --profile sessionbus`

From the existing remote Sessionbus peer, first prove federated product
discovery. The daemon's local product list is not enough:

```json
{"action":"describe","arguments":{"product":"sessionbus-dsh","host":"umka-dev1"}}
```

Expected result: the call succeeds and lists the DSH lane's supported open
fields, including `cwd`.

In the umka-dev1 task shell, record the daemon's current direct children before
the spawn:

```sh
DAEMON_CHILDREN_BEFORE_RAW="$ROLLBACK_ROOT/daemon-children-before.raw"
DAEMON_CHILDREN_BEFORE="$ROLLBACK_ROOT/daemon-children-before"
pgrep_status=0
pgrep -P "$SESSIONBUS_PID" >"$DAEMON_CHILDREN_BEFORE_RAW" || pgrep_status=$?
test "$pgrep_status" -le 1
sed '/^$/d' "$DAEMON_CHILDREN_BEFORE_RAW" >"$DAEMON_CHILDREN_BEFORE.filtered"
LC_ALL=C sort "$DAEMON_CHILDREN_BEFORE.filtered" >"$DAEMON_CHILDREN_BEFORE"
printf '%s\n' 'daemon child baseline recorded'
```

Expected output is `daemon child baseline recorded`; child IDs are retained in
the shell and not printed.

Through the one long-lived controller, make the spawn, ordinary send, and wait
calls below. Replace `LANE_CWD` only with the exact `$LANE_CWD` printed during
preflight (`/home/antst/e2e-work` on umka-dev1); replace returned IDs only
after successful calls.

```json
{"id":"lane-spawn","action":"spawn","arguments":{"product":"sessionbus-dsh","host":"umka-dev1","name":"umka-dev1-lane-check","open":{"cwd":"LANE_CWD"},"extra_groups":["peer-dev"],"persistent":false,"auto_close_ms":0,"notify":false}}
{"id":"lane-send","action":"send","arguments":{"target":"RETURNED_SESSION_ID","message":"Reply with exactly: lane hello"}}
{"id":"lane-wait","action":"wait","arguments":{"session_id":"RETURNED_SESSION_ID","timeout_ms":150000}}
```

Expected spawn result: a new session ID with host suffix `@umka-dev1`. The
send returns one admitted delivery. The idle worker starts one managed Run
without an explicit `run` or `start` call. Expected wait handling depends on
the complete retained record:

- `state: done` is PASS only when `result.outcome: completed` and
  `result.result` is exactly `lane hello`. Record
  `result.native_stop_reason` when that optional field is present. A `done`
  record with a failed or interrupted `result.outcome` is recorded and
  acknowledged, but is not PASS.
- `state: unavailable` is recorded with its reason and acknowledged, but is
  not PASS and does not establish a native terminal.
- `state: running` is never acknowledged. Use `status` or one bounded `wait`
  with the same run ID, then apply these rules to the returned terminal record.

While the lane is open, identify the one new process owned directly by the
daemon and retain its PID for the close proof:

```sh
DAEMON_CHILDREN_AFTER_RAW="$ROLLBACK_ROOT/daemon-children-after.raw"
DAEMON_CHILDREN_AFTER="$ROLLBACK_ROOT/daemon-children-after"
NEW_LANE_PIDS_FILE="$ROLLBACK_ROOT/new-lane-pids"
pgrep_status=0
pgrep -P "$SESSIONBUS_PID" >"$DAEMON_CHILDREN_AFTER_RAW" || pgrep_status=$?
test "$pgrep_status" -le 1
sed '/^$/d' "$DAEMON_CHILDREN_AFTER_RAW" >"$DAEMON_CHILDREN_AFTER.filtered"
LC_ALL=C sort "$DAEMON_CHILDREN_AFTER.filtered" >"$DAEMON_CHILDREN_AFTER"
LC_ALL=C comm -13 "$DAEMON_CHILDREN_BEFORE" "$DAEMON_CHILDREN_AFTER" >"$NEW_LANE_PIDS_FILE"
mapfile -t NEW_LANE_PIDS <"$NEW_LANE_PIDS_FILE"
if [ "${#NEW_LANE_PIDS[@]}" -eq 1 ]; then
  LANE_PID=${NEW_LANE_PIDS[0]}
  test -d "/proc/$LANE_PID"
  printf '%s\n' 'one daemon-owned lane process recorded'
else
  LANE_PID=
  printf '%s\n' 'lane process attribution is ambiguous' >&2
fi
```

Expected output is `one daemon-owned lane process recorded`. If other daemon
launches race this check, retain the ambiguity, collect and acknowledge the
existing terminal record, close and forget this already-created lane, verify
its Sessionbus cleanup, and report that native-process attribution was not
proved. Do not create another lane or replay the run.

After recording the terminal state, `result.outcome`, optional
`result.native_stop_reason`, and `result.result`, ack the terminal record. Then
close and forget the disposable lane with the single public close call:

```json
{"id":"lane-ack","action":"ack","arguments":{"session_id":"RETURNED_SESSION_ID","run_id":"RETURNED_RUN_ID"}}
{"id":"lane-close","action":"close","arguments":{"session_id":"RETURNED_SESSION_ID","forget":true}}
{"id":"lane-after-list","action":"list","arguments":{"session_id":"RETURNED_SESSION_ID"}}
```

Expected results: `ack` consumes the already-inspected terminal record,
`close` succeeds, and `list` returns RPC error `unknown_session` with code
`-32001` (daemon `handlers.go:133-143`). `forget` removes the Sessionbus lane
record; it does not delete DSH's native session history. The all-rows check
below independently proves that no retained or offline row remains.

Back in the umka-dev1 task shell, also prove that the owned native process is
gone and that the daemon's all-rows roster has no forgotten row. Substitute
only the returned canonical session ID:

```sh
CLOSED_SESSION_ID='RETURNED_SESSION_ID'
if [ -n "${LANE_PID:-}" ]; then
  test ! -e "/proc/$LANE_PID"
else
  printf '%s\n' 'native process cleanup not attributable; report PID ambiguity' >&2
fi
sessionbus roster --all --json | node --input-type=module -e '
  let body = ""; for await (const chunk of process.stdin) body += chunk
  const target = process.argv[1]
  const roster = JSON.parse(body)
  const rows = [...(roster.local?.sessions ?? []), ...(roster.remote ?? []).flatMap(host => host.sessions ?? [])]
  if (rows.some(row => row.session_id === target)) throw new Error(`forgotten session remains: ${target}`)
  console.log("forgotten row absent")
' "$CLOSED_SESSION_ID"
```

Expected output:

```text
forgotten row absent
```

When one PID was attributed, the silent `/proc` assertion also proves that
native process is gone. When attribution was ambiguous, the roster cleanup is
still proved, but the native-process check remains an explicitly reported
uncertainty.

### Plain DSH peer: environment groups and a real reply

This proof deliberately does not use dashi. In a second terminal on
umka-dev1, run the plain web profile with no launch token and one non-secret
environment group:

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
: "${DSH_BIN:?use the executable selected in section 1}"
HOST_BIN_DIR="$(dirname "$DSH_BIN")"
export PATH="$HOST_BIN_DIR:$PATH"
env -u SESSIONBUS_LAUNCH_TOKEN SESSIONBUS_GROUPS='["peer-dev"]' "$HOST_BIN_DIR/dsh" --profile web --no-open --host 127.0.0.1 --port 0
```

Expected terminal result: the web server stays up without a sessionbus
configuration error. No socket export is needed: peer discovery uses a
nonempty `SESSIONBUS_SOCKET`, otherwise
`$XDG_RUNTIME_DIR/sessionbus/presence.sock`, otherwise
`/tmp/sessionbus-<uid>/presence.sock`. A daemon using a custom socket must set
`SESSIONBUS_SOCKET` for the launched peer. Open its local URL through the host's approved access
path and create one root DSH session. That root advertises product `dsh` and
group `peer-dev`; no profile row supplies the group.

Use the long-lived SDK 0.5.9+ controller as a same-group sender. Keep a
separate persistent native observer in `peer-dev` as the reply target because
the acceptance controller is not a model and may reject incoming deliveries.
The controller first lists and then messages the exact idle web session.
`list` shows only peers that share at least one group with its caller:

```json
{"id":"web-list","action":"list","arguments":{}}
{"id":"web-send","action":"send","arguments":{"target":"RETURNED_DSH_SESSION_ID","message":"Reply through sessionbus to REPLY_SESSION_ID with exactly: peer hello"}}
```

Expected results: the controller's `list` discovers the new `dsh` peer with
`peer-dev` among its groups. Replace `REPLY_SESSION_ID` with the persistent
observer's authenticated `self_info.session_id`, then `send` returns a
successful delivery receipt. A receipt proves admission, not model
consumption. Without a browser prompt or keypress, the idle web root starts a
native turn, uses its installed `sessionbus` tool, and the persistent observer
receives `peer hello` from the authenticated `dsh` session on the real bus.
Stop the web process normally and issue one more controller `list`; the web
row must be absent.

If a send has uncertain admission, preserve its delivery ID, receipt, and
reason and report the uncertainty. Never replay an uncertain send. Stop the
web process normally after the reply; rollback later preserves its profile for
inspection rather than deleting it.

### Dashi integration, separately

In another terminal, start the installed dashi profile without a launch token.
This is a separate integration check, not the peer-mode proof above:

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
: "${DASHI_BIN:?use the executable selected in section 1}"
HOST_BIN_DIR="$(dirname "$DASHI_BIN")"
export PATH="$HOST_BIN_DIR:$PATH"
env -u SESSIONBUS_LAUNCH_TOKEN SESSIONBUS_GROUPS='["peer-dev"]' "$HOST_BIN_DIR/dashi"
```

Expected terminal result: dashi opens normally with no Sessionbus
configuration error. The same-group controller's `list` sees its root as
product `dashi` with group `peer-dev`. Keep the persistent native observer as
the reply target and perform both human-visible checks:

1. Type `/sessionbus reply over the bus to REPLY_SESSION_ID with exactly:
   slash ok`. The transcript renders a Sessionbus skill-invocation context
   cell, the model runs, its tool result reports an admitted delivery, and the
   observer receives exactly `slash ok`.
2. Wait until dashi is idle. From the long-lived controller, send the dashi
   row `reply over the bus to REPLY_SESSION_ID with exactly: pong`. Without a
   dashi keypress, the transcript renders a delivered Context cell naming the
   controller, a new model turn starts, and the observer receives exactly
   `pong`.

For each case, a delivery receipt alone is insufficient: retain the dashi
session's skill or relay event, its model turn and tool result, and the
observer's authenticated reply. Exit dashi normally, then issue another
controller `list`; the dashi row must be absent.

Finally verify the dashi launcher without starting an interactive session:

```sh
HELP_FILE=$(mktemp)
"$DASHI_BIN" --help >"$HELP_FILE"
HELP_STATUS=$?
sed -n '1p' "$HELP_FILE"
printf 'dashi help exit=%s\n' "$HELP_STATUS"
rm "$HELP_FILE"
```

Expected output:

```text
dashi 0.2.0-alpha.2 on DSH 0.2.1-alpha.2
dashi help exit=0
```

## 7. Rollback

Rollback is safe after any partial stage. Stop any interactive web or dashi
process first. Use the rollback directory printed in preflight and source only
its generated package-version record:

```sh
test -n "${ROLLBACK_ROOT:-}"
. "$ROLLBACK_ROOT/versions.env"
ROLLBACK_FAILED="$ROLLBACK_ROOT/failed-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ROLLBACK_FAILED"
```

Expected output: none; one private `failed-*` directory now exists for any
new artifacts moved aside during recovery.

Remove the current plugin rows from every profile where its
installer is present. This path does not require a profile to boot:

```sh
for profile_name in web sessionbus; do
  installer="$DSH_HOME/profiles/$profile_name/node_modules/.bin/sessionbus-dsh-install"
  package="$DSH_HOME/profiles/$profile_name/node_modules/@sessionbus/dsh/package.json"
  installed_version=$(if [ -f "$package" ]; then node -p 'require(process.argv[1]).version' "$package" 2>/dev/null || true; fi)
  if [ "$installed_version" = '0.1.3' ] && [ -x "$installer" ]; then
    pnpm --dir "$DSH_HOME/profiles/$profile_name" exec sessionbus-dsh-install --remove "$profile_name"
  fi
done
```

Expected output: each installer-managed profile's managed rows are removed;
packages and pins are untouched. Absent or not-yet-installed
profiles are explicitly skipped. The dashi-app-owned dependency and bundle row
are restored with the dashi profile files below, not removed by this installer.

Restore the service environment and its prior PATH authority. Every operation
is guarded for a rollback that began before the service edit:

```sh
if [ -f "$ROLLBACK_ROOT/service/service.env" ]; then
  cp --preserve=mode "$ROLLBACK_ROOT/service/service.env" "$SESSIONBUS_SERVICE_ENV"
  chmod "$(cat "$ROLLBACK_ROOT/service/service-env-mode")" "$SESSIONBUS_SERVICE_ENV"
fi
if [ -f "$ROLLBACK_ROOT/service/dropin-existed" ] && [ -f "$ROLLBACK_ROOT/service/override.conf" ]; then
  mkdir -p "$(dirname "$SERVICE_DROPIN")"
  cp --preserve=mode "$ROLLBACK_ROOT/service/override.conf" "$SERVICE_DROPIN"
elif [ -e "$SERVICE_DROPIN" ]; then
  mv "$SERVICE_DROPIN" "$ROLLBACK_FAILED/created-service-override.conf"
  rmdir "$(dirname "$SERVICE_DROPIN")" 2>/dev/null || true
fi
systemctl --user daemon-reload
systemctl --user restart "$SESSIONBUS_UNIT"
systemctl --user is-active "$SESSIONBUS_UNIT"
cmp -s "$ROLLBACK_ROOT/service/service.env" "$SESSIONBUS_SERVICE_ENV"
test "$(stat -c '%a' "$SESSIONBUS_SERVICE_ENV")" = "$(cat "$ROLLBACK_ROOT/service/service-env-mode")"
test "$(stat -c '%u:%g' "$SESSIONBUS_SERVICE_ENV")" = "$(cat "$ROLLBACK_ROOT/service/service-env-owner")"
SESSIONBUS_PID=$(systemctl --user show "$SESSIONBUS_UNIT" -p MainPID --value)
RESTORED_PATH_LINE=$(tr '\0' '\n' < "/proc/$SESSIONBUS_PID/environ" | grep '^PATH=')
test "$RESTORED_PATH_LINE" = "PATH=$(cat "$ROLLBACK_ROOT/service/effective-path")"
sessionbus roster --local --json | node --input-type=module -e '
  import { readFileSync } from "node:fs"
  let body = ""; for await (const chunk of process.stdin) body += chunk
  const products = JSON.parse(body).local.products.sort()
  const previous = JSON.parse(readFileSync(process.argv[1], "utf8"))
  if (JSON.stringify(products) !== JSON.stringify(previous)) process.exit(1)
  console.log("original daemon advertisement restored")
' "$ROLLBACK_ROOT/service/products.json"
```

Expected final lines:

```text
active
original daemon advertisement restored
```

Restore the exact host manifest and lockfile, then install that frozen graph.
This replaces the target versions with the versions captured before the first
mutation; it does not pretend that top-level version re-adds reconstruct a
dependency graph:

```sh
if [ -f "$ROLLBACK_ROOT/host/package.json" ] && [ -f "$ROLLBACK_ROOT/host/pnpm-lock.yaml" ]; then
  cp --preserve=mode "$ROLLBACK_ROOT/host/package.json" "$DSH_INSTALL_DIR/package.json"
  cp --preserve=mode "$ROLLBACK_ROOT/host/pnpm-lock.yaml" "$DSH_INSTALL_DIR/pnpm-lock.yaml"
  pnpm --dir "$DSH_INSTALL_DIR" install --frozen-lockfile
fi
cmp -s "$ROLLBACK_ROOT/host/package.json" "$DSH_INSTALL_DIR/package.json"
cmp -s "$ROLLBACK_ROOT/host/pnpm-lock.yaml" "$DSH_INSTALL_DIR/pnpm-lock.yaml"
printf '%s\n' 'host manifest and frozen lock restored'
```

Expected output ends with:

```text
host manifest and frozen lock restored
```

Restore each pre-existing profile's manifest, lockfile, and patch, then install
its frozen graph. A file absent from the snapshot is moved aside if the upgrade
created it. Restore an existing web profile too; only a profile absent from the
snapshot is retained under `failed-*` rather than deleted:

```sh
restore_profile_file() {
  profile_name=$1
  file=$2
  saved="$ROLLBACK_ROOT/profiles/$profile_name/$file"
  target="$DSH_HOME/profiles/$profile_name/$file"
  if [ -f "$saved" ]; then
    cp --preserve=mode "$saved" "$target"
  elif [ -e "$target" ]; then
    mkdir -p "$ROLLBACK_FAILED/$profile_name"
    mv "$target" "$ROLLBACK_FAILED/$profile_name/$file"
  fi
}
for profile_name in dashi sessionbus web; do
  if [ -f "$ROLLBACK_ROOT/profiles/$profile_name/package.json" ]; then
    restore_profile_file "$profile_name" package.json
    restore_profile_file "$profile_name" pnpm-lock.yaml
    restore_profile_file "$profile_name" cordis.patch.yml
    pnpm --dir "$DSH_HOME/profiles/$profile_name" install --frozen-lockfile
  elif [ -d "$DSH_HOME/profiles/$profile_name" ]; then
    mv "$DSH_HOME/profiles/$profile_name" "$ROLLBACK_FAILED/$profile_name"
  fi
done
printf '%s\n' 'profile manifests, frozen locks, and patches restored'
```

Expected output ends with:

```text
profile manifests, frozen locks, and patches restored
```

Verify the restored files byte-for-byte and the installed package versions
against the preflight record:

```sh
for profile_name in dashi sessionbus web; do
  for file in package.json pnpm-lock.yaml cordis.patch.yml; do
    saved="$ROLLBACK_ROOT/profiles/$profile_name/$file"
    target="$DSH_HOME/profiles/$profile_name/$file"
    if [ -f "$saved" ]; then cmp -s "$saved" "$target"; fi
  done
done
if [ ! -f "$ROLLBACK_ROOT/profiles/web/package.json" ]; then test ! -e "$DSH_HOME/profiles/web"; fi
package_version() {
  if [ -f "$1" ]; then node -p 'require(process.argv[1]).version' "$1"; fi
}
test "$(package_version "$DSH_INSTALL_DIR/node_modules/@deepseek-ai/dsh/package.json")" = "$PREVIOUS_DSH_VERSION"
test "$(package_version "$DSH_INSTALL_DIR/node_modules/@antst/dashi-launcher/package.json")" = "$PREVIOUS_DASHI_LAUNCHER_VERSION"
test "$(package_version "$DSH_INSTALL_DIR/node_modules/@sessionbus/dsh/package.json")" = "$PREVIOUS_HOST_SESSIONBUS_DSH_VERSION"
test "$(package_version "$DSH_HOME/profiles/dashi/node_modules/@antst/dashi-app/package.json")" = "$PREVIOUS_DASHI_APP_VERSION"
test "$(package_version "$DSH_HOME/profiles/dashi/node_modules/@sessionbus/dsh/package.json")" = "$PREVIOUS_DASHI_SESSIONBUS_DSH_VERSION"
test "$(package_version "$DSH_HOME/profiles/sessionbus/node_modules/@sessionbus/dsh/package.json")" = "$PREVIOUS_LANE_SESSIONBUS_DSH_VERSION"
test "$(package_version "$DSH_HOME/profiles/web/node_modules/@sessionbus/dsh/package.json")" = "$PREVIOUS_WEB_SESSIONBUS_DSH_VERSION"
"$DSH_BIN" --version
printf '%s\n' 'rollback consistency verified'
```

Expected output ends with the version saved by this run's preflight:

```text
<PREVIOUS_DSH_VERSION>
rollback consistency verified
```

Recovery guarantees the prior frozen host and profile dependency graphs are
installed from their saved manifests and lockfiles, the target release's
managed rows are removed, the previous profile patches are restored, and the
service environment and effective PATH match preflight. It does not claim that
`node_modules` is byte-for-byte identical to its old physical layout; the
manifest, lockfile, resolved package versions, profile rows, service bytes, and
live service state are the consistency checks.

If this upgrade staged or imported a legacy settings file, restore the private
pre-upgrade copy **only when rolling back to the pre-0.2 installation** after
the profile patches are restored. Retain any staging/import marker under the
failed-artifacts directory instead of deleting it. Do not use this rollback
step to repeat an import on 0.2:

```sh
if [ -f "$ROLLBACK_ROOT/settings.yaml" ]; then
  case "$PREVIOUS_DSH_VERSION" in
    0.1.*) ;;
    *) printf '%s\n' 'legacy restore requires rollback to pre-0.2; stop' >&2; exit 1 ;;
  esac
  for marker in settings.yaml.pre-0.2 settings.yaml.imported; do
    if [ -e "$DSH_HOME/$marker" ]; then
      test ! -e "$ROLLBACK_FAILED/$marker"
      mv "$DSH_HOME/$marker" "$ROLLBACK_FAILED/$marker"
    fi
  done
  cp --preserve=mode "$ROLLBACK_ROOT/settings.yaml" "$DSH_HOME/settings.yaml"
  cmp -s "$ROLLBACK_ROOT/settings.yaml" "$DSH_HOME/settings.yaml"
  printf '%s\n' 'pre-0.2 legacy settings restored; import history retained privately'
fi
```

Expected output is that one status line when a legacy backup exists, otherwise
none. If the prior runtime is on 0.2, stop rather than create a new import.
