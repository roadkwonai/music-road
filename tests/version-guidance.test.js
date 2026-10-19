'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '..')

test('current version guidance links to the current reset report instead of the earlier same-number release', async () => {
  for (const file of ['README.md', 'docs/README.md', 'docs/updates.md', 'docs/cli-qa-report.md']) {
    const text = await fs.readFile(path.join(root, file), 'utf8')
    assert.ok(text.includes('version-reset-20261020-qa-report.md'), file)
  }
  const historical = await fs.readFile(path.join(root, 'docs/version-reset-qa-report.md'), 'utf8')
  assert.match(historical.slice(0, 600), /과거 검증 기록/)
  assert.match(historical.slice(0, 600), /version-reset-20261020-qa-report\.md/)
  const previous = await fs.readFile(path.join(root, 'docs/update-e2e-report.md'), 'utf8')
  assert.doesNotMatch(previous.slice(0, 800), /현재 설치는 \[앱 1\.4/)
  const qa = await fs.readFile(path.join(root, 'docs/cli-qa-report.md'), 'utf8')
  assert.doesNotMatch(qa, /최신 로컬 소스의 `schema`는 공개 명령 \*\*190개/)
})
