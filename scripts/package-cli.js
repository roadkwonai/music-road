#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { version } = require('../package.json')
const root = path.resolve(__dirname, '..')

async function packageCli (outputDir = path.join(root, 'dist')) {
  if (process.platform !== 'darwin') throw new Error('CLI ZIP packaging requires macOS ditto')
  await fs.mkdir(outputDir, { recursive: true })
  const stage = await fs.mkdtemp(path.join(outputDir, '.cli-package-'))
  const name = `RoadMusic-${version}-cli`
  const kit = path.join(stage, name)
  try {
    await fs.mkdir(kit)
    const entries = ['cli', 'electron', 'renderer', 'python', 'docs', 'tests', 'scripts',
      'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'AGENTS.md', 'CLAUDE.md',
      'build/icon.png', 'build/icon.icns', 'prompts/cli-workflows.md', 'prompts/ace-review.md',
      'skills/road-music-ace']
    for (const entry of entries) {
      const destination = path.join(kit, entry)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.cp(path.join(root, entry), destination, { recursive: true,
        filter: source => !['__pycache__', '.DS_Store'].includes(path.basename(source)) })
    }
    const archive = path.join(stage, `${name}.zip`)
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', kit, archive])
    const finalPath = path.join(outputDir, `${name}.zip`)
    await fs.rename(archive, finalPath)
    return { path: finalPath, bytes: (await fs.stat(finalPath)).size }
  } finally { await fs.rm(stage, { recursive: true, force: true }) }
}

if (require.main === module) packageCli().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
module.exports = { packageCli }
