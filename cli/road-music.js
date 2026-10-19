#!/usr/bin/env node
'use strict'

const { run } = require('./client')

run(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch((error) => {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: error.code || 'operation_error', message: error.message || 'operation failed' } }) + '\n')
  process.exitCode = 1
})
