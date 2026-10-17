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
(root / 'vae' / 'config.json').write_text('{}')
os.environ['ROADMUSIC_YUE_MLX_ROOT'] = str(root)
os.environ['ROADMUSIC_YUE_MLX_MODELS'] = str(root / 'models')
os.environ['ROADMUSIC_YUE_MLX_VAE'] = str(root / 'vae')
soundfile = types.ModuleType('soundfile')
soundfile.read = lambda _path, always_2d=False: ([[0.0, 0.0]], 48000)
soundfile.write = lambda path, _audio, _rate, subtype=None: Path(path).write_bytes(b'wav')
sys.modules['soundfile'] = soundfile

spec = importlib.util.spec_from_file_location('yue_mlx_worker', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

calls = []
class FakeProcess:
    def __init__(self, command, **kwargs):
        calls.append((command, kwargs, json.loads(Path(command[4]).read_text())))
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
music.generate({'jobId': 'one', 'outDir': str(out), 'id': 'song', 'style': 'Korean ballad', 'lyrics': '[Verse]\\n안녕', 'seed': 7, 'cot': 'full', 'targetSeconds': 180, 'advanced': {'temperature': .8, 'topP': .9, 'topK': 80, 'repetitionPenalty': 1.1, 'maxTokens': 9000, 'minTokens': 0, 'odeSteps': 32}})
command, kwargs, request = calls[-1]
assert command[:4] == [sys.executable, '-m', 'lyra.cli', 'generate']
assert command[command.index('--model') + 1] == str(root / 'models')
assert command[command.index('--vae') + 1] == str(root / 'vae')
assert '--offline' in command and '--require-ac' in command and '--resume' not in command
assert request['cot'] == 'full' and request['seed'] == 7
assert request['semantic_sampling'] == {'temperature': .8, 'top_p': .9, 'top_k': 80, 'repetition_penalty': 1.1, 'max_tokens': 9000, 'min_tokens': 0}
assert request['generation_config'] == {'ode_steps': 32}
assert not (out / 'request.roadmusic.json').exists()
assert (out / 'audio.flac').read_bytes() == b'flac'
assert (out / 'audio.wav').read_bytes() == b'wav'
meta = json.loads((out / 'meta.json').read_text())
assert meta['engineId'] == 'yue-mlx' and meta['requestedTargetSeconds'] == 180
assert meta['seconds'] == 181.25 and meta['truncated']['semantic'] is True
done = events[-1]
assert len([e for e in events if e.get('type') == 'stage' and e.get('stage') == 'semantic']) == 1
assert done['type'] == 'done' and done['audio'] == str(out / 'audio.wav')

# A completed upstream artifact is only resumed after its request is proven identical.
music.generate({'jobId': 'two', 'outDir': str(out), 'id': 'song', 'style': 'Korean ballad', 'lyrics': '[Verse]\\n안녕', 'seed': 7, 'cot': 'full', 'targetSeconds': 180, 'advanced': {'temperature': .8, 'topP': .9, 'topK': 80, 'repetitionPenalty': 1.1, 'maxTokens': 9000, 'minTokens': 0, 'odeSteps': 32}})
assert '--resume' in calls[-1][0]

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

for bad in ({'cot': 'off', 'abc': 'X:1'}, {'seed': -1}, {'advanced': {'maxTokens': 9001}}):
    attempt = module.Worker()
    try:
        attempt.generate({'jobId': 'bad', 'outDir': str(Path(tempfile.mkdtemp())), 'id': 'song', 'style': 'x', 'lyrics': 'y', **bad})
    except RuntimeError:
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
