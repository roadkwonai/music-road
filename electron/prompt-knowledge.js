'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const version = require('../package.json').version
const policy = Object.freeze({ preserveUserInput: true, autoApply: false, suggestionsRequireApproval: true })
const documents = Object.freeze({
  genres: { title: '장르 프롬프트', source: 'docs/genre-prompts.md' },
  ccm: { title: 'CCM 상세 가이드', source: 'docs/ccm-prompts.md' },
  'hymn-remake': { title: '찬송가 리메이크 가이드', source: 'docs/hymn-remake-guide.md' },
  ace: { title: 'ACE 최적화 가이드', source: 'docs/ace-prompt-guide.md' },
  lyrics: { title: '가사 태그 가이드', source: 'docs/lyrics-tags.md' },
  review: { title: '음악 검토 규칙', source: 'docs/music-review.md' }
})

function fail (message) {
  const error = new Error(message)
  error.code = 'INVALID_ARGUMENT'
  throw error
}

function available (topic) {
  const document = documents[topic]
  return document && fs.existsSync(path.join(root, document.source))
}

function metadata (topic) {
  const document = documents[topic]
  return { topic, title: document.title, source: document.source, version }
}

function validate (params = {}) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) fail('prompt:knowledge expects an object')
  for (const key of Object.getOwnPropertyNames(params)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail(`Forbidden parameter: ${key}`)
    if (key !== 'topic') fail(`Unknown parameter: prompt:knowledge.${key}`)
  }
  if (params.topic === undefined) return undefined
  if (typeof params.topic !== 'string' || !Object.prototype.hasOwnProperty.call(documents, params.topic)) fail('prompt:knowledge.topic has an invalid value')
  if (!available(params.topic)) fail(`prompt:knowledge topic is unavailable: ${params.topic}`)
  return params.topic
}

function read (params = {}) {
  const topic = validate(params)
  if (topic === undefined) return { topics: Object.keys(documents).filter(available).map(metadata), policy }
  const document = metadata(topic)
  return { ...document, content: fs.readFileSync(path.join(root, document.source), 'utf8'), policy }
}

module.exports = { documents, policy, read, validate }
