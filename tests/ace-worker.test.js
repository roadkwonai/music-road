'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const path = require('node:path')

const worker = path.join(__dirname, '..', 'python', 'ace_worker.py')
const harness = String.raw`
import importlib.util, json, os, sys, tempfile, types
from pathlib import Path

class Tensor:
    def __init__(self, shape): self.shape = shape

class FakeCuda:
    def get_device_properties(self, _): return types.SimpleNamespace(total_memory=8 * 1024 ** 3)
    def is_available(self): return False
    def get_device_name(self, _): return 'fake'
    def empty_cache(self): pass

torch = types.ModuleType('torch')
torch.cuda = FakeCuda()
torch.mps = types.SimpleNamespace(empty_cache=lambda: None)
sys.modules['torch'] = torch

downloads = types.ModuleType('acestep.model_downloader')
downloads.MAIN_MODEL_COMPONENTS = ['acestep-5Hz-lm-1.7B']
handler = types.ModuleType('acestep.handler')
handler.AceStepHandler = object
inference = types.ModuleType('acestep.inference')
class GenerationParams:
    def __init__(self, **kw): self.__dict__.update(kw)
class GenerationConfig:
    def __init__(self, **kw): self.__dict__.update(kw)
inference.GenerationParams = GenerationParams
inference.GenerationConfig = GenerationConfig
inference.generate_music = lambda *args, **kwargs: None
llm = types.ModuleType('acestep.llm_inference')
llm.LLMHandler = object
acestep = types.ModuleType('acestep')
sys.modules.update({'acestep': acestep, 'acestep.model_downloader': downloads,
                    'acestep.handler': handler, 'acestep.inference': inference,
                    'acestep.llm_inference': llm})

written = {}
soundfile = types.ModuleType('soundfile')
class Samples(list):
    def __getitem__(self, key):
        value = super().__getitem__(key)
        return Samples(value) if isinstance(key, slice) else value
    def __imul__(self, factors):
        for index, factor in enumerate(factors): self[index] *= factor
        return self
def read(_path, always_2d=False):
    return Samples([1.0] * 1000), 100
def write(path, samples, sample_rate):
    Path(path).write_bytes(b'fake wav')
    written[str(path)] = (list(samples), sample_rate)
def info(path):
    samples, rate = written.get(str(path), ([0.0] * 1000, 100))
    return types.SimpleNamespace(frames=len(samples), samplerate=rate)
soundfile.read, soundfile.write, soundfile.info = read, write, info
sys.modules['soundfile'] = soundfile

numpy = types.ModuleType('numpy')
numpy.linspace = lambda start, stop, count: [start + (stop - start) * i / max(count - 1, 1) for i in range(count)]
sys.modules['numpy'] = numpy

os.environ['ROADMUSIC_ACE_SRC'] = tempfile.mkdtemp()
spec = importlib.util.spec_from_file_location('ace_worker', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
params_seen = []
def generate_music(_dit, _lm, *, params, config, save_dir, progress):
    params_seen.append(params)
    source = Path(save_dir) / 'source.wav'
    source.write_bytes(b'input')
    return types.SimpleNamespace(success=True, audios=[{'path': str(source), 'tensor': Tensor((1, 1000)), 'sample_rate': 100}], extra_outputs=None)
module.generate_music = generate_music

class TestWorker(module.Worker):
    def __init__(self):
        super().__init__()
        self.models_loaded = False
        self.dit = object()
        self.lm = object()
    def ensure_models(self, _job_id): self.models_loaded = True

out = Path(tempfile.mkdtemp())
effect = TestWorker()
effect.generate({'jobId': 'effect', 'outDir': str(out), 'style': '문 여는 소리', 'targetSeconds': 1, 'soundEffect': True, 'cover': None})
p = params_seen[-1]
assert p.duration == 10.0
assert p.thinking is False
assert p.instrumental is True
assert p.lyrics == '[Instrumental]'
assert p.caption == '문 여는 소리, sound effect, no music, no vocals'
samples, rate = written[str(out / 'audio.wav')]
assert len(samples) == 100
assert rate == 100
assert samples[-1] == 0.0
assert json.loads((out / 'result.json').read_text())['seconds'] == 1.0
assert json.loads((out / 'result.json').read_text())['soundEffect'] is True

music = TestWorker()
music.generate({'jobId': 'music', 'outDir': str(out), 'style': 'ambient piano', 'targetSeconds': 30})
p = params_seen[-1]
assert p.thinking is True
assert p.instrumental is False
assert p.duration == 30.0

for bad in (0, 601, float('inf'), True, '10'):
    invalid = TestWorker()
    try:
        invalid.generate({'jobId': 'bad', 'outDir': str(out), 'style': 'x', 'targetSeconds': bad})
    except RuntimeError:
        pass
    else:
        raise AssertionError('invalid targetSeconds was accepted: %r' % (bad,))
    assert not invalid.models_loaded

for job in (
    {'jobId': 'effect-missing-length', 'outDir': str(out), 'style': 'x', 'soundEffect': True},
    {'jobId': 'effect-long', 'outDir': str(out), 'style': 'x', 'soundEffect': True, 'targetSeconds': 31},
    {'jobId': 'effect-cover', 'outDir': str(out), 'style': 'x', 'soundEffect': True, 'targetSeconds': 1, 'cover': {'audio': 'x'}},
    {'jobId': 'effect-plan', 'outDir': str(out), 'style': 'x', 'soundEffect': True, 'targetSeconds': 1, 'mode': 'plan'},
):
    invalid = TestWorker()
    try:
        invalid.generate(job)
    except RuntimeError:
        pass
    else:
        raise AssertionError('invalid sound effect was accepted')
    assert not invalid.models_loaded
`

test('ACE worker validates short sound effects and crops their WAV output', () => {
  const result = spawnSync('python3', ['-c', harness, worker], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
