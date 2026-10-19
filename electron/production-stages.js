'use strict'
const crypto = require('node:crypto')
const states = new WeakMap()
const monotonic = () => performance.now()
function stateFor (job) {
  if (!job?.job?.taskId || !job.jobId) return null
  let state = states.get(job)
  if (!state) { state = { active: null, finished: new Set(), chain: Promise.resolve(), closed: false, lastProgressAt: -Infinity, lastProgress: null, lastStage: null }; states.set(job, state) }
  return state
}
function stageId (job, stage) { return crypto.createHash('sha256').update(`${job.job.taskId}:${stage}`).digest('hex').slice(0, 48) }
function enqueue (state, operation) {
  const next = state.chain.then(operation)
  state.chain = next.catch(() => {})
  return next.catch(error => ({ recorded: false, warning: String(error.message || error) }))
}
async function closeStage (job, state, status, at, record) {
  const active = state.active
  if (!active) return false
  state.active = null; state.finished.add(active.stage)
  await record('task-finish', { taskId: stageId(job, active.stage), status, elapsedMs: Math.max(0, at - active.at) })
  return true
}
function recordStage (job, event, { record, now = monotonic } = {}) {
  const state = stateFor(job)
  if (!state || state.closed || event?.jobId !== job.jobId || typeof record !== 'function' || !/^[a-z0-9_-]{1,64}$/i.test(event.stage || '')) return Promise.resolve({ recorded: false, ignored: true })
  const at = now(), stage = `stage:${event.stage}`
  return enqueue(state, async () => {
    if (event.status === 'start') {
      if (state.active?.stage === stage || state.finished.has(stage)) return { recorded: false, duplicate: true }
      await closeStage(job, state, 'succeeded', at, record)
      await record('task-start', { project: job.outDir, domain: 'music', taskType: stage, engine: job.job.engine, model: job.job.model || job.job.engine, taskId: stageId(job, stage), parentTaskId: job.job.taskId, requestId: job.job.requestId, engineRequestId: job.job.engineRequestId, status: 'running' })
      state.active = { stage, at }
      return { recorded: true }
    }
    if (event.status === 'done' && state.active?.stage === stage) return { recorded: await closeStage(job, state, 'succeeded', at, record) }
    return { recorded: false, ignored: true }
  })
}
function progressValue (event) {
  if (Number.isFinite(event?.fraction)) return Math.max(0, Math.min(1, Number(event.fraction)))
  if (Number.isFinite(event?.step) && Number.isFinite(event?.steps) && event.steps > 0) return Math.max(0, Math.min(1, Number(event.step) / Number(event.steps)))
  return null
}
function recordProgress (job, event, { record, now = monotonic, intervalMs = 2000 } = {}) {
  const state = stateFor(job)
  if (!state || state.closed || event?.jobId !== job.jobId || typeof record !== 'function' || !/^[a-z0-9_-]{1,64}$/i.test(event.stage || '')) return Promise.resolve({ recorded: false, ignored: true })
  const at = now(), progress = progressValue(event), stage = event.stage
  return enqueue(state, async () => {
    if (state.closed) return { recorded: false, ignored: true }
    const changed = stage !== state.lastStage
    const advanced = progress !== null && progress !== state.lastProgress
    if (!changed && !advanced) return { recorded: false, duplicate: true }
    if (!changed && at - state.lastProgressAt < intervalMs && progress !== 1) return { recorded: false, throttled: true }
    const result = await record('task-progress', { taskId: job.job.taskId, ...(progress === null ? {} : { progress }), currentStage: stage, ...(typeof event.summary === 'string' ? { summary: event.summary.slice(0, 4000) } : {}) })
    if (result?.recorded !== false) {
      state.lastProgressAt = at
      state.lastProgress = progress === null ? state.lastProgress : progress
      state.lastStage = stage
    }
    return { recorded: result?.recorded !== false, progress, stage }
  })
}
function finishStages (job, status, { record, now = monotonic } = {}) {
  const state = stateFor(job)
  if (!state || typeof record !== 'function') return Promise.resolve({ recorded: false, ignored: true })
  const at = now(), terminal = ['failed', 'cancelled'].includes(status) ? status : 'succeeded'
  state.closed = true
  return enqueue(state, async () => ({ recorded: await closeStage(job, state, terminal, at, record) }))
}
module.exports = { recordStage, recordProgress, finishStages }
