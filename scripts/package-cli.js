#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')

async function cliVersion (projectRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'cli', 'package.json'), 'utf8'))
  if (manifest.name !== 'road-music-cli' || manifest.private !== true || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) {
    throw new Error('cli/package.json에는 road-music-cli의 안정 버전과 private: true가 필요합니다.')
  }
  return manifest.version
}

function packageFilter (source) {
  return !['__pycache__', '.DS_Store', '.git'].includes(path.basename(source))
}

const requiredSkillsFiles = ['manifest.json', 'skills/road-music-skills-update/scripts/manage.cjs', 'skills/road-music-video-studio/scripts/studio.py']

async function assertSkillsBundle (projectRoot) {
  const bundle = path.join(projectRoot, 'skills', 'music-road-skills')
  try {
    const info = await fs.stat(bundle)
    if (!info.isDirectory()) throw new Error('not a directory')
    for (const file of requiredSkillsFiles) {
      const entry = await fs.stat(path.join(bundle, file))
      if (!entry.isFile()) throw new Error('not a file')
    }
  } catch {
    throw new Error(`CLI Release에는 완전한 skills/music-road-skills 번들이 필요합니다: ${requiredSkillsFiles.join(', ')}`)
  }
  return bundle
}

async function packageCli (outputDir = path.join(root, 'dist'), projectRoot = root, { requireSkillsBundle = false } = {}) {
  if (process.platform !== 'darwin') throw new Error('CLI ZIP packaging requires macOS ditto')
  const version = await cliVersion(projectRoot)
  await fs.mkdir(outputDir, { recursive: true })
  const stage = await fs.mkdtemp(path.join(outputDir, '.cli-package-'))
  const name = `RoadMusic-CLI-${version}`
  const kit = path.join(stage, name)
  try {
    await fs.mkdir(kit)
    const entries = ['cli', 'electron', 'renderer', 'python', 'docs', 'releases', 'release', 'tests', 'scripts',
      'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'AGENTS.md', 'CLAUDE.md',
      'build/icon.png', 'build/icon.icns', 'prompts/cli-workflows.md', 'prompts/ace-review.md',
      'skills/road-music', 'skills/road-music-ace']
    if (requireSkillsBundle) {
      await assertSkillsBundle(projectRoot)
      entries.push('skills/music-road-skills')
    } else {
      try {
        const info = await fs.stat(path.join(projectRoot, 'skills', 'music-road-skills'))
        if (info.isDirectory()) entries.push('skills/music-road-skills')
      } catch {}
    }
    for (const entry of entries) {
      const destination = path.join(kit, entry)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.cp(path.join(projectRoot, entry), destination, { recursive: true,
        filter: packageFilter })
    }
    const archive = path.join(stage, `${name}.zip`)
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', kit, archive])
    const finalPath = path.join(outputDir, `${name}.zip`)
    await fs.rename(archive, finalPath)
    return { path: finalPath, bytes: (await fs.stat(finalPath)).size }
  } finally { await fs.rm(stage, { recursive: true, force: true }) }
}

if (require.main === module) packageCli(undefined, undefined, { requireSkillsBundle: true }).then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
module.exports = { assertSkillsBundle, packageCli, cliVersion, packageFilter, requiredSkillsFiles }
