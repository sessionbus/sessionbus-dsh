#!/usr/bin/env bash
set -euo pipefail

mode=${1:?pass npm-global, pnpm10-global, pnpm11-global, pnpm12-global, npx, project or mixed}
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
work=$(mktemp -d "${RUNNER_TEMP:-/tmp}/sessionbus-universal.XXXXXXXX")
version=0.2.1-alpha.3
export W125_INSTALL_MODE="$mode"
began=$(date +%s)
export npm_config_cache="$work/npm-cache"
export npm_config_store_dir="$work/pnpm-store"
mkdir -p "$work/pack" "$work/install" "$work/inventory-home"
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");const file=process.argv[1];console.log(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")+"  "+file)' "${BASH_SOURCE[0]}" > "$work/running-source.sha256"
npm pack "$root" --ignore-scripts --json --pack-destination "$work/pack" >"$work/pack.json"
candidate="$work/pack/$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1]))[0].filename' "$work/pack.json")"

# These are the package managers' ordinary install operands, not CLI discovery
# inside the product. The executing DSH supplies all runtime identity facts.
case "$mode" in
  npm-global|mixed)
    npm install --global --prefix "$work/install" "@deepseek-ai/dsh@$version" >"$work/install.log" 2>&1
    export PATH="$work/install/bin:$PATH"
    if [ "$mode" = mixed ]; then
      npm install --prefix "$work/other-project" --save-exact @deepseek-ai/dsh@0.2.1-alpha.1 >"$work/other-install.log" 2>&1
      export PATH="$work/install/bin:$work/other-project/node_modules/.bin:$PATH"
      test "$(command -v dsh)" = "$work/install/bin/dsh"
      printf '%s\n' 'mixed fixture: global alpha.3 selected; project alpha.1 also on PATH, never selected'
    fi
    argv='["dsh"]'
    ;;
  pnpm10-global|pnpm11-global|pnpm12-global)
    manager=10.28.1
    if [ "$mode" = pnpm11-global ]; then manager=11.18.0; fi
    if [ "$mode" = pnpm12-global ]; then manager=12.11.2; fi
    npm install --prefix "$work/manager" --save-exact "pnpm@$manager" >"$work/manager.log" 2>&1
    export PNPM_HOME="$work/pnpm-bin"
    export XDG_CONFIG_HOME="$work/config"
    export npm_config_userconfig="$work/user.npmrc"
    global_bin="$work/global-bin"
    mkdir -p "$PNPM_HOME" "$global_bin" "$XDG_CONFIG_HOME"
    export PATH="$global_bin:$work/manager/node_modules/.bin:$PATH"
    test "$(pnpm --version)" = "$manager"
    pnpm --version > "$work/pnpm-version.txt"
    pnpm config get enableGlobalVirtualStore > "$work/global-virtual-store-before.txt"
    pnpm config set global-bin-dir "$global_bin"
    pnpm config set global-dir "$work/install"
    test "$(pnpm bin --global)" = "$global_bin"
    pnpm add --global --save-exact "@deepseek-ai/dsh@$version" >"$work/install.log" 2>&1
    if [ "$mode" = pnpm11-global ]; then
      # Upstream #9432: retain the actual default failure before the ordinary
      # remove/add remedy. This is a DSH distribution control, not our guard.
      set +e
      DSH_HOME="$work/inventory-home" dsh --profile headless --help >"$work/pnpm11-default.log" 2>&1
      default_status=$?
      set -e
      test "$default_status" -ne 0
      native_platform=linux-x64-gnu
      if [ "$(uname -s)" = Darwin ]; then native_platform=darwin-arm64; fi
      grep -F "No usable native binding found for node-addon-require-builtin-$native_platform (auto)" "$work/pnpm11-default.log" >/dev/null
      node --input-type=module - "$root/README.md" "$work/pnpm11-remedy.sh" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
const [source, destination] = process.argv.slice(2);
const text = fs.readFileSync(source, 'utf8').split('<!-- install:pnpm-global-remedy -->')[1];
const commands = text?.match(/^\s*```sh\n([\s\S]*?)\n```/u)?.[1];
assert.equal(commands, 'pnpm config set --global --json enableGlobalVirtualStore false\npnpm remove -g @deepseek-ai/dsh && pnpm add -g @deepseek-ai/dsh@0.2.1-alpha.3');
fs.writeFileSync(destination, `set -eu\n${commands}\n`);
NODE
      bash "$work/pnpm11-remedy.sh" >"$work/pnpm11-remedy.log" 2>&1
      pnpm config get enableGlobalVirtualStore > "$work/global-virtual-store-after.txt"
      grep -Fx false "$work/global-virtual-store-after.txt" >/dev/null
      printf '%s\n' 'pnpm11: default native-binding failure observed; documented config/remove/add remedy applied'
    fi
    argv='["dsh"]'
    ;;
  npx)
    argv='["npx","--yes","--package=@deepseek-ai/dsh@0.2.1-alpha.3","dsh"]'
    ;;
  project)
    npm install --prefix "$work/install" --save-exact "@deepseek-ai/dsh@$version" >"$work/install.log" 2>&1
    export PATH="$work/install/node_modules/.bin:$PATH"
    argv='["dsh"]'
    ;;
  *) printf 'unknown install mode: %s\n' "$mode" >&2; exit 2 ;;
esac

node "$root/.github/scripts/prove-universal-profile.mjs" "$work/proof" "$argv" "$candidate" "$root"
elapsed=$(( $(date +%s) - began ))
printf 'universal install %s on %s: PASS; wall time %s s; evidence %s\n' "$mode" "$(uname -s)" "$elapsed" "$work"
