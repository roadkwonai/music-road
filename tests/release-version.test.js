'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { verifyReleaseVersion } = require('../scripts/release-version')

async function fixture (t, appVersion = '0.1.0', cliVersion = '0.1.0') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'road-release-version-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, 'cli'))
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'road-music', version: appVersion }))
  await fs.writeFile(path.join(root, 'cli/package.json'), JSON.stringify({ name: 'road-music-cli', version: cliVersion, private: true }))
  return root
}
const release = tag_name => ({ tag_name, draft: false, prerelease: false })

test('새 제품의 첫 버전은 앱 0.1.0과 CLI 0.1.0을 각각 사용한다', async t => {
  const root = await fixture(t)
  assert.equal((await verifyReleaseVersion(root, { product: 'app', tag: 'v0.1.0', releases: [release('cli-v0.1.0')] })).previousVersion, null)
  assert.equal((await verifyReleaseVersion(root, { product: 'cli', tag: 'cli-v0.1.0', releases: [release('v0.1.0')] })).previousVersion, null)
  const wrong = await fixture(t, '1.4.4')
  await assert.rejects(verifyReleaseVersion(wrong, { product: 'app', tag: 'v1.4.4', releases: [] }), /첫 버전/)
})

test('앱·CLI의 태그와 manifest를 섞거나 기존 버전을 재배포하면 거부한다', async t => {
  const root = await fixture(t)
  await assert.rejects(verifyReleaseVersion(root, { product: 'app', tag: 'cli-v0.1.0', releases: [] }), /태그/)
  await assert.rejects(verifyReleaseVersion(root, { product: 'cli', tag: 'v0.1.0', releases: [] }), /태그/)
  await assert.rejects(verifyReleaseVersion(root, { product: 'app', tag: 'v0.1.0', releases: [release('v0.1.0')] }), /이미/)
  await assert.rejects(verifyReleaseVersion(root, { product: 'app', tag: 'v0.1.0', releases: null }), /목록/)
})

test('해당 제품 최신 안정 버전에서 한 단계씩만 증가하고 다른 제품 번호는 무시한다', async t => {
  const history = [release('v0.1.0'), release('cli-v9.9.9'), { ...release('v5.0.0'), prerelease: true }]
  for (const version of ['0.1.1', '0.2.0', '1.0.0']) {
    const root = await fixture(t, version)
    assert.equal((await verifyReleaseVersion(root, { product: 'app', tag: `v${version}`, releases: history })).previousVersion, '0.1.0')
  }
  for (const version of ['0.0.9', '0.1.2', '1.4.4', '2.0.0']) {
    const root = await fixture(t, version)
    await assert.rejects(verifyReleaseVersion(root, { product: 'app', tag: `v${version}`, releases: history }), /한 단계/)
  }
  const root = await fixture(t, '0.1.0', '0.1.1')
  assert.equal((await verifyReleaseVersion(root, { product: 'cli', tag: 'cli-v0.1.1', releases: [release('v9.9.9'), release('cli-v0.1.0')] })).previousVersion, '0.1.0')
})

test('두 배포 워크플로는 공개 Release 목록과 제품별 버전 검사를 사용한다', async () => {
  for (const [file, product] of [['release.yml', 'app'], ['release-cli.yml', 'cli']]) {
    const body = await fs.readFile(path.join(__dirname, '../.github/workflows', file), 'utf8')
    assert.match(body, /gh api .*--paginate --slurp/)
    assert.ok(body.includes(`release-version.js --product ${product} --tag "$RELEASE_TAG" --releases-json "$RELEASES_JSON"`))
    assert.match(body, new RegExp(`concurrency:\\n  group: road-music-${product}-release\\n  cancel-in-progress: false`))
  }
})
