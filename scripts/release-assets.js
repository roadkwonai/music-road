#!/usr/bin/env node
'use strict'
const fs = require('node:fs/promises')
const { createReadStream } = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

async function prepareAssets (root = path.resolve(__dirname, '..')) {
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('A stable version is required')
  const dist = path.join(root, 'dist')
  const names = [`RoadMusic-${version}-mac-arm64.dmg`, `RoadMusic-${version}-cli.zip`]
  const lines = []
  for (const name of names) {
    const file = path.join(dist, name)
    const info = await fs.lstat(file)
    if (!info.isFile() || !info.size) throw new Error(`Missing or empty release artifact: ${name}`)
    const hash = crypto.createHash('sha256')
    for await (const chunk of createReadStream(file)) hash.update(chunk)
    lines.push(`${hash.digest('hex')}  ${name}\n`)
  }
  const manifest = path.join(dist, 'SHA256SUMS.txt')
  const temporary = `${manifest}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    await fs.writeFile(temporary, lines.join(''), { flag: 'wx' })
    await fs.rename(temporary, manifest)
  } finally { await fs.rm(temporary, { force: true }) }
  return { version, assets: [...names.map(name => path.join(dist, name)), manifest] }
}

if (require.main === module) prepareAssets().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
module.exports = { prepareAssets }
