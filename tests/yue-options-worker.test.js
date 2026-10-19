'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const path = require('node:path')

const options = path.join(__dirname, '..', 'python', 'yue_options.py')
const windowsWorker = path.join(__dirname, '..', 'python', 'worker.py')

test('YuE 옵션은 공식 16개 제어를 두 생성 단계에 정확히 매핑한다', () => {
  const code = String.raw`
import importlib.util, sys
spec = importlib.util.spec_from_file_location('options', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
values = {
  'temperature': 0, 'topP': .95, 'topK': 100, 'repetitionPenalty': 1.2,
  'penaltyWindow': 50, 'minTokens': 200, 'maxTokens': 24576,
  'abcTemperature': .7, 'abcTopP': .9, 'abcTopK': 30,
  'abcRepetitionPenalty': 1.005, 'abcPenaltyWindow': 100,
  'abcMinTokens': 32, 'abcMaxTokens': 4096, 'cfgScale': 1.2, 'odeSteps': 32,
}
assert module.normalize_advanced(values) == values
assert module.request_controls(values) == {
  'semantic_sampling': {'temperature': 0, 'top_p': .95, 'top_k': 100,
                        'repetition_penalty': 1.2, 'penalty_window': 50,
                        'min_tokens': 200, 'max_tokens': 24576},
  'abc_sampling': {'temperature': .7, 'top_p': .9, 'top_k': 30,
                   'repetition_penalty': 1.005, 'penalty_window': 100,
                   'min_tokens': 32, 'max_tokens': 4096},
  'cfg_scale': 1.2, 'generation_config': {'ode_steps': 32},
}
assert module.normalize_seed('9223372036854775807') == 9223372036854775807
assert module.normalize_runtime({'precision': '4bit', 'memoryBudgetGiB': 12,
  'vaeCoreFrames': 128, 'queryChunkSize': 512, 'requireAc': False}) == {
  'precision': '4bit', 'memoryBudgetGiB': 12, 'vaeCoreFrames': 128,
  'queryChunkSize': 512, 'requireAc': False}
for bad in (
    {'topK': True}, {'topK': 2.0}, {'topP': float('nan')},
    {'maxTokens': 24577}, {'minTokens': 100, 'maxTokens': 99},
    {'abcMinTokens': 5000}, {'unknown': 1}, {'odeSteps': 0},
):
  try:
    module.normalize_advanced(bad)
  except ValueError:
    pass
  else:
    raise AssertionError('accepted invalid options: %r' % (bad,))
for runtime in ({'memoryBudgetGiB': float('nan')}, {'queryChunkSize': 4},
                {'requireAc': 1}, {'precision': 'fp16'}, {'unsupported': 1}):
  try:
    module.normalize_runtime(runtime)
  except ValueError:
    pass
  else:
    raise AssertionError('accepted invalid runtime: %r' % (runtime,))
for seed in (True, -1, 2**63, '01x'):
  try:
    module.normalize_seed(seed)
  except ValueError:
    pass
  else:
    raise AssertionError('accepted invalid seed: %r' % (seed,))
`
  const result = spawnSync('python3', ['-c', code, options], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('Windows YuE 워커는 큰 시드를 생성 정수로 유지하고 JSON 메타에는 문자열로 보존한다', () => {
  const code = String.raw`
import dataclasses, importlib.util, json, sys, tempfile, types
from pathlib import Path

torch = types.ModuleType('torch')
torch.cuda = types.SimpleNamespace(set_per_process_memory_fraction=lambda *_a, **_kw: None,
                                  empty_cache=lambda: None, is_available=lambda: False,
                                  get_device_name=lambda _index: 'fake')
sys.modules['torch'] = torch
numpy = types.ModuleType('numpy')
sys.modules['numpy'] = numpy

cuda_graph = types.ModuleType('yue2.cuda_graph')
cuda_graph.GraphAR = object
nar = types.ModuleType('yue2.nar')
nar.attention = lambda *args, **kwargs: None
yue2 = types.ModuleType('yue2')
yue2.YuE2Pipeline = object
pipeline = types.ModuleType('yue2.pipeline')
pipeline.SymbolicPlan = object
pipeline.SemanticResult = object
@dataclasses.dataclass
class GenerationConfig:
  ode_steps: int = 32
  context: int = 24576
protocol = types.ModuleType('yue2.protocol')
protocol.GenerationConfig = GenerationConfig
sys.modules.update({'yue2': yue2, 'yue2.cuda_graph': cuda_graph, 'yue2.nar': nar,
                    'yue2.pipeline': pipeline, 'yue2.protocol': protocol})

sys.path.insert(0, str(Path(sys.argv[1]).parent))
spec = importlib.util.spec_from_file_location('worker', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

@dataclasses.dataclass
class Request:
  style: str
  lyrics: str
  cot: str
  seed: int
  id: str
  cfg_scale: float | None = None

class Plan:
  abc = 'X:1\\nK:C\\nC'
  truncated = False
  def save(self, directory): directory.mkdir(parents=True, exist_ok=True)

class Pipe:
  def _request(self, **kwargs):
    self.seed = kwargs['seed']
    return Request(**kwargs)
  def plan(self, **_kwargs): return Plan()

class TestWorker(module.Worker):
  def __init__(self):
    super().__init__()
    self.test_pipe = Pipe()
  def ensure_pipe(self): return self.test_pipe

output = Path(tempfile.mkdtemp())
worker = TestWorker()
events = []
module.emit = lambda **event: events.append(event)
seed = '9223372036854775807'
worker.generate({'jobId': 'large-seed', 'outDir': str(output), 'style': 'ballad',
                 'lyrics': '가사', 'seed': seed, 'mode': 'plan'})
stored = json.loads((output / 'result.json').read_text(encoding='utf-8'))
assert worker.test_pipe.seed == int(seed)
assert stored['seed'] == seed and isinstance(stored['seed'], str)
assert events[-1]['meta']['seed'] == seed and isinstance(events[-1]['meta']['seed'], str)
print(json.dumps({'stored': stored['seed'], 'emitted': events[-1]['meta']['seed']}))
`
  const result = spawnSync('python3', ['-c', code, windowsWorker], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.deepEqual(JSON.parse(result.stdout), {
    stored: '9223372036854775807',
    emitted: '9223372036854775807'
  })
})
