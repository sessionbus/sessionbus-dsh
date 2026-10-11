#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
work=$(mktemp -d "${RUNNER_TEMP:-/tmp}/sessionbus-native-floor.XXXXXXXX")
mkdir -p "$work/pack"
npm pack --ignore-scripts --json --pack-destination "$work/pack" --prefix "$root" >"$work/pack.json"
tarball="$work/pack/$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1]))[0].filename' "$work/pack.json")"
npm install --prefix "$work/cli" --save-exact @deepseek-ai/dsh@0.2.1-alpha.1 >"$work/cli-install.log" 2>&1
export PATH="$work/cli/node_modules/.bin:$PATH"
node "$root/.github/scripts/prove-native-floor.mjs" "$work/proof" '["dsh"]' "$tarball" "$root"
printf 'native floor evidence: %s\n' "$work"
