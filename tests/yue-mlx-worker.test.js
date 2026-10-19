'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const path = require('node:path')

const worker = path.join(__dirname, '..', 'python', 'yue_mlx_worker.py')
const harness = String.raw`
import importlib.util, json, os, sys, tempfile
from pathlib import Path
import types

root = Path(tempfile.mkdtemp())
(root / 'models').mkdir()
(root / 'vae').mkdir()
(root / 'models' / 'conversion.json').write_text('{}')
for precision in ('8bit', 'bf16'):
    (root / 'models' / f'ar-{precision}.safetensors').write_bytes(b'weights')
(root / 'vae' / 'config.json').write_text('{}')
linked_models = root / 'shared-models'
linked_models.symlink_to(root / 'models', target_is_directory=True)
(root / 'style.safetensors').write_bytes(b'lora')
os.environ['ROADMUSIC_YUE_MLX_ROOT'] = str(root)
os.environ['ROADMUSIC_YUE_MLX_MODELS'] = str(root / 'models')
os.environ['ROADMUSIC_YUE_MLX_VAE'] = str(root / 'vae')
soundfile = types.ModuleType('soundfile')
soundfile.read = lambda _path, always_2d=False: ([[0.0, 0.0]], 48000)
soundfile.write = lambda path, _audio, _rate, subtype=None: Path(path).write_bytes(b'wav')
sys.modules['soundfile'] = soundfile

sys.path.insert(0, str(Path(sys.argv[1]).parent))
spec = importlib.util.spec_from_file_location('yue_mlx_worker', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
os.environ['ROADMUSIC_YUE_MLX_MODELS'] = str(linked_models)
assert module.runtime_paths()[1] == (root / 'models').resolve()

calls = []
class FakeProcess:
    def __init__(self, command, **kwargs):
        raw = json.loads(Path(command[command.index('--request') + 1] if '--request' in command else command[4]).read_text())
        calls.append((command, kwargs, raw.get('request', raw), raw))
        destination = Path(command[command.index('--output') + 1])
        destination.mkdir(parents=True, exist_ok=True)
        (destination / 'audio.flac').write_bytes(b'flac')
        (destination / 'result.json').write_text(json.dumps({'status': 'complete', 'sample_rate': 48000, 'audio_seconds': 181.25, 'truncated': {'abc': False, 'semantic': True}, 'identity': 'ok'}))
        self.stderr = iter(['Planning score\\n', 'Generating song\\n', 'Running Generating song: 100 tokens\\n'])
        self.returncode = 0
    def wait(self): return self.returncode
    def poll(self): return None
    def terminate(self): self.returncode = -15
module.subprocess.Popen = lambda command, **kwargs: FakeProcess(command, **kwargs)

out = Path(tempfile.mkdtemp())
music = module.Worker()
events = []
module.emit = lambda **event: events.append(event)
music.generate({'jobId': 'one', 'outDir': str(out), 'id': 'song', 'style': 'Korean ballad', 'lyrics': '[Verse]\\n안녕', 'seed': '7', 'cot': 'full', 'targetSeconds': 180, 'advanced': {'temperature': .8, 'topP': .9, 'topK': 80, 'repetitionPenalty': 1.1, 'penaltyWindow': 50, 'maxTokens': 9000, 'minTokens': 0, 'abcTemperature': .7, 'abcTopP': .9, 'abcTopK': 30, 'abcRepetitionPenalty': 1.005, 'abcPenaltyWindow': 100, 'abcMinTokens': 32, 'abcMaxTokens': 4096, 'cfgScale': 1.2, 'odeSteps': 32}, 'runtime': {'precision': 'bf16', 'memoryBudgetGiB': 20, 'vaeCoreFrames': 512, 'queryChunkSize': 512, 'vaePath': str(root / 'vae'), 'loraPath': str(root / 'style.safetensors'), 'loraScale': .75}})
command, kwargs, request = calls[-1][:3]
assert command[0] == sys.executable and command[1].endswith('yue_stages.py')
assert calls[-1][3]['stage'] == 'generate'
assert command[command.index('--model') + 1] == str((root / 'models').resolve())
assert command[command.index('--vae') + 1] == str(root / 'vae')
assert '--require-ac' in command and '--resume' not in command
assert command[command.index('--precision') + 1] == 'bf16'
assert command[command.index('--memory-budget-gib') + 1] == '20'
assert command[command.index('--vae-core-frames') + 1] == '512'
assert calls[-1][3]['runtime']['loraPath'] == str(root / 'style.safetensors')
assert calls[-1][3]['runtime']['loraScale'] == .75
assert '--query-chunk-size' not in command
assert request['cot'] == 'full' and request['seed'] == 7
assert request['semantic_sampling'] == {'temperature': .8, 'top_p': .9, 'top_k': 80, 'repetition_penalty': 1.1, 'penalty_window': 50, 'max_tokens': 9000, 'min_tokens': 0}
assert request['abc_sampling'] == {'temperature': .7, 'top_p': .9, 'top_k': 30, 'repetition_penalty': 1.005, 'penalty_window': 100, 'min_tokens': 32, 'max_tokens': 4096}
assert request['cfg_scale'] == 1.2
assert request['generation_config'] == {'ode_steps': 32}
assert not (out / 'request.roadmusic.json').exists()
assert (out / 'audio.flac').read_bytes() == b'flac'
assert (out / 'audio.wav').read_bytes() == b'wav'
meta = json.loads((out / 'meta.json').read_text())
assert meta['engineId'] == 'yue-mlx' and meta['requestedTargetSeconds'] == 180
assert meta['seconds'] == 181.25 and meta['truncated']['semantic'] is True
assert meta['controls']['generation_config'] == {'ode_steps': 32}
assert meta['runtime']['queryChunkSize'] == 512
done = events[-1]
assert len([e for e in events if e.get('type') == 'stage' and e.get('stage') == 'semantic']) == 1
assert done['type'] == 'done' and done['audio'] == str(out / 'audio.wav')

# A completed upstream artifact is only resumed after its request is proven identical.
music.generate({'jobId': 'two', 'outDir': str(out), 'id': 'song', 'style': 'Korean ballad', 'lyrics': '[Verse]\\n안녕', 'seed': '7', 'cot': 'full', 'targetSeconds': 180, 'advanced': {'temperature': .8, 'topP': .9, 'topK': 80, 'repetitionPenalty': 1.1, 'penaltyWindow': 50, 'maxTokens': 9000, 'minTokens': 0, 'abcTemperature': .7, 'abcTopP': .9, 'abcTopK': 30, 'abcRepetitionPenalty': 1.005, 'abcPenaltyWindow': 100, 'abcMinTokens': 32, 'abcMaxTokens': 4096, 'cfgScale': 1.2, 'odeSteps': 32}, 'runtime': {'precision': 'bf16', 'memoryBudgetGiB': 20, 'vaeCoreFrames': 512, 'queryChunkSize': 512, 'vaePath': str(root / 'vae'), 'loraPath': str(root / 'style.safetensors'), 'loraScale': .75}})
assert calls[-1][3]['stage'] == 'verify'

# Stage replay inherits effective runtime while retaining the explicit override boundary.
replayed = Path(tempfile.mkdtemp())
music.generate({'jobId': 'replay', 'outDir': str(replayed), 'id': 'song', 'style': 'Korean ballad', 'lyrics': '안녕', 'seed': 7,
               'runtime': {'queryChunkSize': 777, 'loraPath': str(root / 'style.safetensors'), 'loraScale': .5},
               'reuse': {'stage': 'synthesize', 'source': str(out), 'runtimeExplicit': {}}})
assert calls[-1][3]['runtime']['queryChunkSize'] == 777
assert calls[-1][3]['runtime']['loraPath'] == str(root / 'style.safetensors')
assert calls[-1][3]['runtime']['loraScale'] == .5
assert calls[-1][3]['runtimeExplicit'] == {}

# A bare score.abc is not a trusted partial plan. A score accompanied by the
# complete, intact plan manifest is reused for the fresh attempt.
stale = Path(tempfile.mkdtemp())
(stale / 'score.abc').write_text('X:1\\nK:C\\nC')
module.Worker().generate({'jobId': 'stale', 'outDir': str(stale), 'id': 'song', 'style': 'x', 'lyrics': 'y', 'seed': 9, 'cot': 'full'})
assert 'abc' not in calls[-1][2]

saved = Path(tempfile.mkdtemp())
plan = saved / 'plan'
plan.mkdir()
for name, text in {'plan.json': '{}', 'abc_tokens.npy': 'tokens', 'prefix.npy': 'prefix', 'score.abc': 'X:1\\nK:C\\nC'}.items():
    (plan / name).write_text(text)
manifest = {name: __import__('hashlib').sha256((plan / name).read_bytes()).hexdigest() for name in ('plan.json', 'abc_tokens.npy', 'prefix.npy', 'score.abc')}
(plan / 'plan_manifest.json').write_text(json.dumps(manifest))
(saved / 'score.abc').write_text((plan / 'score.abc').read_text())
assert module.valid_saved_score(saved)
module.Worker().generate({'jobId': 'saved', 'outDir': str(saved), 'id': 'song', 'style': 'x', 'lyrics': 'y', 'seed': 9, 'cot': 'full'})
assert calls[-1][2]['abc'] == 'X:1\\nK:C\\nC'

for bad in ({'cot': 'off', 'abc': 'X:1'}, {'seed': -1}, {'advanced': {'maxTokens': 24577}}, {'advanced': {'topK': True}}, {'advanced': {'minTokens': 100, 'maxTokens': 99}}, {'runtime': {'queryChunkSize': 4}}):
    attempt = module.Worker()
    try:
        attempt.generate({'jobId': 'bad', 'outDir': str(Path(tempfile.mkdtemp())), 'id': 'song', 'style': 'x', 'lyrics': 'y', **bad})
    except (RuntimeError, ValueError):
        pass
    else:
        raise AssertionError('invalid request was accepted: %r' % (bad,))
`

test('YuE MLX worker invokes the pinned public CLI, preserves natural length and only resumes complete results', () => {
  const result = spawnSync('python3', ['-c', harness, worker], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('YuE MLX worker force-stops a child that ignores SIGTERM', () => {
  const code = String.raw`
import importlib.util, signal, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1]).parent))
spec = importlib.util.spec_from_file_location('worker', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
child = subprocess.Popen([sys.executable, '-c', 'import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(30)'])
worker = module.Worker()
worker.current_process = child
worker.stop_process(force=True)
assert child.wait(timeout=2) != 0
`
  const result = spawnSync('python3', ['-c', code, worker], { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
