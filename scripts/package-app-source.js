#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

async function packageAppSource (outputDir = path.join(root, 'dist'), projectRoot = root) {
  const current = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8')).version
  const head = JSON.parse(execFileSync('git', ['-C', projectRoot, 'show', 'HEAD:package.json'], { encoding: 'utf8' })).version
  if (!stableVersion.test(current) || current !== head) throw new Error('HEAD package.json version must match the current stable app version')
  await fs.mkdir(outputDir, { recursive: true })
  const name = `RoadMusic-${current}-source.zip`
  const target = path.join(outputDir, name)
  const temporary = `${target}.${process.pid}.tmp`
  try {
    execFileSync('git', ['-C', projectRoot, 'archive', '--format=zip', `--prefix=RoadMusic-${current}-source/`, '-o', temporary, 'HEAD'])
    await fs.rename(temporary, target)
    return { path: target, bytes: (await fs.stat(target)).size, version: current }
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

if (require.main === module) packageAppSource().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})

module.exports = { packageAppSource }
