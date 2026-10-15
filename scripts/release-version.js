#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { releaseManifest } = require('./release-assets')

const products = { app: { prefix: 'v', initial: '0.1.0' }, cli: { prefix: 'cli-v', initial: '0.1.0' } }
function parts (version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null
  const result = version.split('.').map(Number)
  return result.every(Number.isSafeInteger) ? result : null
}
function compare (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] }

async function verifyReleaseVersion (root, { product, tag, releases }) {
  const policy = Object.hasOwn(products, product) ? products[product] : null
  if (!policy) throw new Error('product는 app 또는 cli여야 합니다.')
  if (!Array.isArray(releases)) throw new Error('공개 Release 목록은 배열이어야 합니다.')
  const { version, name } = await releaseManifest(root, product)
  const candidate = parts(version)
  if (!candidate || name !== (product === 'app' ? 'road-music' : 'road-music-cli') || tag !== `${policy.prefix}${version}`) throw new Error('제품 manifest 버전과 태그가 일치하지 않습니다.')
  if (releases.some(row => row?.tag_name === tag)) throw new Error('이미 존재하는 Release 버전은 다시 배포할 수 없습니다.')
  const history = releases.filter(row => !row?.draft && !row?.prerelease && typeof row?.tag_name === 'string' && row.tag_name.startsWith(policy.prefix))
    .map(row => row.tag_name.slice(policy.prefix.length)).filter(value => parts(value)).sort((a, b) => compare(parts(b), parts(a)))
  const previousVersion = history[0] || null
  if (!previousVersion) {
    if (version !== policy.initial) throw new Error(`${product} 첫 버전은 ${policy.initial}이어야 합니다.`)
  } else {
    const [major, minor, patch] = parts(previousVersion)
    const allowed = [`${major}.${minor}.${patch + 1}`, `${major}.${minor + 1}.0`, `${major + 1}.0.0`]
    if (!allowed.includes(version)) throw new Error(`${product} 버전은 ${previousVersion}에서 한 단계씩만 증가해야 합니다: ${allowed.join(', ')}`)
  }
  return { product, tag, version, previousVersion }
}

async function main () {
  const args = process.argv.slice(2)
  if (args.length !== 6 || args[0] !== '--product' || args[2] !== '--tag' || args[4] !== '--releases-json') throw new Error('사용법: release-version.js --product app|cli --tag TAG --releases-json FILE')
  const pages = JSON.parse(await fs.readFile(args[5], 'utf8'))
  if (!Array.isArray(pages)) throw new Error('공개 Release 목록은 배열이어야 합니다.')
  const result = await verifyReleaseVersion(path.resolve(__dirname, '..'), { product: args[1], tag: args[3], releases: pages.flat() })
  console.log(JSON.stringify(result))
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { verifyReleaseVersion }
