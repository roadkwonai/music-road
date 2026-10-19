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

const requiredSkillsFiles = ['manifest.json', 'skills/road-music-skills-update/scripts/manage.cjs', 'skills/road-music-video-studio/scripts/studio.py']
function packageFilter (source) {
  const name = path.basename(source)
  return !['__pycache__', '.DS_Store', '.git', '.env', '.envrc', '.roadmusic', '.omx', '.omc', '.impeccable', 'dist', 'Output', 'generatedOutput', 'node_modules'].includes(name) && !name.endsWith('.pyc') && !name.startsWith('._') && (!name.startsWith('.env') || name === '.env.example')
}
async function assertSkillsBundle (projectRoot) {
  const bundle = path.join(projectRoot, 'skills', 'music-road-skills')
  try {
    for (const file of requiredSkillsFiles) if (!(await fs.stat(path.join(bundle, file))).isFile()) throw new Error('not a file')
  } catch { throw new Error(`CLI Release에는 완전한 skills/music-road-skills 번들이 필요합니다: ${requiredSkillsFiles.join(', ')}`) }
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
    const entries = ['cli', 'electron', 'renderer', 'python', 'docs', 'releases', 'tests', 'scripts',
      'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'AGENTS.md', 'CLAUDE.md', 'DESIGN.md',
      '.agents/skills/harness', '.agents/skills/road-music-mv', '.codex/agents', '.harness/music-video',
      'build/icon.png', 'build/icon.icns', 'prompts/cli-workflows.md', 'prompts/ace-review.md',
      'skills/road-music', 'skills/road-music-ace', 'skills/road-music-storage', 'skills/road-music-production-records',
      { source: '.agents/skills/road-music-video-studio', destination: 'skills/road-music-video-studio' }]
    let bundled = false
    try { await assertSkillsBundle(projectRoot); bundled = true } catch (error) { if (requireSkillsBundle) throw error }
    if (bundled) {
      entries.splice(entries.findIndex(entry => typeof entry === 'object' && entry.destination === 'skills/road-music-video-studio'), 1)
      entries.push('skills/music-road-skills')
    }
    for (const entry of entries) {
      const source = typeof entry === 'string' ? entry : entry.source
      const destination = path.join(kit, typeof entry === 'string' ? entry : entry.destination)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.cp(path.join(projectRoot, source), destination, { recursive: true,
        filter: packageFilter })
    }
    const portableStudio = bundled ? 'skills/music-road-skills/skills/road-music-video-studio' : 'skills/road-music-video-studio'
    const studio = path.join(kit, portableStudio)
    const aliases = ['.agents/skills/road-music-video-studio', 'skills/road-music-video-studio'].map(name => path.join(kit, name))
    // Adapt source-document paths; managed bundle files remain byte-for-byte unchanged.
    async function relocateLinks (directory) {
      if (directory === path.join(kit, 'skills/music-road-skills')) return
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) await relocateLinks(file)
        else if (entry.name.endsWith('.md')) {
          const original = await fs.readFile(file, 'utf8')
          const text = original.replace(/\]\(([^)\s]+)\)/g, (whole, href) => {
            if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href)) return whole
            const split = href.search(/[?#]/), name = split < 0 ? href : href.slice(0, split), suffix = split < 0 ? '' : href.slice(split)
            let resolved
            try { resolved = path.resolve(path.dirname(file), decodeURIComponent(name)) } catch { return whole }
            const alias = aliases.find(root => resolved === root || resolved.startsWith(root + path.sep))
            if (!alias) return whole
            const target = path.relative(path.dirname(file), path.join(studio, path.relative(alias, resolved)))
            return '](' + target.split(path.sep).map(encodeURIComponent).join('/') + suffix + ')'
          }).replaceAll('.agents/skills/road-music-video-studio', portableStudio)
            .replaceAll('`skills/road-music-video-studio/', '`' + portableStudio + '/')
          if (text !== original) await fs.writeFile(file, text)
        }
      }
    }
    await relocateLinks(kit)
    const archive = path.join(stage, `${name}.zip`)
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', kit, archive])
    await require('../cli/update').inspectArchive(archive, version)
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
