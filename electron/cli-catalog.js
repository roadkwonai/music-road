'use strict'
const { fileURLToPath } = require('node:url')
const { generationError, advancedError, runtimeError, advancedProperties, runtimeProperties } = require('../renderer/generation-options')

// The CLI contract is deliberately explicit: the bridge can reject a bad nested
// request before it reaches an IPC handler.
const S = {
  object: (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false }),
  string: { type: 'string' }, number: { type: 'number' }, integer: { type: 'integer' }, boolean: { type: 'boolean' }
}
const str = (extra = {}) => ({ type: 'string', ...extra })
const num = (extra = {}) => ({ type: 'number', ...extra })
const integer = (extra = {}) => ({ type: 'integer', ...extra })
const arr = (items, extra = {}) => ({ type: 'array', items, ...extra })
const nullable = (spec) => ({ ...spec, nullable: true })
const path = str({ minLength: 1 })
const mediaPath = str({ minLength: 1, format: 'local-media-path' })
const mediaUrl = str({ pattern: '^file:', format: 'local-file-url' })
const absolutePath = str({ minLength: 1, pattern: '^(?:[A-Za-z]:[\\\\/]|/)' })
const noParams = S.object()
const knowledgeTopic = { type: 'string', enum: ['genres', 'ccm', 'ccm-advanced', 'ccm-recipes', 'reference-recipes', 'hymn-remake', 'ace', 'yue', 'yue-advanced', 'models', 'lyrics', 'review'] }
const skillSource = absolutePath
const skillHost = { type: 'string', enum: ['codex', 'antigravity', 'antigravity-cli'] }
const motionHost = { type: 'string', enum: ['codex', 'antigravity', 'antigravity-cli'] }
const motionMode = { type: 'string', enum: ['showreel-cd', 'showreel-mv', 'jizura', 'showreel-motion'] }
const instruments = ['piano', 'acoustic guitar', 'classical guitar', 'electric guitar', 'bass guitar', 'upright bass', 'drums', 'brushed drums', 'percussion', 'violin', 'viola', 'cello', 'string ensemble', 'harp', 'flute', 'clarinet', 'oboe', 'saxophone', 'trumpet', 'trombone', 'french horn', 'brass section', 'pipe organ', 'Rhodes electric piano', 'synthesizer', 'synth pads', 'celesta', 'glockenspiel', 'sleigh bells', 'music box', 'marimba', 'vibraphone', 'ukulele', 'mandolin', 'harmonica', 'accordion', 'orchestra']
const parts = S.object({ genre: str({ maxLength: 2000 }), instruments: arr({ type: 'string', enum: instruments }, { maxItems: 16 }), instrumentation: arr(S.object({ instrument: str({ minLength: 1, maxLength: 80 }), role: { type: 'string', enum: ['accompaniment', 'lead', 'bass', 'rhythm', 'texture', 'response', 'solo'] }, technique: str({ maxLength: 80 }), section: { type: 'string', enum: ['All', 'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Interlude', 'Outro'] } }, ['instrument', 'role']), { maxItems: 16 }), vocal: arr(str({ minLength: 1, maxLength: 120 }), { maxItems: 8 }), dynamics: arr(str({ minLength: 1, maxLength: 120 }), { maxItems: 8 }), mix: arr(str({ minLength: 1, maxLength: 120 }), { maxItems: 8 }), bpm: nullable(integer({ minimum: 40, maximum: 220 })), strict: S.boolean, strong: S.boolean, instrumental: S.boolean, structure: { type: 'string', enum: ['', 'pop', 'short', 'theme', 'loop'] } })
const advanced = S.object(advancedProperties)
const yueRuntime = S.object({ ...runtimeProperties, vaePath: absolutePath, loraPath: absolutePath })
const background = S.object({ kind: { type: 'string', enum: ['none', 'image', 'video'] }, path: nullable(mediaPath), url: nullable(mediaUrl), name: str({ maxLength: 200 }) })
const spectrum = S.object({ visible: S.boolean, kind: { type: 'string', enum: ['bars', 'mirror', 'line', 'circle', 'cd'] }, cover: nullable(S.object({ path: nullable(mediaPath), url: nullable(mediaUrl), name: str({ maxLength: 200 }) })), symmetric: S.boolean, layout: nullable({ type: 'string', enum: ['left', 'center', 'right'] }), barCount: integer({ enum: [8, 16, 24, 32, 48, 64, 96, 128] }), position: { type: 'string', enum: ['bottom', 'center', 'free'] }, cx: nullable(num({ minimum: -0.5, maximum: 1.5 })), cy: nullable(num({ minimum: -0.5, maximum: 1.5 })), size: num({ minimum: 0.03, maximum: 0.9 }), width: num({ minimum: 0.05, maximum: 1.5 }), color1: str({ pattern: '^#[0-9a-fA-F]{6}$' }), color2: str({ pattern: '^#[0-9a-fA-F]{6}$' }), glow: num({ minimum: 0, maximum: 1 }), gain: num({ minimum: 0.3, maximum: 3 }), dim: num({ minimum: 0, maximum: 1 }) })
const eq = S.object({ on: S.boolean, preset: { type: 'string', enum: ['flat', 'bass', 'vocal', 'treble', 'warm', 'clear', 'dance', 'lofi', 'custom'] }, gains: arr(num({ minimum: -10, maximum: 10 }), { minItems: 7, maxItems: 7 }) })
const length = S.object({ mode: { type: 'string', enum: ['once', 'repeat', 'minutes'] }, count: integer({ minimum: 1, maximum: 1000 }), minutes: integer({ minimum: 1, maximum: 600 }) })
const tracklist = S.object({ visible: S.boolean, cx: nullable(num({ minimum: -0.5, maximum: 1.5 })), cy: nullable(num({ minimum: -0.5, maximum: 1.5 })), w: nullable(num({ minimum: 0, maximum: 1 })), h: nullable(num({ minimum: 0, maximum: 1 })), title: str({ maxLength: 100 }), color: str({ pattern: '^#[0-9a-fA-F]{6}$' }), accent: str({ pattern: '^#[0-9a-fA-F]{6}$' }), bg: num({ minimum: 0, maximum: 1 }) })
const overlay = S.object({ id: str({ maxLength: 200 }), path: mediaPath, name: str({ maxLength: 200 }), url: nullable(mediaUrl), x: num({ minimum: -0.5, maximum: 1.5 }), y: num({ minimum: -0.5, maximum: 1.5 }), w: num({ minimum: 0.02, maximum: 2 }), ar: num({ minimum: 0.01, maximum: 100 }), opacity: num({ minimum: 0, maximum: 1 }), start: num({ minimum: 0 }), end: nullable(num({ minimum: 0 })) })
const video = S.object({ source: { type: 'string', enum: ['selected', 'checked', 'project'] }, background, length, resolution: { type: 'string', enum: ['720p', '1080p', '1440p', '2160p'] }, fps: { type: 'integer', enum: [30, 60] }, renderer: { type: 'string', enum: ['gpu', 'cpu'] }, spectrum, eq, overlays: arr(overlay), tracklist })
const analysis = S.object({ fftSize: { type: 'integer', enum: [1024, 2048, 4096, 8192] }, windowFunction: { type: 'string', enum: ['hann'] }, minFrequency: num({ minimum: 1, maximum: 24000 }), maxFrequency: num({ minimum: 1, maximum: 24000 }), frequencyScale: { type: 'string', enum: ['log'] }, barCount: integer({ minimum: 8, maximum: 256 }), minDb: num({ minimum: -160, maximum: 0 }), maxDb: num({ minimum: -160, maximum: 0 }), attackMs: num({ minimum: 0, maximum: 2000 }), releaseMs: num({ minimum: 0, maximum: 5000 }), smoothing: num({ minimum: 0, maximum: 1 }), channelMode: { type: 'string', enum: ['mix'] } })
const scoreChoice = S.object({ vocal: str({ maxLength: 200 }), ins: str({ maxLength: 200 }), chords: S.boolean })
const preset = S.object({ name: str({ minLength: 1, maxLength: 40 }), style: str({ maxLength: 2000 }), instrumental: S.boolean, parts, folder: str({ maxLength: 30 }) }, ['name'])
const rendererTrack = { anyOf: [path, S.object({ dir: path }, ['dir'])] }
const storageId = str({ minLength: 1, maxLength: 128 })
const storageHash = str({ pattern: '^[0-9a-f]{64}$' })
const storagePlanId = str({ pattern: '^[0-9a-f]{48}$' })
const storageKind = { type: 'string', enum: ['cache', 'intermediate', 'history'] }
const productionContext = { requestPrompt: str({ maxLength: 65536, maxBytes: 65536 }), requestId: storagePlanId }
const productionScope = { projectId: storageHash, groupId: storageHash, domain: { type: 'string', enum: ['music', 'motion'] }, engine: str({ maxLength: 200 }), model: str({ maxLength: 200 }), taskType: str({ minLength: 1, maxLength: 80 }), status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }, since: integer({ minimum: 0 }), until: integer({ minimum: 0 }) }
const productionPage = { ...productionScope, limit: integer({ minimum: 1, maximum: 100 }), cursor: integer({ minimum: 1 }) }
function description (command) {
  const [subject, action] = command.split(':')
  const nouns = { app: '앱', setup: '초기 설정', engines: 'AI 엔진', projects: '프로젝트', songs: '곡 목록', song: '곡', score: '악보', queue: '작업 대기열', video: '영상', tracklist: '영상 트랙 목록', settings: '설정', assets: '에셋', recording: '녹음', presets: '프리셋', shell: '운영체제', log: '로그', update: '업데이트', about: '앱 정보', notices: '공지', window: '창', lyrics: '가사', prompt: '프롬프트', player: '재생기', editor: '영상 편집기', renderer: '화면 자동화', ui: '화면 로그', album: '앨범', storage: '저장공간', skills: '모션그래픽 스킬', motion: '모션그래픽 스튜디오' }
  const verbs = { state: '상태를 조회합니다', list: '목록을 조회합니다', check: '검사합니다', location: '위치를 조회합니다', 'pick-location': '위치를 선택합니다', run: '실행합니다', install: '설치합니다', skip: '건너뜁니다', select: '선택합니다', create: '만듭니다', rename: '이름을 바꿉니다', import: '가져옵니다', reorder: '순서를 바꿉니다', hide: '숨김 상태를 바꿉니다', hidden: '숨긴 목록을 조회합니다', compact: '정리합니다', lrc: 'LRC 자막을 만듭니다', generate: '생성 작업을 시작합니다', resume: '생성을 이어갑니다', score: '점수를 매깁니다', open: '엽니다', convert: '변환합니다', render: '렌더링합니다', cancel: '실행 중인 작업을 취소합니다', delete: '삭제합니다', reveal: '폴더를 엽니다', background: '배경을 선택합니다', 'background-clear': '배경을 지웁니다', 'save-srt': 'SRT 자막을 저장합니다', export: '내보냅니다', remove: '제거합니다', retry: '다시 시도합니다', move: '이동합니다', pause: '일시정지 상태를 바꿉니다', dismiss: '완료 항목을 숨깁니다', clear: '비웁니다', 'save-settings': '설정을 저장합니다', prepare: '미리보기를 준비합니다', start: '시작합니다', write: '기록합니다', frame: '프레임을 전달합니다', layer: '레이어를 전달합니다', finish: '마칩니다', compare: '미리보기와 결과 프레임을 비교합니다', get: '현재 값을 조회합니다', set: '값을 저장합니다', save: '저장합니다', pick: '선택합니다', play: '재생합니다', next: '다음 곡으로 이동합니다', previous: '이전 곡으로 이동합니다', seek: '재생 위치를 이동합니다', stop: '중지합니다', clean: '정리합니다', sections: '구간을 자동으로 나눕니다', numbers: '숫자를 한글로 바꿉니다', compose: '스타일 문장을 만듭니다', detail: '상세 정보를 조회합니다', clone: '설정을 복제합니다', srt: '자막을 만듭니다', preview: '미리보기를 만듭니다', chapters: '챕터를 조회합니다', close: '닫습니다', catalog: '지원 기능 목록을 조회합니다', fullscreen: '전체 화면을 전환합니다', 'quiet-week': '일주일 동안 알림을 숨깁니다', 'open-page': '업데이트 페이지를 엽니다', feedback: '문의 또는 오류 보고를 전송합니다', info: '버전과 라이선스를 조회합니다', latest: '최신 공지를 조회합니다', 'set-language': '표시 언어를 바꿉니다', register: '등록합니다', track: '추적합니다', policy: '정책을 갱신합니다', pin: '보존을 설정합니다', cleanup: '정리합니다', history: '이력을 조회합니다', lease: '작업 잠금을 관리합니다' }
  return `${nouns[subject] || '앱'} ${verbs[action] || '명령을 실행합니다'}`
}
function entry (command, channel, params = noParams, args = (p) => [], extra = {}) { return { command, channel, description: description(command), params, args, ...extra } }

const songGenerateParams = S.object({ ...productionContext, title: str({ maxLength: 200 }), style: str({ maxLength: 2000 }), lyrics: str({ maxLength: 20000 }), engine: { type: 'string', enum: ['ace', 'yue', 'yue-mlx'], default: 'ace' }, count: integer({ minimum: 1, maximum: 8 }), instrumental: S.boolean, soundEffect: S.boolean, targetSeconds: nullable(num({ minimum: 1, maximum: 600 })), seed: nullable({ description: "YuE: 0..9223372036854775807; use a decimal string above Number.MAX_SAFE_INTEGER. Semantic bounds are also checked by song:prepare/generate. ACE: 0..2147483647.", anyOf: [integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }), str({ pattern: '^(0|[1-9][0-9]{0,18})$' })] }), mode: { type: 'string', enum: ['song', 'plan'] }, cot: { type: 'string', enum: ['full', 'melody', 'off'] }, abc: str({ maxLength: 100000 }), advanced, runtime: yueRuntime, parts, coverAudio: nullable(S.object({ dir: absolutePath, title: str({ maxLength: 200 }), strength: num({ minimum: 0.1, maximum: 1 }) }, ['dir'])), recording: nullable(S.object({ path: absolutePath, strength: num({ minimum: 0.1, maximum: 1 }), targetSeconds: integer({ minimum: 0, maximum: 600 }) }, ['path'])), bpm: integer({ minimum: 40, maximum: 220 }) })
const abcInput = S.object({ text: str({ minLength: 1, maxLength: 100000 }), file: absolutePath })

const productionEntries = [
  entry('production:request', null, S.object({ project: absolutePath, domain: productionScope.domain, intent: str({ minLength: 1, maxLength: 80 }), prompt: str({ minLength: 1, maxLength: 65536, maxBytes: 65536 }), source: { type: 'string', enum: ['user', 'engine'] }, requestId: storagePlanId, title: str({ maxLength: 200 }), groupId: storageHash }, ['project', 'domain', 'prompt']), undefined, { local: true, description: '제작·수정 요청 원문을 기록하고 최초 사용자 요청을 메인 프롬프트로 보존합니다.' }),
  entry('production:task-start', null, S.object({ project: absolutePath, domain: productionScope.domain, taskType: productionScope.taskType, engine: str({ maxLength: 200 }), model: str({ maxLength: 200 }), requestId: storagePlanId, engineRequestId: storagePlanId, taskId: storagePlanId, parentTaskId: storagePlanId, status: { type: 'string', enum: ['queued', 'running'] }, title: str({ maxLength: 200 }), groupId: storageHash, expectedMediaSeconds: num({ minimum: 0 }), expectedFrameCount: integer({ minimum: 0 }) }, ['project', 'domain', 'taskType']), undefined, { local: true, description: '작업과 제작 단계를 시작하며 알려진 미디어 길이·프레임 수와 실제 성능을 연결합니다.' }),
  entry('production:task-progress', null, S.object({ taskId: storagePlanId, progress: num({ minimum: 0, maximum: 1 }), currentStage: str({ maxLength: 240 }), summary: str({ maxLength: 4000 }) }, ['taskId']), undefined, { local: true, description: '진행 중 작업의 확인된 단계·진행률·짧은 상태를 저빈도로 기록합니다.' }),
  entry('production:task-finish', null, S.object({ taskId: storagePlanId, status: { type: 'string', enum: ['succeeded', 'failed', 'cancelled'] }, elapsedMs: num({ minimum: 0 }), mediaSeconds: num({ minimum: 0 }), frameCount: integer({ minimum: 0 }), aiSummary: str({ maxLength: 4000 }), resultSummary: str({ maxLength: 4000 }), errorSummary: str({ maxLength: 4000 }), files: arr(S.object({ path: absolutePath, role: { type: 'string', enum: ['input', 'intermediate', 'final', 'cache', 'artifact'] } }, ['path', 'role']), { maxItems: 10000 }) }, ['taskId', 'status']), undefined, { local: true, description: '완료·실패·취소와 실제 소요시간·결과 요약·생성 파일 메타데이터를 기록합니다.' }),
  entry('production:projects', null, S.object({ ...productionPage, search: str({ maxLength: 200 }) }), undefined, { local: true, description: '제작 프로젝트와 요청·생성·수정 횟수를 페이지 단위로 조회합니다.' }),
  entry('production:prompts', null, S.object({ projectId: storageHash, groupId: storageHash, domain: productionScope.domain, since: productionScope.since, until: productionScope.until, limit: productionPage.limit, cursor: productionPage.cursor }), undefined, { local: true, description: '프로젝트의 메인 프롬프트와 요청 원문·AI 응답·결과 이력을 조회합니다.' }),
  entry('production:tasks', null, S.object({ ...productionPage, taskId: storagePlanId }), undefined, { local: true, description: '제작 단계의 실제 시간·상태·결과를 조회합니다.' }),
  entry('production:files-record', null, S.object({ taskId: storagePlanId, files: arr(S.object({ path: absolutePath, role: { type: 'string', enum: ['input', 'intermediate', 'final', 'cache', 'artifact'] } }, ['path', 'role']), { maxItems: 10000 }) }, ['taskId', 'files']), undefined, { local: true, description: '자동 정리 전 생성 파일 메타데이터를 작업에 누적합니다. 미디어 내용은 복제하지 않습니다.' }),
  entry('production:files', null, S.object({ projectId: storageHash, groupId: storageHash, taskId: storagePlanId, limit: productionPage.limit, cursor: productionPage.cursor }), undefined, { local: true, description: '작업 중 생성했던 파일의 경로·종류·기록 용량을 페이지로 조회합니다.' }),
  entry('production:dashboard', null, S.object({ ...productionScope, groupIds: arr(storageHash, { minItems: 1, maxItems: 100 }), limit: integer({ minimum: 1, maximum: 100 }) }), undefined, { local: true, description: '제작 총량·프로젝트 그룹별 비교·같은 조건의 평균/분포·일별 추이·느린 작업을 SQL로 집계합니다.' }),
  entry('production:activity', null, S.object({ projectId: storageHash, groupId: storageHash, domain: productionScope.domain, limit: integer({ minimum: 1, maximum: 100 }), offset: integer({ minimum: 0, maximum: 10000 }) }), undefined, { local: true, description: '진행·대기 작업, 현재 단계와 과거 실측 평균에 따른 예상 시간을 읽기 전용으로 조회합니다.' }),
  entry('production:components', null, noParams, undefined, { local: true, description: '관찰한 앱·CLI·스킬 설치 버전과 마지막 업데이트 확인 결과를 조회합니다.' }),
  entry('production:component-record', null, S.object({ componentId: str({ minLength: 1, maxLength: 160 }), kind: { type: 'string', enum: ['app', 'cli', 'skill'] }, name: str({ minLength: 1, maxLength: 200 }), installedVersion: str({ minLength: 1, maxLength: 100 }), latestVersion: str({ maxLength: 100 }), status: str({ maxLength: 80 }), sourceUrl: str({ maxLength: 2000, pattern: '^https://' }), checkedAt: integer({ minimum: 0 }) }, ['componentId', 'kind', 'name', 'installedVersion']), undefined, { local: true, description: '실제 설치 정보와 기존 업데이트 검사 결과를 기록합니다. 설치·다운로드는 수행하지 않습니다.' })
]
const entries = [
  ...productionEntries,
  entry('works:list', null, S.object({ favoritesOnly: S.boolean }), undefined, { local: true, description: '음악 그룹 목록 또는 SQLite에 저장한 좋아요 그룹만 조회합니다.' }),
  entry('works:favorite', null, S.object({ groupId: storageHash, favorite: S.boolean }, ['groupId', 'favorite']), undefined, { local: true, description: '등록한 음악 그룹의 좋아요를 SQLite에 저장하거나 해제합니다.' }),
  entry('storage:list', 'storage:list', S.object({ projectId: storageId })),
  entry('storage:register', 'storage:register', S.object({ project: absolutePath }, ['project'])),
  entry('storage:track', 'storage:track', S.object({ projectId: storageId, path: str({ minLength: 1 }), kind: storageKind, description: str({ maxLength: 400 }), reproducible: S.boolean }, ['projectId', 'path', 'kind'])),
  entry('storage:policy', 'storage:policy', S.object({ projectId: storageId, state: { type: 'string', enum: ['editing', 'completed', 'archived'] }, preserveHistory: S.boolean, autoCleanup: S.boolean, retainDays: integer({ minimum: 0, maximum: 3650 }), maxCacheBytes: integer({ minimum: 0 }), maxCacheFiles: integer({ minimum: 0 }) }, ['projectId'])),
  entry('storage:pin', 'storage:pin', S.object({ projectId: storageId, entryId: storageId, pinned: S.boolean }, ['projectId', 'entryId', 'pinned'])),
  entry('storage:preview', 'storage:preview', S.object({ projectId: storageId, entryIds: arr(storageId), kinds: arr(storageKind) })),
  entry('storage:cleanup', 'storage:cleanup', S.object({ planId: storageId }, ['planId']), undefined, { destructive: true }),
  entry('storage:history', 'storage:history', S.object({ projectId: storageId }, ['projectId'])),
  entry('storage:lease', 'storage:lease', S.object({ projectId: storageId, operation: { type: 'string', enum: ['acquire', 'release'] }, pid: integer({ minimum: 1 }), token: storageId }, ['projectId', 'operation']), undefined, { description: '제작 작업 잠금을 관리합니다. acquire에는 실제 제작 프로세스 pid, release에는 같은 lease token이 필요합니다.' }),
  entry('storage:legacy', 'storage:legacy', S.object({ projectId: storageId }, ['projectId']), undefined, { description: '등록 프로젝트의 관리 밖 레거시 캐시 후보를 읽기 전용으로 찾습니다.' }),
  entry('storage:adopt-preview', 'storage:adopt-preview', S.object({ projectId: storageId, candidateIds: arr(storageId, { minItems: 1, maxItems: 400 }) }, ['projectId', 'candidateIds']), undefined, { description: '선택한 레거시 후보를 관리 캐시로 옮길 계획을 만듭니다.' }),
  entry('storage:adopt', 'storage:adopt', S.object({ planId: storageId }, ['planId']), undefined, { destructive: true, description: '확인된 레거시 이동 계획을 관리 캐시로 반영합니다.' }),
  entry('storage:maintenance-list', 'storage:maintenance-list', S.object({ includeRetirement: S.boolean, scope: { type: 'string', enum: ['retirement', 'git'] } }), undefined, { description: '현재 작업 폴더를 스캔합니다. Git 객체 분석은 scope:git을 명시한 개발자 점검에서만 수행합니다.' }),
  entry('storage:maintenance-preview', 'storage:maintenance-preview', S.object({ scanId: storageId, scope: { type: 'string', enum: ['git', 'verification', 'artifacts', 'retirement'] }, candidateIds: arr(storageId, { minItems: 1, maxItems: 100 }) }, ['scanId', 'scope']), undefined, { description: 'Git 또는 명시 선택한 설치 검증·과거 제작·참조·최종본 외 제작 자료의 일회용 정리 계획을 만듭니다.' }),
  entry('storage:maintenance-cleanup', 'storage:maintenance-cleanup', S.object({ planId: storageId }, ['planId']), undefined, { destructive: true, description: '확인된 작업 폴더 계획을 실행하고 실제 할당 공간 감소와 보존 결과를 기록합니다.' }),
  entry('storage:maintenance-history', 'storage:maintenance-history', noParams, undefined, { description: '현재 작업 폴더 유지보수의 최소 이력을 조회합니다.' }),
  entry('storage:status', null, noParams, undefined, { local: true, description: '저장공간 검사 항목의 사용 가능 여부와 비활성 사유를 조회합니다. Git 객체 분석은 실행하지 않습니다.' }),
  entry('storage:migrate', null, noParams, undefined, { local: true, description: '검증된 기존 저장공간·작업물 관리 정보를 SQLite로 한 번 이전합니다. 음악·영상 파일은 이동하지 않습니다.' }),
  entry('storage:events', null, S.object({ projectId: storageHash, groupId: storageHash, limit: integer({ minimum: 1, maximum: 100 }), cursor: integer({ minimum: 1 }) }), undefined, { local: true, description: '음악·영상·제목·가사·정책 변경 이력을 SQLite에서 페이지별로 조회합니다.' }),
  entry('storage:tracking', null, S.object({ refreshWorkspace: S.boolean }), undefined, { local: true, description: '파일·폴더의 소유권과 관리·미확인 영역을 조회합니다. 명시 새로 고침만 메타데이터를 스캔합니다.' }),
  entry('storage:reconcile-preview', null, noParams, undefined, { local: true, description: '추적 색인을 대조하고 안전하게 확인된 관리 잔재만 정리 계획으로 만듭니다.' }),
  entry('storage:reconcile-cleanup', null, S.object({ planId: storagePlanId }, ['planId']), undefined, { local: true, destructive: true, description: '확인된 추적 정리 계획을 실행하고 실제 확보 공간을 기록합니다.' }),
  entry('storage:project-remove-preview', null, S.object({ projectId: storageHash }, ['projectId']), undefined, { local: true, description: '선택한 프로젝트의 작업 자료·완성본·DB 이력 제거 범위와 보호 상태를 확인합니다.' }),
  entry('storage:group-remove-preview', null, S.object({ groupId: storageHash }, ['groupId']), undefined, { local: true, description: '선택한 음악 그룹의 완성본·제작 프로젝트·DB 이력 전체 제거 범위를 확인합니다.' }),
  entry('storage:entity-remove', null, S.object({ planId: storagePlanId }, ['planId']), undefined, { local: true, destructive: true, description: '명시 확인한 프로젝트·음악 그룹 제거 계획을 실행하고 관련 SQL 경로·이력도 제거합니다.' }),
  entry('storage:entity-recover', null, S.object({ planId: storagePlanId }, ['planId']), undefined, { local: true, destructive: true, description: '중단된 전체 제거 계획의 파일·SQL 상태를 확인해 격리 자료를 원래 위치로 복구합니다.' }),
  entry('storage:overview', 'storage:overview', S.object({ refreshWorkspace: S.boolean }), undefined, { description: '제작한 음악별로 프로젝트와 AI M/V 사용량을 묶고 기타 자료를 분리합니다. refreshWorkspace:true는 가벼운 작업 폴더 메타데이터 스캔을 새로 만듭니다.' }),
  entry('storage:versions', null, S.object({ groupId: storageHash, projectId: storageHash, limit: integer({ minimum: 1, maximum: 100 }), offset: integer({ minimum: 0 }) }, ['groupId']), undefined, { local: true, description: '음악과 프로젝트별 검증된 완성본 버전 이력을 조회합니다.' }),
  entry('storage:version-diff', null, S.object({ fromId: storageHash, toId: storageHash }, ['fromId', 'toId']), undefined, { local: true, description: '같은 음악·프로젝트의 두 완성본 버전 차이를 조회합니다.' }),
  entry('storage:file-remove-preview', null, S.object({ groupId: storageHash, fileId: storageHash }, ['groupId', 'fileId']), undefined, { local: true, description: '등록된 canonical 완성 파일 한 개의 제거 가능 여부와 일회용 계획을 확인합니다.' }),
  entry('storage:file-remove', null, S.object({ planId: storagePlanId }, ['planId']), undefined, { local: true, destructive: true, description: '확인된 canonical 완성 파일 한 개를 제거하고 버전 이력에 tombstone을 남깁니다.' }),
  entry('storage:project-finish-preview', null, S.object({ projectId: storageId }, ['projectId']), undefined, { local: true, description: '검증된 완성본 게시 뒤 프로젝트별 작업 캐시 정리 계획을 확인합니다.' }),
  entry('storage:project-finish', null, S.object({ planId: storagePlanId }, ['planId']), undefined, { local: true, destructive: true, description: '확인된 프로젝트 완료 정리 계획을 실행합니다.' }),
  entry('storage:restructure-status', null, noParams, undefined, { local: true, description: '완성본 전용 Output 이전과 레거시 정리 상태를 조회합니다.' }),
  entry('storage:restructure-preview', null, noParams, undefined, { local: true, description: '검증된 완성본을 보존하며 기존 미연결 자료를 정리할 일회용 계획을 만듭니다.' }),
  entry('storage:restructure-cleanup', null, S.object({ planId: storagePlanId }, ['planId']), undefined, { local: true, destructive: true, description: '확인된 Output 구조 전환·레거시 정리 계획을 실행합니다.' }),
  entry('storage:mv-list', 'storage:mv-list', noParams, undefined, { description: '원음과 연결된 AI M/V 프로젝트의 전체 정리 가능 여부를 확인합니다.' }),
  entry('storage:mv-preview', 'storage:mv-preview', S.object({ scanId: storageId, projectIds: arr(storageId, { minItems: 1, maxItems: 100 }) }, ['scanId', 'projectIds']), undefined, { description: '선택한 AI M/V의 애니매틱·최종 영상까지 포함하는 전체 삭제 계획을 만듭니다.' }),
  entry('storage:mv-cleanup', 'storage:mv-cleanup', S.object({ planId: storageId }, ['planId']), undefined, { destructive: true, description: '확인한 AI M/V 프로젝트 전체를 정리합니다. 외부 원음·모델과 최소 감사는 보존합니다.' }),
  entry('storage:sweep-preview', 'storage:sweep-preview', S.object({ mvProjectIds: arr(storageId, { minItems: 1, maxItems: 100 }) }), undefined, { description: '전체 스캔 후 정책에 맞는 캐시·검증 잔재 또는 명시 선택한 AI M/V의 정리 계획을 만듭니다.' }),
  entry('storage:sweep-cleanup', 'storage:sweep-cleanup', S.object({ planId: storageId }, ['planId']), undefined, { destructive: true, description: '일회용 일괄 정리 계획을 실행하고 실제 확보 용량을 기록합니다.' }),
  entry('setup:test-profile', null, S.object({ directory: absolutePath }, ['directory']), undefined, { local: true, description: '기존 runtime을 공유하는 비어 있는 격리 테스트 프로필을 준비합니다.' }),
  entry('video:cache', 'video:cache', noParams, undefined, { description: '현재 앱의 과거 공용 영상 캐시를 검증하고 일회용 정리 계획을 만듭니다.' }),
  entry('video:cache-clear', 'video:cache-clear', S.object({ planId: storageId }, ['planId']), p => [p], { destructive: true, description: 'idle 앱에서 확인된 과거 공용 영상 캐시만 정리합니다.' }),
  entry('app:state', 'app:state'), entry('setup:check', 'setup:check'), entry('setup:location', 'setup:location'), entry('setup:pick-location', 'setup:pick-location', noParams, undefined, { dialog: 'open', directory: true }), entry('setup:run', 'setup:run'),
  entry('engines:list', 'engines:list'), entry('engines:install', 'engines:install', S.object({ id: { type: 'string', enum: ['ace', 'yue', 'yue-mlx'] } }, ['id']), p => [p.id]), entry('engines:skip', 'engines:skip'),
  entry('projects:list', 'projects:list'), entry('projects:select', 'projects:select', S.object({ name: path }, ['name']), p => [p.name]), entry('projects:create', 'projects:create', S.object({ name: path }, ['name']), p => [p.name]), entry('projects:rename', 'projects:rename', S.object({ from: path, to: path }, ['from', 'to']), p => [{ from: p.from, to: p.to }]),
  entry('song:prepare', null, songGenerateParams, undefined, { local: true, description: '서비스·생성 없이 최종 입력·변경·유효 옵션과 원생 요청을 검수합니다.' }),
  entry('yue:capabilities', null, S.object({ engine: { type: 'string', enum: ['yue', 'yue-mlx'] }, transcription: S.object({ python: absolutePath, modelDir: absolutePath }, ['python', 'modelDir']) }), undefined, { local: true, description: 'YuE 엔진별 옵션·단계·runtime 지원 범위를 읽기 전용으로 조회합니다.' }),
  entry('score:inspect', null, abcInput, undefined, { local: true, description: '공식 ABC 방언으로 선율·박자·템포·화성을 검사합니다.' }),
  entry('score:strip-chords', null, S.object({ ...abcInput.properties, voice: { type: 'string', enum: ['Vocal', 'Ins'] } }), undefined, { local: true, description: '공식 ABC에서 화성 기호를 제거하고 지정 선율을 선택합니다.' }),
  entry('score:compare', null, S.object({ source: abcInput, candidate: abcInput, invariants: S.object({ melody: S.boolean, harmony: S.boolean, allowTempoChange: S.boolean, form: S.boolean }) }, ['source', 'candidate']), undefined, { local: true, description: '원본과 수정 ABC의 보존 조건·차이를 비교합니다.' }),
  entry('score:transcribe', null, S.object({ audio: absolutePath, output: absolutePath, python: absolutePath, modelDir: absolutePath, melodyOnly: S.boolean, task: { type: 'string', enum: ['full', 'melody-full', 'melody-vocal'] } }, ['audio', 'output', 'python', 'modelDir']), undefined, { local: true, description: '별도 기설치 SheetSage2 환경으로 로컬 음원을 새 악보로 전사합니다. 자동 다운로드하지 않습니다.' }),
  entry('song:replay', 'song:replay', S.object({ ...productionContext, dir: absolutePath, stage: { type: 'string', enum: ['plan', 'synthesize', 'decode'] }, title: str({ maxLength: 200 }), advanced, runtime: yueRuntime }, ['dir', 'stage']), p => [p], { description: '검증된 악보·semantic·latent를 재사용해 원본을 보존한 새 생성 작업을 시작합니다.' }),
  entry('prompt:knowledge', 'prompt:knowledge', S.object({ topic: knowledgeTopic }), p => [p], { description: '번들된 장르·가사·검토 가이드를 읽기 전용으로 조회합니다.' }),
  entry('skills:status', null, S.object({ host: skillHost, target: absolutePath }), undefined, { local: true, description: '동봉 모션그래픽 스킬의 설치 상태를 조회합니다.' }),
  entry('skills:check', null, S.object({ host: skillHost, target: absolutePath }), undefined, { local: true, description: '모션그래픽 스킬의 새 GitHub Release를 확인합니다.' }),
  entry('skills:install', null, S.object({ host: skillHost, target: absolutePath, source: skillSource }), undefined, { local: true, description: '동봉 모션그래픽 스킬을 설치합니다.' }),
  entry('skills:update', null, S.object({ host: skillHost, target: absolutePath, source: skillSource }), undefined, { local: true, description: '확인된 스킬 GitHub Release로 업데이트합니다.' }),
  entry('skills:watch', null, S.object({ host: skillHost, target: absolutePath, timeoutMs: integer({ minimum: 1, maximum: 3600000 }) }), undefined, { local: true, description: '정해진 시간 동안 새 스킬 Release를 기다립니다.' }),
  entry('motion:handoff', null, S.object({ music: absolutePath, out: absolutePath, mode: motionMode, host: motionHost }, ['out']), undefined, { local: true, description: '선택 음원으로 새 HTML 모션그래픽 프로젝트를 만듭니다.' }),
  entry('motion:studio', null, S.object({ project: absolutePath, music: absolutePath, host: motionHost, open: S.boolean, review: S.boolean, timeout: integer({ minimum: 1, maximum: 3600000 }) }, ['project']), undefined, { local: true, description: '기존 HTML 모션그래픽 프로젝트의 선택·청취·검수 화면을 엽니다.' }),
  entry('songs:list', 'songs:list'), entry('songs:hidden', 'songs:hidden'), entry('songs:import', 'songs:import', noParams, undefined, { dialog: 'open' }), entry('songs:reorder', 'songs:reorder', S.object({ folders: arr(path) }, ['folders']), p => [p.folders]), entry('songs:hide', 'songs:hide', S.object({ folder: path, hide: S.boolean }, ['folder']), p => [p.folder, p.hide === undefined ? true : p.hide]), entry('songs:compact', 'songs:compact', noParams, undefined, { destructive: true }),
  entry('song:lyrics', 'song:lyrics', S.object({ ...productionContext, dir: path, lyrics: str({ maxLength: 20000 }) }, ['dir', 'lyrics']), p => [p], { description: '음원을 변경하지 않고 곡 정보의 가사 원문을 저장합니다.' }),
  entry('song:replace', 'song:replace', S.object({ ...productionContext, dir: absolutePath }, ['dir']), p => [p], { dialog: 'open', description: '곡 폴더와 순서를 유지하며 음원을 교체하고 이전 버전을 백업합니다.' }),
  entry('song:restore', 'song:restore', S.object({ ...productionContext, dir: absolutePath, backup: absolutePath }, ['dir', 'backup']), p => [p], { description: '현재 버전을 백업하고 지정한 곡 백업을 복원합니다.' }),
  entry('song:backups', 'song:backups', S.object({ dir: absolutePath }, ['dir']), p => [p], { description: '해당 곡에 속한 복원 가능한 백업을 조회합니다.' }),
  entry('app:capabilities', 'app:capabilities', noParams, undefined, { description: '실행 중인 서비스의 실제 명령·엔진 지원과 준비 상태를 조회합니다.' }),
  entry('app:screenshot', 'app:screenshot', noParams, undefined, { dialog: 'save', description: '현재 앱 창의 실제 표시 내용을 PNG로 저장합니다.' }),
  entry('song:lrc', 'song:lrc', S.object({ dir: path }, ['dir']), p => [p.dir]), entry('song:generate', 'song:generate', songGenerateParams, p => [p], { examples: [{ lyrics: '[Verse]\\n안녕하세요', engine: 'ace', seed: null }] }), entry('song:resume', 'song:resume', S.object({ ...productionContext, dir: path }, ['dir']), p => [p]), entry('song:score', 'song:score', S.object({ dir: path }, ['dir']), p => [p.dir]), entry('score:check', 'score:check', S.object({ text: str({ maxLength: 100000 }) }, ['text']), p => [p.text]), entry('score:open', 'score:open', noParams, undefined, { dialog: 'open' }), entry('score:convert', 'score:convert', S.object({ choice: scoreChoice }, ['choice']), p => [p.choice]), entry('song:render', 'song:render', S.object({ ...productionContext, dir: path, abc: str({ minLength: 1, maxLength: 100000 }), title: str({ maxLength: 200 }) }, ['dir', 'abc']), p => [p]), entry('song:cancel', 'song:cancel', S.object({ jobId: path }, ['jobId']), p => [p.jobId]), entry('song:delete', 'song:delete', S.object({ dir: path }, ['dir']), p => [p.dir], { destructive: true }), entry('song:rename', 'song:rename', S.object({ ...productionContext, dir: path, title: path }, ['dir', 'title']), p => [p]), entry('song:reveal', 'song:reveal', S.object({ dir: path }, ['dir']), p => [p.dir]), entry('song:background', 'song:background', S.object({ dir: path }, ['dir']), p => [p.dir], { dialog: 'open' }), entry('song:background-clear', 'song:background-clear', S.object({ dir: path }, ['dir']), p => [p.dir]), entry('song:save-srt', 'song:save-srt', S.object({ title: str({ maxLength: 200 }), text: str({ maxLength: 200000 }), save: S.boolean }, ['title', 'text']), p => [{ title: p.title, text: p.text }], { dialog: 'save' }), entry('song:export', 'song:export', S.object({ dir: path, title: str({ maxLength: 200 }), format: { type: 'string', enum: ['mp3', 'wav'] } }, ['dir']), p => [{ dir: p.dir, title: p.title, format: p.format }], { dialog: 'save' }), entry('album:export', 'album:export', S.object({ format: { type: 'string', enum: ['mp3', 'wav'] }, minRating: integer({ minimum: 0, maximum: 5 }), numbered: S.boolean }), p => [p], { dialog: 'open', directory: true }),
  entry('queue:list', 'queue:list'), entry('queue:remove', 'queue:remove', S.object({ jobId: path }, ['jobId']), p => [p.jobId], { destructive: true }), entry('queue:retry', 'queue:retry', S.object({ jobId: path }, ['jobId']), p => [p.jobId]), entry('queue:move', 'queue:move', S.object({ jobId: path, delta: integer({ minimum: -1000, maximum: 1000 }) }, ['jobId', 'delta']), p => [{ jobId: p.jobId, delta: p.delta }]), entry('queue:reorder', 'queue:reorder', S.object({ ids: arr(path) }, ['ids']), p => [p.ids]), entry('queue:pause', 'queue:pause', S.object({ value: S.boolean }, ['value']), p => [p.value]), entry('queue:dismiss', 'queue:dismiss', S.object({ jobId: path }, ['jobId']), p => [p.jobId]), entry('queue:clear', 'queue:clear', noParams, undefined, { destructive: true }),
  entry('video:settings', 'video:settings'), entry('video:save-settings', 'video:save-settings', S.object({ video }, ['video']), p => [p.video]), entry('video:prepare', 'video:prepare', S.object({ ...productionContext, tracks: arr(S.object({ path: absolutePath, title: str({ maxLength: 200 }) }, ['path']), { minItems: 1 }), fps: { type: 'integer', enum: [30, 60] }, analysis }, ['tracks']), p => [p]), entry('video:background', 'video:background', S.object({ kind: { type: 'string', enum: ['image', 'video'] } }, ['kind']), p => [p.kind], { dialog: 'open' }), entry('video:start', 'video:start', S.object({ cycleId: str({ minLength: 1 }), video, name: str({ maxLength: 200 }) }, ['cycleId', 'video']), p => [p], { dialog: 'save' }), entry('tracklist:write', 'tracklist:write', S.object({ index: integer({ minimum: 0 }), dataUrl: str({ minLength: 1, maxLength: 20000000 }), first: S.boolean }, ['index', 'dataUrl']), p => [p.index, p.dataUrl, p.first]), entry('video:frame', 'video:frame', S.object({ jobId: path, index: integer({ minimum: 0 }), data: arr(integer({ minimum: 0, maximum: 255 })) }, ['jobId', 'index', 'data']), p => [p.jobId, p.index, p.data]), entry('video:layer', 'video:layer', S.object({ jobId: path, data: arr(integer({ minimum: 0, maximum: 255 })) }, ['jobId', 'data']), p => [p.jobId, p.data]), entry('video:finish', 'video:finish', S.object({ jobId: path }, ['jobId']), p => [p.jobId]), entry('video:compare', 'video:compare', S.object({ output: absolutePath, frame: integer({ minimum: 0 }), against: integer({ minimum: 0 }), fps: { type: 'integer', enum: [30, 60] }, width: integer({ minimum: 1, maximum: 7680 }), height: integer({ minimum: 1, maximum: 4320 }), rgba: arr(integer({ minimum: 0, maximum: 255 }), { minItems: 4 }), background }, ['output', 'frame', 'fps', 'width', 'height', 'rgba']), p => [p]),
  entry('settings:move-models', 'settings:move-models', noParams, undefined, { dialog: 'open', directory: true, destructive: true }), entry('settings:move-songs', 'settings:move-songs', noParams, undefined, { dialog: 'open', directory: true, destructive: true }), entry('settings:pick-export', 'settings:pick-export', noParams, undefined, { dialog: 'open', directory: true }), entry('settings:get', 'settings:get'), entry('settings:set', 'settings:set', S.object({ patch: S.object({ autoMp3: S.boolean, dropWav: S.boolean }) }, ['patch']), p => [p.patch]),
  entry('assets:list', 'assets:list'), entry('assets:import', 'assets:import', noParams, undefined, { dialog: 'open' }), entry('assets:remove', 'assets:remove', S.object({ file: absolutePath }, ['file']), p => [p.file], { destructive: true }), entry('recording:save', 'recording:save', S.object({ bytes: arr(integer({ minimum: 0, maximum: 255 }), { minItems: 1 }) }, ['bytes']), p => [p.bytes]), entry('recording:activity', 'recording:activity', S.object({ active: S.boolean }, ['active']), p => [p.active]), entry('recording:pick', 'recording:pick', noParams, undefined, { dialog: 'open' }), entry('presets:list', 'presets:list'), entry('presets:save', 'presets:save', S.object({ preset }, ['preset']), p => [p.preset]), entry('presets:delete', 'presets:delete', S.object({ name: path }, ['name']), p => [p.name], { destructive: true }), entry('presets:move', 'presets:move', S.object({ name: path, folder: str({ maxLength: 30 }) }, ['name', 'folder']), p => [{ name: p.name, folder: p.folder }]),
  entry('shell:open', 'shell:open', S.object({ target: absolutePath }, ['target']), p => [p.target]), entry('log:open', 'log:open'), entry('ui:log', 'ui:log', S.object({ text: str({ maxLength: 10000 }) }, ['text']), p => [p.text]),
  entry('update:status', 'update:status'), entry('update:check', 'update:check', S.object({ manual: S.boolean }), p => [p]), entry('update:download', 'update:download'), entry('update:install', 'update:install'), entry('update:watch', 'update:watch', S.object({ timeoutMs: integer({ minimum: 1, maximum: 3600000 }) }), p => [p]), entry('update:quiet-week', 'update:quiet-week'), entry('update:open-page', 'update:open-page', S.object({ page: str({ minLength: 1, pattern: '^https://github\\.com/roadkwonai/music-road/' }) }, ['page']), p => [p.page]),
  entry('about:info', 'about:info'), entry('about:open', 'about:open', S.object({ where: { type: 'string', enum: ['site', 'apps', 'privacy', 'feedback', 'store'] } }, ['where']), p => [p.where]), entry('about:feedback', 'about:feedback', S.object({ form: S.object({ email: str({ minLength: 3, maxLength: 320, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }), message: str({ minLength: 1, maxLength: 19500 }), kind: { type: 'string', enum: ['question', 'report'] }, withSystem: S.boolean, withLog: S.boolean }, ['email', 'message']) }, ['form']), p => [p.form]), entry('notices:latest', 'notices:latest'), entry('notices:open', 'notices:open', S.object({ url: str({ pattern: '^https://roadkwon\\.dev/' }) }, ['url']), p => [p.url]), entry('window:fullscreen', 'window:fullscreen', S.object({ on: S.boolean }, ['on']), p => [p.on]), entry('app:set-language', 'app:set-language', S.object({ lang: { type: 'string', enum: ['ko', 'en', 'ja'] } }, ['lang']), p => [p.lang])
]
const rendererParams = { 'lyrics:clean': S.object({ text: str({ maxLength: 20000 }) }), 'lyrics:check': S.object({ text: str({ maxLength: 20000 }), targetSeconds: nullable(num({ minimum: 1, maximum: 3600 })) }), 'lyrics:sections': S.object({ text: str({ maxLength: 20000 }) }), 'lyrics:numbers': S.object({ text: str({ maxLength: 20000 }) }), 'prompt:compose': S.object({ ...parts.properties, lyrics: str({ maxLength: 20000 }), soundEffect: S.boolean }), 'song:detail': S.object({ dir: path, id: path, folder: path }), 'song:clone': S.object({ dir: path, id: path, folder: path, apply: S.boolean }), 'song:srt': S.object({ dir: path, id: path, folder: path, save: S.boolean }), 'video:render': S.object({ ...productionContext, tracks: arr(rendererTrack), video, name: str({ maxLength: 200 }) }), 'video:preview': S.object({ tracks: arr(rendererTrack), video }), 'video:seek': S.object({ seconds: num({ minimum: 0, maximum: 86400 }) }, ['seconds']), 'player:play': S.object({ dir: path, id: path, folder: path }), 'player:seek': S.object({ seconds: num({ minimum: 0, maximum: 86400 }) }, ['seconds']), 'recording:stop': S.object({ discard: S.boolean }), 'video:cancel': S.object({ jobId: path }) }
for (const command of ['video:prepare', 'video:start', 'video:frame', 'video:layer', 'video:finish', 'video:compare', 'tracklist:write', 'recording:save', 'recording:activity']) {
  entries.find(entry => entry.command === command).internal = true
}
for (const [command, text] of Object.entries({
  'song:lrc': '곡 가사에서 LRC 자막을 읽습니다',
  'song:score': '곡에서 ABC 악보를 읽습니다',
  'queue:dismiss': '실패한 작업 카드를 목록에서 지웁니다',
  'settings:move-models': 'YuE 또는 Hugging Face 모델 캐시를 다른 폴더로 옮깁니다'
})) entries.find(entry => entry.command === command).description = text
for (const command of ['renderer:catalog', 'lyrics:clean', 'lyrics:check', 'lyrics:sections', 'lyrics:numbers', 'prompt:compose', 'prompt:catalog', 'song:detail', 'song:clone', 'song:srt', 'video:render', 'video:preview', 'video:seek', 'video:play', 'video:pause', 'video:state', 'video:chapters', 'video:cancel', 'player:play', 'player:pause', 'player:next', 'player:previous', 'player:seek', 'player:state', 'player:stop', 'editor:state', 'editor:open', 'editor:close', 'recording:start', 'recording:stop', 'recording:state']) entries.push(entry(command, command === 'video:cancel' ? 'video:cancel' : null, rendererParams[command] || noParams, p => [p], { renderer: true }))
entries.push(entry('video:configure', null, S.object({ video, save: S.boolean }, ['video']), p => [p], { renderer: true,
  description: '배경·스펙트럼·EQ·오버레이·트랙리스트 설정을 적용하고 선택적으로 저장합니다.' }))
entries.push(entry('song:info', null, S.object({ dir: absolutePath, open: S.boolean }, ['dir']), p => [p], { renderer: true,
  description: '전체 가사 창을 열거나 닫고 실제 표시 텍스트를 조회합니다.' }))
entries.push(entry('system:stats', 'system:stats', noParams, undefined, { description: 'RAM·GPU 메모리 사용량과 생성 중 여부를 조회합니다.' }))
entries.push(entry('cli:invoke', 'cli:invoke', noParams, undefined, { internal: true, description: 'CLI 렌더러 요청 컨텍스트 전달' }))
entries.find(item => item.command === 'video:render').dialog = 'save'
entries.find(item => item.command === 'song:srt').outputWhen = 'save=true이면 --output 파일이 필요합니다.'
entries.find(item => item.command === 'album:export').params.properties.dirs = arr(absolutePath)
const catalog = Object.create(null)
for (const e of entries) { if (Object.prototype.hasOwnProperty.call(catalog, e.command)) throw new Error(`Duplicate CLI command: ${e.command}`); catalog[e.command] = e }
function fail (message) { const error = new Error(message); error.code = 'INVALID_ARGUMENT'; throw error }
function validate (command, params = {}) {
  if (typeof command !== 'string' || !Object.prototype.hasOwnProperty.call(catalog, command)) fail(`Unknown command: ${command}`)
  const e = catalog[command]; if (params === null || typeof params !== 'object' || Array.isArray(params)) fail(`${command} expects an object`)
  const check = (value, spec, key) => {
    if (value === null) { if (spec.nullable) return; fail(`${key} must not be null`) }
    if (spec.anyOf) {
      for (const alternative of spec.anyOf) {
        try { check(value, alternative, key); return } catch {}
      }
      fail(`${key} has an invalid value`)
    }
    if (spec.type === 'string' && typeof value !== 'string') fail(`${key} must be a string`)
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) fail(`${key} must be a finite number`)
    if (spec.type === 'integer' && (!Number.isInteger(value) || !Number.isFinite(value))) fail(`${key} must be an integer`)
    if (spec.type === 'boolean' && typeof value !== 'boolean') fail(`${key} must be a boolean`)
    if (spec.type === 'string' && spec.minLength !== undefined && value.length < spec.minLength) fail(`${key} is too short`)
    if (spec.type === 'string' && spec.maxLength !== undefined && value.length > spec.maxLength) fail(`${key} is too long`)
    if (spec.type === 'string' && spec.maxBytes !== undefined && Buffer.byteLength(value, 'utf8') > spec.maxBytes) fail(`${key} exceeds its UTF-8 byte limit`)
    if (spec.type === 'string' && spec.pattern && !(new RegExp(spec.pattern).test(value))) fail(`${key} has an invalid format`)
    if (spec.format === 'local-media-path' && /^[\\/]{2}/.test(value)) fail(`${key} must be a local file path`)
    if (spec.format === 'local-file-url') {
      try {
        const url = new URL(value)
        if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost') || /^[\\/]{2}/.test(decodeURIComponent(url.pathname))) fail(`${key} must be a local file URL`)
        fileURLToPath(url)
      } catch { fail(`${key} must be a local file URL`) }
    }
    if ((spec.type === 'number' || spec.type === 'integer') && spec.minimum !== undefined && value < spec.minimum) fail(`${key} is below the minimum`)
    if ((spec.type === 'number' || spec.type === 'integer') && spec.maximum !== undefined && value > spec.maximum) fail(`${key} is above the maximum`)
    if ((spec.type === 'number' || spec.type === 'integer') && spec.exclusiveMinimum !== undefined && value <= spec.exclusiveMinimum) fail(`${key} is below the minimum`)
    if (spec.enum && !spec.enum.includes(value)) fail(`${key} has an invalid value`)
    if (spec.type === 'array') { if (!Array.isArray(value)) fail(`${key} must be an array`); if (spec.minItems !== undefined && value.length < spec.minItems) fail(`${key} has too few items`); if (spec.maxItems !== undefined && value.length > spec.maxItems) fail(`${key} has too many items`); if (spec.items) value.forEach((item, i) => check(item, spec.items, `${key}[${i}]`)) }
    if (spec.type === 'object') { if (typeof value !== 'object' || Array.isArray(value)) fail(`${key} must be an object`); for (const name of Object.getOwnPropertyNames(value)) { if (name === '__proto__' || name === 'constructor' || name === 'prototype') fail(`Forbidden parameter: ${key}.${name}`); if (spec.additionalProperties === false && !Object.prototype.hasOwnProperty.call(spec.properties || {}, name)) fail(`Unknown parameter: ${key}.${name}`) } for (const name of spec.required || []) if (value[name] === undefined || value[name] === null) fail(`Missing parameter: ${key}.${name}`); for (const [name, child] of Object.entries(spec.properties || {})) if (value[name] !== undefined) check(value[name], child, `${key}.${name}`) }
  }
  const raw = { ...params }; check(raw, e.params || noParams, command)
  if (command === 'production:task-progress' && raw.progress === undefined && raw.currentStage === undefined && raw.summary === undefined) fail('production:task-progress requires progress, currentStage, or summary')
  if (command === 'song:replay') {
    const issue = advancedError(params.advanced || {}) || runtimeError(params.runtime || {}, 'yue-mlx')
    if (issue) fail(issue)
    const allowed = params.stage === 'plan' ? ['temperature', 'topP', 'topK', 'repetitionPenalty', 'penaltyWindow', 'minTokens', 'maxTokens', 'cfgScale', 'odeSteps'] : params.stage === 'synthesize' ? ['odeSteps'] : []
    for (const key of Object.keys(params.advanced || {})) if (!allowed.includes(key)) fail(`${key} cannot change during ${params.stage} replay`)
    if (params.stage === 'decode') for (const key of ['precision', 'queryChunkSize', 'loraPath', 'loraScale']) if (params.runtime && params.runtime[key] !== undefined) fail(`${key} cannot change during decode replay`)
    if (params.stage === 'synthesize' && params.runtime && params.runtime.precision !== undefined) fail('precision cannot change during synthesize replay')

  }
  if (['score:inspect', 'score:strip-chords'].includes(command)) {
    if ((params.text === undefined) === (params.file === undefined)) fail('text 또는 file 중 정확히 하나를 지정하세요.')
  }
  if (command === 'score:compare') for (const input of [params.source, params.candidate]) {
    if ((input.text === undefined) === (input.file === undefined)) fail('각 악보에 text 또는 file 중 정확히 하나가 필요합니다.')
  }
  const value = { ...raw }
  if (command === 'storage:lease' && value.operation === 'acquire' && value.pid === undefined) fail('storage:lease acquire requires the producer pid')
  if (value.video) {
    const media = item => item && !item.path && item.url ? { ...item, path: fileURLToPath(item.url) } : item
    value.video = { ...value.video }
    if (value.video.background) value.video.background = media(value.video.background)
    if (value.video.overlays) value.video.overlays = value.video.overlays.map(media)
    const cover = value.video.spectrum && value.video.spectrum.cover
    if (cover) {
      if (!cover.path && !cover.url) fail('CD cover path or URL is required')
      value.video.spectrum = { ...value.video.spectrum, cover: media(cover) }
    }
  }
  if (command === 'song:generate' || command === 'song:prepare') { value.engine = value.engine || 'ace'; value.title = value.title || String(value.lyrics || '').split(/\r?\n/).find(Boolean) || '무제'; if (value.bpm !== undefined) value.parts = { ...(value.parts || {}), bpm: value.bpm } }
  const error = ['song:generate', 'song:prepare'].includes(command) && generationError(value); if (error) fail(error)
  return { ...e, paramsValue: value, args: (e.args || (() => []))(value) }
}
function schema ({ includeInternal = false } = {}) { return { version: 2, capabilities: { transport: 'json', nestedValidation: true, rendererAutomation: true }, errors: { invalidArgument: 'INVALID_ARGUMENT' }, defaults: { 'song:generate.engine': 'ace' }, commands: entries.filter(e => includeInternal || !e.internal).map(({ args, ...e }) => e) } }
module.exports = { commands: catalog, schema, validate }
