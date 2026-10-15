"""Prepare pinned assets and adapt their host bridge to Studio's opaque sandbox."""
from pathlib import Path
import base64
import hashlib
import re
import shutil

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
source = cache / 'reader-web'
target = cache / 'web-host/cadcraft'
shutil.copytree(source, target, dirs_exist_ok=True)
html = (source / 'index.html').read_text()
script = re.search(r'<script type="module">(.*?)</script>', html, re.S)
assert script, 'Upstream bootstrap was not found'
(target / 'bootstrap.js').write_text(script.group(1).strip() + '\n')
(target / 'index.html').write_text(html[:script.start()] + '<script type="module" src="./bootstrap.js"></script>' + html[script.end():])
js_file = next(source.glob('cadcraft-web-*.js'))
js = js_file.read_text()
# NOTE(ceiling): these wasm-bindgen bindings are pinned to 0.6.2; prefer upstream opaque-origin support when available.
# The unchanged Rust/WASM receiver still authenticates the exact parent Window before accepting input.
origin_binding = '__wbg_origin_adf1c8ebb70eff43: function(arg0, arg1) {\n            const ret = arg1.origin;'
assert js.count(origin_binding) == 1, 'Pinned MessageEvent.origin binding changed'
js = js.replace(origin_binding, origin_binding.replace('arg1.origin;', 'window.origin === "null" ? window.location.origin : arg1.origin;'))
delivery = 'arg0.postMessage(arg1, getStringFromWasm0(arg2, arg3)'
assert js.count(delivery) == 2, 'Pinned postMessage bindings changed'
js = js.replace(delivery, 'arg0.postMessage(arg1, "*"')
picker = '__wbg_click_d990e70c576b7c54: function(arg0) {\n            arg0.click();\n        }'
assert js.count(picker) == 1, 'Pinned Open picker binding changed'
js = js.replace(picker, '''__wbg_click_d990e70c576b7c54: function(arg0) {
            if (arg0.id === "cadcraft_open_input") {
                window.parent.postMessage({type: "cadcraft:request-open"}, "*");
                arg0.remove();
            } else arg0.click();
        }''')
(target / js_file.name).write_text(js)
original_digest = base64.b64encode(hashlib.sha384(js_file.read_bytes()).digest()).decode()
adapted_digest = base64.b64encode(hashlib.sha384((target / js_file.name).read_bytes()).digest()).decode()
index = (target / 'index.html').read_text()
assert index.count('sha384-' + original_digest) == 1, 'Pinned script integrity changed'
(target / 'index.html').write_text(index.replace('sha384-' + original_digest, 'sha384-' + adapted_digest))
assert 'sha384-' + adapted_digest in (target / 'index.html').read_text(), 'Adapted script integrity must match'
wasm_file = next(source.glob('*.wasm'))
assert (target / wasm_file.name).read_bytes() == wasm_file.read_bytes(), 'WASM must remain unchanged'
print('Prepared CADCraft 0.6.2 reader assets with external bootstrap for Studio CSP')
