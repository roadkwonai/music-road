'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { recordStage, recordProgress, finishStages } = require('../electron/production-stages')

function fixture () { return { jobId: 'worker-1', outDir: '/tmp/song', job: { taskId: 'a'.repeat(48), requestId: 'b'.repeat(48) } } }

test('stage start/done records real event duration and ignores duplicate starts', async () => {
  const job = fixture(); const rows = []; let tick = 10
  const record = async (action, params) => { rows.push({ action, params }) }
  assert.equal((await recordStage(job, { jobId: 'worker-1', stage: 'plan', status: 'start' }, { record, now: () => tick })).recorded, true)
  tick = 37
  assert.equal((await recordStage(job, { jobId: 'worker-1', stage: 'plan', status: 'start' }, { record, now: () => tick })).duplicate, true)
  tick = 52
  const done = await recordStage(job, { jobId: 'worker-1', stage: 'plan', status: 'done' }, { record, now: () => tick })
  assert.equal(rows.at(-1).params.elapsedMs, 42)
  assert.deepEqual(rows.map(row => [row.action, row.params.status]), [['task-start', 'running'], ['task-finish', 'succeeded']])
})

test('a new stage closes the previous stage and finishStages terminalizes remaining stages', async () => {
  const job = fixture(); const rows = []; let tick = 0
  const record = (action, params) => rows.push({ action, params })
  await recordStage(job, { jobId: 'worker-1', stage: 'load', status: 'start' }, { record, now: () => tick })
  tick = 8
  await recordStage(job, { jobId: 'worker-1', stage: 'semantic', status: 'start' }, { record, now: () => tick })
  tick = 13
  await finishStages(job, 'cancelled', { record, now: () => tick })
  assert.ok(rows.every(row => /^[a-f0-9]{48}$/.test(row.params.taskId)))
  assert.deepEqual(rows.filter(row => row.action === 'task-finish').map(row => [row.params.status, row.params.elapsedMs]), [['succeeded', 8], ['cancelled', 5]])
  assert.equal(rows[0].params.parentTaskId, job.job.taskId)
})

test('wrong worker events and legacy jobs have no side effects', async () => {
  const rows = []; const record = (...args) => rows.push(args)
  const job = fixture()
  assert.equal((await recordStage(job, { jobId: 'other', stage: 'plan', status: 'start' }, { record, now: () => 1 })).ignored, true)
  assert.equal((await recordStage({ jobId: 'legacy', job: {} }, { jobId: 'legacy', stage: 'plan', status: 'start' }, { record, now: () => 1 })).ignored, true)
  assert.equal(rows.length, 0)
})


test('fast stage completion is serialized after start persistence while clocks use arrival time', async () => {
  const job=fixture(), rows=[];let release
  const gate=new Promise(resolve=>{release=resolve})
  const record=async(action,params)=>{if(action==='task-start')await gate;rows.push({action,params})}
  const start=recordStage(job,{jobId:job.jobId,stage:'decode',status:'start'},{record,now:()=>100})
  const finish=recordStage(job,{jobId:job.jobId,stage:'decode',status:'done'},{record,now:()=>250})
  release();await Promise.all([start,finish])
  assert.deepEqual(rows.map(row=>row.action),['task-start','task-finish'])
  assert.equal(rows[1].params.elapsedMs,150)
  assert.deepEqual(Object.keys(rows[1].params).sort(),['elapsedMs','status','taskId'])
})

test('parent progress is low-frequency and cannot arrive after terminal stages', async () => {
  const job = fixture(); const rows = []; let tick = 0
  const record = (action, params) => rows.push({ action, params })
  await recordProgress(job, { jobId: job.jobId, stage: 'synth', step: 1, steps: 10 }, { record, now: () => tick })
  tick = 500
  assert.equal((await recordProgress(job, { jobId: job.jobId, stage: 'synth', step: 2, steps: 10 }, { record, now: () => tick })).throttled, true)
  tick = 2000
  await recordProgress(job, { jobId: job.jobId, stage: 'synth', step: 10, steps: 10 }, { record, now: () => tick })
  await finishStages(job, 'succeeded', { record, now: () => tick })
  assert.equal((await recordProgress(job, { jobId: job.jobId, stage: 'decode', step: 1, steps: 2 }, { record, now: () => tick + 1 })).ignored, true)
  assert.deepEqual(rows.filter(row => row.action === 'task-progress').map(row => [row.params.currentStage, row.params.progress]), [['synth', 0.1], ['synth', 1]])
})
