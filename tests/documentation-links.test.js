'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function markdownFiles (directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    if (/docs\/vendor\/ace-step-1\.5\/(en|ko)$/.test(file)) return []
    return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith('.md') ? [file] : []
  })
}

function withoutCode (text) {
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
}

function anchors (text) {
  const ids = new Set([...text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)].map(match => match[1]))
  const counts = new Map()
  for (const [, heading] of withoutCode(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const slug = heading.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '')
      .toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/ /g, '-')
    const count = counts.get(slug) || 0
    ids.add(count ? `${slug}-${count}` : slug)
    counts.set(slug, count + 1)
  }
  return ids
}

test('first-party documentation links resolve to local files and existing sections', () => {
  const files = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'prompts/cli-workflows.md', 'prompts/ace-review.md', 'skills/road-music-ace/SKILL.md']
    .map(file => path.join(root, file)).concat(markdownFiles(path.join(root, 'docs')), markdownFiles(path.join(root, 'releases')))
  const failures = []
  for (const file of files) {
    const text = withoutCode(fs.readFileSync(file, 'utf8'))
    const references = [
      ...[...text.matchAll(/\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)].map(match => match[1] || match[2]),
      ...[...text.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1])
    ]
    for (const reference of references) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) continue
      const [targetPath, fragment] = reference.split('#')
      const target = targetPath ? path.resolve(path.dirname(file), decodeURIComponent(targetPath.split('?')[0])) : file
      const label = `${path.relative(root, file)} → ${reference}`
      if (!fs.existsSync(target)) failures.push(`${label}: missing file`)
      else if (fragment && target.endsWith('.md') && !anchors(fs.readFileSync(target, 'utf8')).has(decodeURIComponent(fragment))) failures.push(`${label}: missing anchor`)
    }
  }
  assert.deepEqual(failures, [])
})
