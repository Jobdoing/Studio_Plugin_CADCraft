"""Assemble the static Studio plugin from the wrapper and prepared upstream assets."""
from pathlib import Path
import json
import shutil

plugin = Path(__file__).resolve().parents[1]
cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
target = cache / 'package/cad-viewer'
if target.exists():
    version = json.loads((target / 'plugin.json').read_text())['version']
    old = cache / f'obsolete/cad-viewer-{version}'
    assert not old.exists(), 'Archive destination already exists'
    target.rename(old)
target.mkdir(parents=True)
for name in ('plugin.json', 'index.html', 'app.js', 'style.css', 'README.md'):
    shutil.copy2(plugin / name, target / name)
shutil.copytree(cache / 'web-host/cadcraft', target / 'cadcraft')
assert json.loads((target / 'plugin.json').read_text())['version'] == '0.5.3'
assert '<script type="module" src="./bootstrap.js"></script>' in (target / 'cadcraft/index.html').read_text()
assert list((target / 'cadcraft').glob('*.wasm'))
print(f'Packaged CADCraft Studio plugin: {target}')
