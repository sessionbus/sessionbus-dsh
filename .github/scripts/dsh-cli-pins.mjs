import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Same CLI-minimum rule as dashi's W-109 helper; one pin map for every consumer.
export function storageZod(installation) {
  const start = fs.realpathSync(path.join(installation, 'node_modules/@deepseek-ai/dsh/package.json'))
  const pending = [start], seen = new Set()
  while (pending.length) {
    const manifest = pending.shift()
    if (seen.has(manifest)) continue
    seen.add(manifest)
    const pkg = JSON.parse(fs.readFileSync(manifest)), require = createRequire(manifest)
    if (pkg.name === '@deepseek-ai/dsh-storage-domain') {
      const zod = fs.realpathSync(require.resolve('zod/package.json'))
      return { producer: manifest, zod, version: JSON.parse(fs.readFileSync(zod)).version, range: pkg.dependencies.zod }
    }
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      if (!name.startsWith('@deepseek-ai/dsh')) continue
      // Traverse the installed closure; an unrelated absent peer is not a substitute producer.
      try { pending.push(fs.realpathSync(require.resolve(`${name}/package.json`))) }
      catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error }
    }
  }
  throw new Error('executing CLI closure has no dsh-storage-domain producer')
}

export function assertPluginZod(pluginManifest) {
  const require = createRequire(fs.realpathSync(pluginManifest))
  const producer = fs.realpathSync(require.resolve('@deepseek-ai/dsh-storage-domain/package.json'))
  const expected = fs.realpathSync(createRequire(producer).resolve('zod/package.json'))
  const actual = fs.realpathSync(require.resolve('zod/package.json'))
  const wanted = JSON.parse(fs.readFileSync(expected)), selected = JSON.parse(fs.readFileSync(actual))
  if (selected.name !== wanted.name || selected.version !== wanted.version) throw new Error(`plugin zod version mismatch: ${selected.name}@${selected.version} at ${actual} != storage-domain ${wanted.name}@${wanted.version} at ${expected}`)
  return actual
}

export function deriveCliPins(dependencies, installation) {
  const pins = Object.fromEntries(Object.entries(dependencies ?? {}).flatMap(([name, declaration]) => {
    if (!name.startsWith('@deepseek-ai/') || name.startsWith('@deepseek-ai/dsh')) return []
    const floor = /^(?:\^|~|>=)?(\d+\.\d+\.\d+(?:-[\da-z.-]+)?)$/i.exec(declaration)
    if (!floor) throw new Error(`cannot derive CLI minimum for ${name}: ${String(declaration)}`)
    return [[name, floor[1]]]
  }))
  // zod belongs to storage-domain, not the CLI anchor (which may resolve an unrelated major).
  if (installation) pins.zod = storageZod(installation).version
  return pins
}

export function assertPinnedGraph(lockfile, pins, version) {
  const packages = lockfile.trimStart().startsWith('{')
    ? Object.entries(JSON.parse(lockfile).packages).flatMap(([location, record]) => {
      const name = /(?:^|\/)node_modules\/(@deepseek-ai\/[^/]+|zod)$/.exec(location)?.[1]
      return name ? [[location, name, record.version]] : []
    })
    : [...lockfile.split('\nsnapshots:\n', 1)[0].matchAll(/^  '?(@deepseek-ai\/[^@']+|zod)@([^':]+)'?:$/gm)]
  for (const [name, pin] of Object.entries(pins)) {
    const versions = packages.filter(([, packageName]) => packageName === name).map(([, , resolved]) => resolved)
    if (name === 'zod') {
      if (!versions.includes(pin)) throw new Error(`storage-domain zod ${pin} is missing; found ${versions.join(', ') || 'none'}`)
      // Other majors are valid elsewhere; producer name/version equality is the importer oracle.
    } else if (versions.length !== 1 || versions[0] !== pin) throw new Error(`${name} must resolve once at CLI minimum ${pin}; found ${versions.join(', ') || 'none'}`)
  }
  for (const [, name, resolved] of packages) {
    if (name.startsWith('@deepseek-ai/dsh') && resolved !== version) throw new Error(`${name}@${resolved} is not the requested DSH ${version}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [action, version, manifestFile, destination, installation] = process.argv.slice(2)
  const pins = deriveCliPins(JSON.parse(fs.readFileSync(manifestFile)).dependencies, installation)
  if (action === 'prepare') {
    fs.writeFileSync(destination, `const pins = ${JSON.stringify(pins)}\nconst version = ${JSON.stringify(version)}\nmodule.exports = { hooks: { readPackage(pkg) {\n  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {\n    for (const name of Object.keys(pkg[field] ?? {})) {\n      if (name.startsWith('@deepseek-ai/dsh')) pkg[field][name] = version\n      else if (pins[name] && (name !== 'zod' || ['@sessionbus/dsh', '@deepseek-ai/dsh-storage-domain'].includes(pkg.name))) pkg[field][name] = pins[name]\n    }\n  }\n  return pkg\n} } }\n`)
    for (const [name, pin] of Object.entries(pins)) console.log(`${name}@${pin}`)
  } else if (action === 'assert') {
    assertPinnedGraph(fs.readFileSync(destination, 'utf8'), pins, version)
    console.log(`uniform DSH ${version}; CLI companion pins ${JSON.stringify(pins)}: PASS`)
  } else throw new Error('use prepare or assert')
}
