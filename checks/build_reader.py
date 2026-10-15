"""Build the pinned reader fork, preserving the upstream bootstrap and asset names."""
from pathlib import Path
import base64
import hashlib
import os
import shutil
import subprocess
import urllib.request

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
source = cache / 'source-0.6.2'
target = cache / 'reader-web'
vendor = cache / 'vendor/cadcraft-web-0.6.2'
env = dict(os.environ, CARGO_TARGET_DIR=str(cache / 'rust-target'))
env['RUSTC'] = subprocess.check_output(['rustup', 'which', 'rustc'], text=True).strip()
font = cache / 'fonts/ibm-plex-sans-tc-1.1.1/IBMPlexSansTC-Light.ttf'
if not font.exists():
    font.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve('https://raw.githubusercontent.com/IBM/plex/222657a016f31e6d913ede88520de7dec84dc81b/packages/plex-sans-tc/fonts/complete/ttf/hinted/IBMPlexSansTC-Light.ttf', font)
assert hashlib.sha256(font.read_bytes()).hexdigest() == 'a0bc5f2e6414c907aaef973daee92aa753c8db11d50b01772211199aace94a39', 'Pinned CJK font checksum mismatch'
env['CADCRAFT_UI_FONT'] = str(font)
attribution = source / 'ATTRIBUTION.md'
if '## Studio build inputs' not in attribution.read_text():
    attribution.write_text(attribution.read_text() + '\n' + (Path(__file__).resolve().parent.parent / 'vendor-patches/ATTRIBUTION-Studio.md').read_text())
subprocess.run(['cargo', 'build', '-p', 'cadcraft-web', '--target', 'wasm32-unknown-unknown', '--release'], cwd=source, env=env, check=True)
shutil.copytree(vendor, target, dirs_exist_ok=True)
shutil.copy2(Path(__file__).resolve().parent.parent / 'vendor-patches/OFL-IBMPlexSansTC.txt', target / 'OFL-IBMPlexSansTC.txt')
(target / 'STUDIO-ATTRIBUTION.txt').write_text('Traditional Chinese translation: CADCraft PR 529, rg147258, MIT OR Apache-2.0.\nhttps://github.com/storytold/cadcraft/pull/529\nCJK interface font: IBM Plex Sans TC Light 1.1.1, IBM Corp., SIL OFL 1.1.\nhttps://github.com/IBM/plex/tree/222657a016f31e6d913ede88520de7dec84dc81b/packages/plex-sans-tc\nSee OFL-IBMPlexSansTC.txt.\n')
js_file = next(vendor.glob('cadcraft-web-*.js'))
subprocess.run([str(cache / 'tools/bin/wasm-bindgen'), str(cache / 'rust-target/wasm32-unknown-unknown/release/cadcraft-web.wasm'), '--target', 'web', '--out-dir', str(target), '--out-name', js_file.stem], check=True)
digest = lambda p: base64.b64encode(hashlib.sha384(p.read_bytes()).digest()).decode()
index = (vendor / 'index.html').read_text()
assert index.count('sha384-' + digest(js_file)) == 1
(target / 'index.html').write_text(index.replace('sha384-' + digest(js_file), 'sha384-' + digest(target / js_file.name)))
print('Built CADCraft 0.6.2 with Studio reader adaptation')
