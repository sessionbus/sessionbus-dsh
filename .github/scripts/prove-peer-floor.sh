#!/usr/bin/env bash
set -euo pipefail

version=0.1.5-rc.2
floor=0.2.1-alpha.2
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
work=$(mktemp -d "${RUNNER_TEMP:-/tmp}/sessionbus-dsh-floor.XXXXXX")
trap 'rm -rf -- "$work"' EXIT

tarball_name=$(npm pack --pack-destination "$work" --ignore-scripts --json --prefix "$root" | node -e 'let body=""; process.stdin.on("data", chunk => body += chunk).on("end", () => process.stdout.write(JSON.parse(body)[0].filename))')
profile="$work/home/profiles/peer-floor"
mkdir -p "$profile"
printf '%s\n' '{"name":"dsh-profile-peer-floor","private":true,"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base"],"patchReload":"startup"}}}' > "$profile/package.json"
printf '%s\n' 'node-linker=hoisted' 'auto-install-peers=false' > "$profile/.npmrc"
printf '%s\n' '# below-floor profile must remain byte-identical' '[]' > "$profile/cordis.patch.yml"
mapfile -t peers < <(node - "$root/package.json" "$version" <<'NODE'
const [manifestFile, version] = process.argv.slice(2)
const peers = JSON.parse(require('node:fs').readFileSync(manifestFile)).peerDependencies
for (const name of Object.keys(peers)) {
  if (name.startsWith('@deepseek-ai/dsh-')) console.log(`${name}@${version}`)
}
NODE
)
PNPM_CONFIG_BLOCK_EXOTIC_SUBDEPS=false pnpm --dir "$profile" add --save-exact --ignore-scripts "$work/$tarball_name" \
  "@deepseek-ai/dsh@$version" @deepseek-ai/cordis@4.0.2 @deepseek-ai/cordis-plugin-loader@1.0.3 \
  "${peers[@]}" > "$work/install.log" 2>&1
PNPM_CONFIG_BLOCK_EXOTIC_SUBDEPS=false pnpm --dir "$profile" peers check --json > "$work/peers.json" 2>&1 || true
cat "$work/install.log"
cat "$work/peers.json"
node - "$root/package.json" "$profile/package.json" "$work/install.log" "$work/peers.json" "$version" <<'NODE'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const [sourceFile, installedFile, logFile, peersFile, version] = process.argv.slice(2)
const source = JSON.parse(fs.readFileSync(sourceFile))
const installed = JSON.parse(fs.readFileSync(installedFile))
const log = fs.readFileSync(logFile, 'utf8')
let bad
try { bad = JSON.parse(fs.readFileSync(peersFile, 'utf8'))['.'].bad } catch {}
assert.ok(installed.dependencies['@sessionbus/dsh'])
for (const [name, range] of Object.entries(source.peerDependencies)) {
  if (name.startsWith('@deepseek-ai/dsh-')) {
    assert.ok(bad?.[name]?.some(peer => peer.wantedRange === range && peer.foundVersion === version) || log.includes(`unmet peer ${name}@${range}: found ${version}`))
  }
}
NODE
cp "$profile/package.json" "$work/manifest-before-refusal.json"
cp "$profile/cordis.patch.yml" "$work/patch-before-refusal.yml"
set +e
PATH="$profile/node_modules/.bin:$PATH" DSH_HOME="$work/home" "$profile/node_modules/.bin/sessionbus-dsh-install" --product dsh peer-floor > "$work/refusal.stdout" 2> "$work/refusal.stderr"
status=$?
set -e
[[ "$status" -eq 2 ]]
grep -Fx "sessionbus-dsh-install: installed DSH $version does not satisfy >=$floor; run docs/HOST-INSTALL.md preflight before upgrading" "$work/refusal.stderr"
cmp -s "$work/manifest-before-refusal.json" "$profile/package.json"
cmp -s "$work/patch-before-refusal.yml" "$profile/cordis.patch.yml"
echo "DSH $version pnpm below-floor warnings; installer refusal with unchanged profile: PASS"

npm view "@deepseek-ai/dsh@$floor" --json > "$work/cli.json"
node "$root/.github/scripts/dsh-cli-pins.mjs" prepare "$floor" "$work/cli.json" "$profile/.pnpmfile.cjs" > "$work/cli-pins.txt"
mapfile -t cli_pins < "$work/cli-pins.txt"
mapfile -t floor_peers < <(node - "$root/package.json" "$floor" <<'NODE'
const peers = require(process.argv[2]).peerDependencies
for (const name of Object.keys(peers)) if (name.startsWith('@deepseek-ai/dsh-')) console.log(`${name}@${process.argv[3]}`)
NODE
)
pnpm --dir "$profile" add --save-exact "@deepseek-ai/dsh@$floor" "${floor_peers[@]}" "${cli_pins[@]}"
node "$root/.github/scripts/dsh-cli-pins.mjs" assert "$floor" "$work/cli.json" "$profile/pnpm-lock.yaml"
PATH="$profile/node_modules/.bin:$PATH" DSH_HOME="$work/home" "$profile/node_modules/.bin/sessionbus-dsh-install" --product dsh peer-floor
DSH_HOME="$work/home" "$profile/node_modules/.bin/sessionbus-dsh-install" --remove peer-floor
node - "$profile" <<'NODE'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const profile = process.argv[2]
const manifest = JSON.parse(fs.readFileSync(`${profile}/package.json`))
const patch = fs.readFileSync(`${profile}/cordis.patch.yml`, 'utf8')
assert.equal(manifest.dependencies?.['@sessionbus/dsh'], undefined)
assert.doesNotMatch(patch, /id:\s*sessionbus|id:\s*file-uploads-none/u)
NODE
echo "DSH $floor compatible-floor install and uninstall: PASS"
