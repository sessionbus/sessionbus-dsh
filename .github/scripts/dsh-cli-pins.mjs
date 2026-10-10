import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// Same CLI-minimum rule as dashi's W-109 helper; one pin map for every consumer.
export function deriveCliPins(dependencies) {
  return Object.fromEntries(Object.entries(dependencies ?? {}).flatMap(([name, declaration]) => {
    if (!name.startsWith('@deepseek-ai/') || name.startsWith('@deepseek-ai/dsh')) return []
    const floor = /^(?:\^|~|>=)?(\d+\.\d+\.\d+(?:-[\da-z.-]+)?)$/i.exec(declaration)
    if (!floor) throw new Error(`cannot derive CLI minimum for ${name}: ${String(declaration)}`)
    return [[name, floor[1]]]
  }))
}

export function assertPinnedGraph(lockfile, pins, version) {
  const packages = lockfile.trimStart().startsWith('{')
    ? Object.entries(JSON.parse(lockfile).packages).flatMap(([location, record]) => {
      const name = /(?:^|\/)node_modules\/(@deepseek-ai\/[^/]+)$/.exec(location)?.[1]
      return name ? [[location, name, record.version]] : []
    })
    : [...lockfile.split('\nsnapshots:\n', 1)[0].matchAll(/^  '?(@deepseek-ai\/[^@']+)@([^':]+)'?:$/gm)]
  for (const [name, pin] of Object.entries(pins)) {
    const versions = packages.filter(([, packageName]) => packageName === name).map(([, , resolved]) => resolved)
    if (versions.length !== 1 || versions[0] !== pin) throw new Error(`${name} must resolve once at CLI minimum ${pin}; found ${versions.join(', ') || 'none'}`)
  }
  for (const [, name, resolved] of packages) {
    if (name.startsWith('@deepseek-ai/dsh') && resolved !== version) throw new Error(`${name}@${resolved} is not the requested DSH ${version}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [action, version, manifestFile, destination] = process.argv.slice(2)
  const pins = deriveCliPins(JSON.parse(fs.readFileSync(manifestFile)).dependencies)
  if (action === 'prepare') {
    fs.writeFileSync(destination, `const pins = ${JSON.stringify(pins)}\nconst version = ${JSON.stringify(version)}\nmodule.exports = { hooks: { readPackage(pkg) {\n  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {\n    for (const name of Object.keys(pkg[field] ?? {})) {\n      if (name.startsWith('@deepseek-ai/dsh')) pkg[field][name] = version\n      else if (pins[name]) pkg[field][name] = pins[name]\n    }\n  }\n  return pkg\n} } }\n`)
    for (const [name, pin] of Object.entries(pins)) console.log(`${name}@${pin}`)
  } else if (action === 'assert') {
    assertPinnedGraph(fs.readFileSync(destination, 'utf8'), pins, version)
    console.log(`uniform DSH ${version}; CLI companion pins ${JSON.stringify(pins)}: PASS`)
  } else throw new Error('use prepare or assert')
}
