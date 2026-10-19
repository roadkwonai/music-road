'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const path = require('node:path')

const setup = path.join(__dirname, '..', 'python', 'yue_mlx_setup.py')
const harness = String.raw`
import importlib.util, json, sys, tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp())
(root / 'models').mkdir()
(root / 'models' / 'incomplete').write_text('broken')
source_vae = root / 'hf-cache' / 'source-vae'
source_vae.mkdir(parents=True)
(source_vae / 'config.json').write_text('{}')
(source_vae / 'model.safetensors').write_bytes(b'vae')

spec = importlib.util.spec_from_file_location('setup', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.conversion_valid = lambda *_: False
module.vae_valid = lambda *_: False

class Stream:
    def __init__(self, text=''): self.text = text
    def read(self): return self.text
    def __iter__(self): return iter(())
class Process:
    def __init__(self, command, **_kwargs):
        self.command = command
        if 'prepare' in command:
            output = Path(command[command.index('--output') + 1])
            output.mkdir()
            (output / 'conversion.json').write_text('{}')
            self.stdout = Stream(json.dumps({'model': str(output), 'vae': str(source_vae)}))
        else:
            self.stdout = Stream(json.dumps({'status': 'pass', 'checks': {'model': True, 'vae': True}}))
        self.stderr = Stream()
    def wait(self): return 0
module.subprocess.Popen = Process

assert module.main([str(root)]) == 0
assert list(root.glob('models.invalid-*'))
saved = json.loads((root / 'paths.json').read_text())
assert saved['model'] == str((root / 'models').resolve())
assert saved['vae'] == str((root / 'vae').resolve())
assert saved['source']['runtimeCommit'] == module.RUNTIME_COMMIT
assert (root / 'vae' / 'model.safetensors').read_bytes() == b'vae'
`

test('YuE MLX setup backs up an incomplete converted model before preparing a fresh one', () => {
  const result = spawnSync('python3', ['-c', harness, setup], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
