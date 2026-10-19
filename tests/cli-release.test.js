'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('CLI release notes use the independent CLI manifest and v-prefixed CLI note', async t => {
  const { resolveCliReleaseNote } = require('../scripts/release-notes')
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'road-cli-notes-'))
  t.after(() => fs.rm(fixture, { recursive: true, force: true }))
  await fs.writeFile(path.join(fixture, 'package.json'), JSON.stringify({ version: '1.4.0' }))
  await fs.mkdir(path.join(fixture, 'cli'), { recursive: true })
  await fs.writeFile(path.join(fixture, 'cli', 'package.json'), JSON.stringify({ name: 'road-music-cli', version: '0.1.0', private: true }))
  await fs.mkdir(path.join(fixture, 'releases', 'cli'), { recursive: true })
  const note = path.join(fixture, 'releases', 'cli', 'v0.1.0.md')
  await fs.writeFile(note, '# Road Music CLI 0.1.0\n')
  const result = await resolveCliReleaseNote(fixture, '0.1.0')
  assert.equal(result.path, note)
  assert.equal(result.title, 'Road Music CLI v0.1.0')
  assert.match(result.body, /^# Road Music CLI v0\.1\.0$/m)
  await assert.rejects(resolveCliReleaseNote(fixture, '0.1.1'), /cli\/package\.json/)
})

test('app and CLI workflows publish different tags and assets', async () => {
  const app = await fs.readFile(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8')
  const cli = await fs.readFile(path.join(root, '.github', 'workflows', 'release-cli.yml'), 'utf8')
  assert.match(app, /tags:\s*\['v\*'\]/)
  assert.match(app, /github\.event_name != 'push' \|\| github\.event\.deleted != true/)
  assert.match(app, /npm run dist:source/)
  assert.match(app, /RoadMusic-\$\{RELEASE_TAG#v\}-mac-arm64\.dmg/)
  assert.match(app, /RoadMusic-\$\{RELEASE_TAG#v\}-source\.zip/)
  assert.doesNotMatch(app, /RoadMusic-CLI-/)
  assert.match(cli, /tags:\s*\['cli-v\*'\]/)
  assert.match(cli, /require\("\.\/cli\/package\.json"\)\.version/)
  assert.match(cli, /npm run dist:cli/)
  assert.match(cli, /release-notes\.js resolve-cli/)
  assert.match(cli, /release-assets\.js --product cli/)
  assert.match(cli, /RoadMusic-CLI-\$\{RELEASE_TAG#cli-v\}\.zip/)
  assert.match(cli, /--latest=false/)
  assert.match(cli, /github\.event_name != 'push' \|\| github\.event\.deleted != true/)
  assert.doesNotMatch(cli, /RoadMusic-\$\{RELEASE_TAG#cli-v\}-mac/)
})


test('CLI Release requires the managed skills bundle and excludes local metadata', async t => {
  const { assertSkillsBundle, packageFilter } = require('../scripts/package-cli')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmusic-required-skills-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await assert.rejects(assertSkillsBundle(root), /완전한.*번들/)
  for (const file of require('../scripts/package-cli').requiredSkillsFiles) {
    const target = path.join(root, 'skills/music-road-skills', file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, '{}')
  }
  assert.equal(await assertSkillsBundle(root), path.join(root, 'skills/music-road-skills'))
  for (const name of ['.git', '.envrc', '.roadmusic', 'Output', 'node_modules', 'dist', '.omx', '.env.local', '._metadata', '__pycache__', 'test.pyc']) assert.equal(packageFilter('/tmp/' + name), false)
  assert.equal(packageFilter('/tmp/manifest.json'), true)
})
