'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

const stages = path.join(__dirname, '..', 'python', 'yue_stages.py')

const harness = String.raw`
import contextlib, importlib.util, json, sys, tempfile, types
from dataclasses import dataclass
from pathlib import Path

spec = importlib.util.spec_from_file_location('yue_stages', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Config:
    def __init__(self, value=None):
        self.value = {'abc': {}, 'semantic': {}, 'ode_steps': 32}
        self.value.update(value or {})
    @classmethod
    def from_dict(cls, value): return cls(value)
    def to_dict(self): return json.loads(json.dumps(self.value))

@dataclass
class Request:
    style: str = 'ballad'
    lyrics: str = '가사'
    cot: str = 'full'
    seed: int = 7
    cfg_scale: float | None = None
    id: str = 'song'
    abc: str | None = None
    @property
    def guidance(self): return 1.0 if self.cfg_scale is None else self.cfg_scale
    def to_dict(self): return {'id': self.id, 'style': self.style, 'lyrics': self.lyrics, 'seed': self.seed, 'cot': self.cot, 'cfg_scale': self.cfg_scale, 'abc': self.abc}

class Plan:
    request = Request()
    timing = {'abc_seconds': 1}
    truncated = False

class Semantic:
    def __init__(self, plan):
        self.plan, self.tokens, self.timing, self.truncated = plan, [1, 2], {'semantic_seconds': 2}, False

class Result:
    def __init__(self, audio, rate, semantic, latents, config, weights, timing, stamp, noise):
        self.audio, self.sample_rate, self.semantic, self.latents = audio, rate, semantic, latents
        self.config, self.weights, self.timing, self.noise = config, weights, timing, noise
        self.truncated = {'abc': semantic.plan.truncated, 'semantic': semantic.truncated}
    def save_artifacts(self, output):
        output.mkdir(parents=True, exist_ok=False)
        (output / 'result.json').write_text(json.dumps({'saved': True, 'config': self.config}))

calls = []
class Pipe:
    weights = {'mot': {'id': 'mot'}, 'vae': {'id': 'vae'}}
    load_timing = {'load': 0}
    def __init__(self, generation):
        self.generation, self.precision = generation, '8bit'
        self._ar_lora_adapter = self._nar_lora_adapter = None
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def load_lora(self, path, scale):
        self._nar_lora_adapter = object()
        calls.append(('lora', str(path), scale))
    def plan(self, **_): return Plan()
    def generate_semantic(self, plan, sampling=None):
        calls.append(('semantic', sampling, plan.request.cfg_scale)); return Semantic(plan)
    def synthesize(self, semantic, noise=None):
        calls.append(('synthesize', noise)); return ['latent']
    def decode(self, latents): calls.append(('decode', latents)); return ['audio']
    def effective_config(self, request, abc_sampling=None, semantic_sampling=None):
        value = self.generation.to_dict()
        if semantic_sampling: value['semantic'].update(semantic_sampling)
        return {'generation': value}
    def __call__(self, **kwargs):
        plan = Plan(); semantic = Semantic(plan)
        return Result(['audio'], 48000, semantic, ['latent'], self.effective_config(plan.request), self.weights, {'abc': plan.timing, 'semantic': semantic.timing}, 'x', ['noise'])

pipeline = types.ModuleType('lyra.pipeline')
pipeline.YuE2Pipeline = type('Factory', (), {'from_pretrained': staticmethod(lambda *args, **kwargs: (calls.append(('pipe', args, kwargs)) or Pipe(kwargs['generation_config'])) )})
pipeline.SongResult = Result
pipeline.initial_noise = lambda *_: ['noise']
sys.modules['lyra.pipeline'] = pipeline
artifacts = types.ModuleType('lyra.artifacts')
artifacts.load_plan_artifacts = lambda path: (Plan(), Config({'semantic': {'temperature': .1}, 'ode_steps': 32}) if Path(path).name == 'full-source' else Config({'semantic': {'top_p': .91}}))
artifacts.save_plan_artifacts = lambda plan, output, config: (output.mkdir(), (output / 'plan_manifest.json').write_text('{}'))
class Saved:
    semantic = Semantic(Plan())
    latents, noise = ['source-latent'], ['source-noise']
    config = {'generation': Config({'ode_steps': 32}).to_dict(), 'rng': {'acoustic': 'numpy_pcg64_fp32_full_song_v1'}, 'cfg_scale': 1.0, 'ar_precision': '8bit', 'query_chunk_size': 256, 'runtime_overrides': {'execution': {'precision': '8bit', 'memory_budget_gib': 16, 'vae_core_frames': 256, 'query_chunk_size': 256, 'require_ac': False}}}
    result = {'identity': 'source', 'artifacts': {'latent.npy': 'hash'}, 'timing': {'abc': Plan.timing}, 'truncated': {'abc': False, 'semantic': False}, 'audio_seconds': 12.5, 'weights': {'vae': {'config_sha256': 'not-used'}}}
class FullSaved(Saved):
    config = {**Saved.config, 'generation': Config({'semantic': {'temperature': .85}, 'ode_steps': 16}).to_dict()}
artifacts.load_artifacts = lambda path: FullSaved() if Path(path).name == 'full-source' else Saved()
sys.modules['lyra.artifacts'] = artifacts
protocol = types.ModuleType('yue2.protocol'); protocol.GenerationConfig = Config; protocol.SongRequest = Request
sys.modules['yue2.protocol'] = protocol
storage = types.ModuleType('yue2.storage'); storage.identity = lambda value: 'identity'
sys.modules['yue2.storage'] = storage

module._resource_monitor = lambda *_: contextlib.nullcontext()
def controls(value):
    result = {}
    if value and 'temperature' in value: result['semantic_sampling'] = {'temperature': value['temperature']}
    if value and 'odeSteps' in value: result['generation_config'] = {'ode_steps': value['odeSteps']}
    if value and 'cfgScale' in value: result['cfg_scale'] = value['cfgScale']
    return value or {}, result
module._controls = controls
module._effective_generation = lambda generation, _abc, _semantic: (Config(generation), Config(generation).to_dict())

root = Path(tempfile.mkdtemp())
model, vae, source, output = (root / name for name in ('model', 'vae', 'source', 'output'))
model.mkdir(); vae.mkdir(); source.mkdir()
(source / 'plan_manifest.json').write_text('{}')
full_source = root / 'full-source'; full_source.mkdir()
(full_source / 'plan_manifest.json').write_text('{}')
(full_source / 'result.json').write_text('{}')
args = types.SimpleNamespace(output=str(output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False)
score_output = root / 'plan-score'
module._run(types.SimpleNamespace(output=str(score_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'plan-score', 'request': Request().to_dict()})
score_stage = json.loads((score_output / 'stage.json').read_text())
assert score_stage['schema'] == 'road-music-yue-plan-stage-v1'
assert score_stage['plan_manifest_sha256'] == __import__('hashlib').sha256((score_output / 'plan_manifest.json').read_bytes()).hexdigest()
full_output = root / 'full-output'
module._run(types.SimpleNamespace(output=str(full_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'plan', 'source': str(full_source)})
full_pipe = next(item for item in reversed(calls) if item[0] == 'pipe')
assert full_pipe[2]['generation_config'].to_dict()['semantic']['temperature'] == .85
assert full_pipe[2]['generation_config'].to_dict()['ode_steps'] == 16
full_replay = json.loads((full_output / 'result.json').read_text())['config']['replay']
assert full_replay['source_effective_generation_status'] == 'song_artifact_config_verified'
full_override_output = root / 'full-override-output'
module._run(types.SimpleNamespace(output=str(full_override_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'plan', 'source': str(full_source), 'advanced': {'temperature': .7}})
full_override_pipe = next(item for item in reversed(calls) if item[0] == 'pipe')
assert full_override_pipe[2]['generation_config'].to_dict()['semantic']['temperature'] == .85
assert full_override_pipe[2]['generation_config'].to_dict()['ode_steps'] == 16
assert next(item for item in reversed(calls) if item[0] == 'semantic')[1] == {'temperature': .7}
value = module._run(args, {'stage': 'plan', 'source': str(source), 'advanced': {'temperature': .7, 'odeSteps': 48, 'cfgScale': 1.4}, 'runtime': {'queryChunkSize': 128}})
assert value['stage'] == 'plan' and (output / 'result.json').is_file()
assert ('semantic', {'temperature': .7}, 1.4) in calls
pipe = next(item for item in reversed(calls) if item[0] == 'pipe')
assert pipe[2]['local_files_only'] is True and pipe[2]['query_chunk_size'] == 128
assert pipe[2]['generation_config'].to_dict()['ode_steps'] == 48
assert (source / 'plan_manifest.json').read_text() == '{}'
saved_plan = json.loads((output / 'result.json').read_text())['config']['replay']['source']['stage_record']
assert saved_plan['status'] == 'not_recorded'
(source / 'stage.json').write_text(json.dumps({'schema': 'road-music-yue-plan-stage-v1', 'stage': 'plan-score', 'plan_manifest_sha256': __import__('hashlib').sha256((source / 'plan_manifest.json').read_bytes()).hexdigest(), 'effective_config': {'generation': {}}, 'advanced': {}}))
recorded_output = root / 'recorded-output'
module._run(types.SimpleNamespace(output=str(recorded_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'plan', 'source': str(source)})
recorded = json.loads((recorded_output / 'result.json').read_text())['config']['replay']['source']['stage_record']
assert recorded['status'] == 'manifest_bound_unsealed' and recorded['sha256']
instrumental = module._instrumental_request({'style': 'warm piano', 'lyrics': None, 'instrumental': True})
assert instrumental == {'style': 'Instrumental, warm piano, no vocals, no singing.', 'lyrics': ''}

# Upstream load_lora swallows parser errors, so every stage checks actual adapters.
lora = root / 'adapter.safetensors'; lora.write_bytes(b'fixed-adapter')
class AdapterPipe:
    def __init__(self, precision, ar=None, nar=None): self.precision, self._ar_lora_adapter, self._nar_lora_adapter = precision, ar, nar
    def load_lora(self, *_args, **_kwargs): pass
for pipe, stage in ((AdapterPipe('8bit'), 'generate'), (AdapterPipe('8bit', ar=object()), 'plan-score')):
    try:
        module._attach_lora(pipe, {'lora_path': lora}, stage)
    except ValueError as error:
        assert 'no applicable adapter' in str(error)
    else:
        raise AssertionError('stage accepted an ineffective LoRA')
runtime = {'lora_path': lora, 'lora_scale': .5}
module._attach_lora(AdapterPipe('8bit', nar=object()), runtime, 'synthesize')
assert runtime['lora_identity']['targets'] == ['nar']
runtime = {'lora_path': lora}
module._attach_lora(AdapterPipe('bf16', ar=object()), runtime, 'plan-score')
assert runtime['lora_identity']['targets'] == ['ar']
class MutatingAdapter(AdapterPipe):
    def load_lora(self, path, **_kwargs): Path(path).write_bytes(b'changed')
try:
    module._attach_lora(MutatingAdapter('8bit', nar=object()), {'lora_path': lora}, 'synthesize')
except RuntimeError as error:
    assert 'changed while loading' in str(error)
else:
    raise AssertionError('stage accepted a modified LoRA')
lora.write_bytes(b'fixed-adapter')
Saved.config['runtime_overrides']['lora'] = {'sha256': __import__('hashlib').sha256(lora.read_bytes()).hexdigest(), 'scale': 1.0, 'targets': ['nar']}
inherited_runtime = {'precision': '8bit', 'memoryBudgetGiB': 16, 'vaeCoreFrames': 256, 'requireAc': False, 'queryChunkSize': 128, 'loraPath': str(lora), 'loraScale': 1.0}
inherited_output = root / 'inherited-output'
module._run(types.SimpleNamespace(output=str(inherited_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'runtime': inherited_runtime, 'runtimeExplicit': {}})
assert (inherited_output / 'result.json').is_file()
assert any(item[0] == 'lora' and item[1] == str(lora) for item in calls)
decode_inherited = root / 'decode-inherited'
module._run(types.SimpleNamespace(output=str(decode_inherited), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'decode', 'source': str(source), 'runtime': inherited_runtime, 'runtimeExplicit': {}})
assert (decode_inherited / 'result.json').is_file()
decode_config = json.loads((decode_inherited / 'result.json').read_text())['config']['runtime_overrides']
assert decode_config['execution']['query_chunk_size'] == 256 and 'lora' not in decode_config
lora_mismatch = root / 'different-adapter.safetensors'; lora_mismatch.write_bytes(b'different-adapter')
try:
    module._run(types.SimpleNamespace(output=str(root / 'lora-mismatch'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'runtime': {**inherited_runtime, 'loraPath': str(lora_mismatch)}, 'runtimeExplicit': {}})
except ValueError as error:
    assert 'Inherited LoRA' in str(error)
else:
    raise AssertionError('synthesize accepted a mismatched inherited LoRA')
try:
    module._run(types.SimpleNamespace(output=str(root / 'decode-explicit'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'decode', 'source': str(source), 'runtime': inherited_runtime, 'runtimeExplicit': {'queryChunkSize': 128}})
except ValueError as error:
    assert 'decode cannot apply' in str(error)
else:
    raise AssertionError('decode accepted an explicit query override')
try:
    module._run(types.SimpleNamespace(output=str(root / 'runtime-mismatch'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'runtime': inherited_runtime, 'runtimeExplicit': {'queryChunkSize': 256}})
except ValueError as error:
    assert 'does not match' in str(error)
else:
    raise AssertionError('runtimeExplicit mismatch was accepted')
Saved.config['runtime_overrides']['lora'] = {'sha256': __import__('hashlib').sha256(lora.read_bytes()).hexdigest(), 'scale': 1.0, 'targets': ['ar']}
ar_only_output = root / 'ar-only-output'
lora_calls = len([item for item in calls if item[0] == 'lora'])
module._run(types.SimpleNamespace(output=str(ar_only_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'runtime': inherited_runtime, 'runtimeExplicit': {}})
ar_only_config = json.loads((ar_only_output / 'result.json').read_text())['config']
assert len([item for item in calls if item[0] == 'lora']) == lora_calls
assert 'lora' not in ar_only_config['runtime_overrides']
assert ar_only_config['replay']['source_runtime_overrides']['lora']['targets'] == ['ar']
Saved.config['runtime_overrides'].pop('lora')

# Sampling controls are invalid for acoustic-only replay and the source cannot be a symlink.
try:
    module._run(types.SimpleNamespace(output=str(root / 'bad'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'advanced': {'temperature': .7}})
except ValueError as error:
    assert 'cannot change' in str(error)
else:
    raise AssertionError('synthesize accepted a semantic override')

try:
    module._run(types.SimpleNamespace(output=str(root / 'bad-runtime'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'runtime': {'precision': '8bit'}})
except ValueError as error:
    assert 'synthesize cannot apply' in str(error)
else:
    raise AssertionError('synthesize accepted an AR-only precision override')

synth_output = root / 'synth-output'
module._run(types.SimpleNamespace(output=str(synth_output), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'synthesize', 'source': str(source), 'runtime': {'queryChunkSize': 128}})
assert (synth_output / 'result.json').is_file()

# Verify never loads a pipeline or changes the complete source directory.
before = (source / 'plan_manifest.json').read_bytes()
verified = module._run(types.SimpleNamespace(output=str(source), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'verify', 'source': str(source), 'request': Request().to_dict()})
assert verified['identity'] == 'source' and verified['audioSeconds'] == 12.5
assert (source / 'plan_manifest.json').read_bytes() == before
try:
    module._run(types.SimpleNamespace(output=str(source), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'verify', 'source': str(source), 'request': {**Request().to_dict(), 'seed': 8}})
except ValueError as error:
    assert 'request does not match' in str(error)
else:
    raise AssertionError('verify accepted a mismatched request')

link = root / 'source-link'; link.symlink_to(source, target_is_directory=True)
try:
    module._run(types.SimpleNamespace(output=str(root / 'link-output'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'decode', 'source': str(link)})
except ValueError as error:
    assert 'non-symlink' in str(error)
else:
    raise AssertionError('symlink source was accepted')

output_link = root / 'output-link'; output_link.symlink_to(source, target_is_directory=True)
try:
    module._run(types.SimpleNamespace(output=str(output_link), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'decode', 'source': str(source)})
except ValueError as error:
    assert 'output must not be a symlink' in str(error)
else:
    raise AssertionError('symlink output was accepted')

(source / 'stage.json').write_text('{}')
try:
    module._run(types.SimpleNamespace(output=str(root / 'bad-stage'), model=model, vae=vae, precision='8bit', memory_budget_gib=16, vae_core_frames=256, require_ac=False), {'stage': 'plan', 'source': str(source)})
except ValueError as error:
    assert 'stage record' in str(error)
else:
    raise AssertionError('plan accepted an unbound stage record')
`

test('YuE stage adapter preserves source artifacts and only allows phase-safe controls', () => {
  const result = spawnSync('python3', ['-c', harness, stages], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('YuE stage adapter validates its standalone command contract', () => {
  const result = spawnSync('python3', [stages, '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--query-chunk-size/)
})
