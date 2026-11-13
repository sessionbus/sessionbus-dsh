import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Backslash removal also finds old literals in escaped regexp assertions.
const stale = /0\.5\.12|(?:0\.2\.1-)?alpha\.\d+|0\.2\.1-rc\.\d+|0\.1\.6|pre\.20|\bdashi(?:\b|[-_/])|(?:node|Node)[\s":=v-]*22(?:\.[\dx]+)*|\b22\.(?:x|\d+)\b|sdkSchemas|selectionFor|selectForNextRequest|serializeImageAdmission|agents\.roots|isOwnedBy|reflect\.store|ownerFiber|moduleNamespace|packages\.current|stateOf\(|listChildren|exit_plan_mode|interrupt_agent|web_search|schedul|(?:create|cancel|delete|update|list|pause|resume)_(?:task|job)s?|tools\.execute|renderToolsSdk|prove-lane-options-before|dashi-app-version/u;
export function collectStaleHits(root) {
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && file !== '.github/fixtures/w155-stale-allowlist.json') files.push(file);
    }
  };
  for (const directory of ['.github/scripts', '.github/fixtures', '.github/workflows']) walk(directory);
  for (const file of fs.readdirSync(root)) if (/\.test\.[cm]?js$/u.test(file)) files.push(file);
  files.push('.github/dashi-app-version');
  return files.sort().flatMap(file => fs.readFileSync(path.join(root, file), 'utf8').split('\n')
    .flatMap((text, index) => stale.test(text.replaceAll('\\', '')) ? [{ path: file, line: index + 1, text }] : []));
}
export function assertClassified(hits, allow) {
  for (const entry of allow) {
    assert.equal(entry.class, 'b', 'only reviewed history/baseline/negative or current contract hits may remain');
    assert.ok(entry.reason?.length, 'each kept hit needs its disposition');
  }
  assert.deepEqual(hits, allow.map(({ path, line, text }) => ({ path, line, text })),
    'unclassified stale proof assumption: review it, do not refresh the allow-list silently');
}
