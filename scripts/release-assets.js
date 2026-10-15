#!/usr/bin/env node
'use strict'
const fs = require('node:fs/promises')
const { createReadStream } = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

async function releaseManifest (root, product) {
  const manifestPath = product === 'cli' ? path.join(root, 'cli', 'package.json') : path.join(root, 'package.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (product === 'cli' && (manifest.name !== 'road-music-cli' || manifest.private !== true)) throw new Error('cli/package.json의 CLI 제품 정보가 잘못되었습니다.')
  return manifest
}

async function prepareAssets (root = path.resolve(__dirname, '..'), { product = 'app' } = {}) {
  if (!['app', 'cli'].includes(product)) throw new Error('product는 app 또는 cli여야 합니다.')
  const { version } = await releaseManifest(root, product)
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('A stable version is required')
  const dist = path.join(root, 'dist')
  const names = product === 'app'
    ? [`RoadMusic-${version}-mac-arm64.dmg`, `RoadMusic-${version}-source.zip`]
    : [`RoadMusic-CLI-${version}.zip`]
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
  return { product, version, assets: [...names.map(name => path.join(dist, name)), manifest] }
}

if (require.main === module) {
  const [flag, product] = process.argv.slice(2)
  if (flag !== undefined && (flag !== '--product' || product === undefined || process.argv.length !== 4)) {
    console.error('사용법: release-assets.js [--product app|cli]')
    process.exitCode = 1
  } else prepareAssets(undefined, { product: product || 'app' }).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
module.exports = { prepareAssets, releaseManifest }
