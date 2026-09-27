import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const view = promisify(execFile)
const version = process.argv[2]
if (!version) throw new Error('pass the DSH version')

const seen = new Set(['@deepseek-ai/dsh'])
const pending = ['@deepseek-ai/dsh']
let latest = 0
let latestName = ''

while (pending.length > 0) {
  const batch = pending.splice(0, 8)
  const manifests = await Promise.all(batch.map(async name => {
    const { stdout } = await view('npm', [
      'view', `${name}@${version}`, 'dependencies', 'optionalDependencies', 'peerDependencies',
      `time[${version}]`, '--json',
    ])
    return JSON.parse(stdout)
  }))
  for (const [index, manifest] of manifests.entries()) {
    const published = Date.parse(typeof manifest === 'string' ? manifest : manifest[`time[${version}]`])
    if (!Number.isFinite(published)) throw new Error(`missing publish time for ${batch[index]}@${version}`)
    if (published > latest) { latest = published; latestName = batch[index] }
    const references = typeof manifest === 'string' ? [] : [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]
    for (const name of references) {
      if (name.startsWith('@deepseek-ai/dsh') && !seen.has(name)) {
        seen.add(name)
        pending.push(name)
      }
    }
  }
}

console.error(`DSH ${version} closure: ${seen.size} packages; latest ${latestName} at ${new Date(latest).toISOString()}`)
console.log(new Date(latest + 1000).toISOString())
