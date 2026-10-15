"""Ensure reader checks detect broken edit guards, panning, and layer isolation."""
from pathlib import Path
import os
import subprocess

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
root = cache / 'source-0.6.2'
env = dict(os.environ, CARGO_TARGET_DIR=str(cache / 'rust-test-target'))
env['RUSTC'] = subprocess.check_output(['rustup', 'which', 'rustc'], text=True).strip()
cases = [
    ('edit-guard', 'lib.rs', 'if self.read_only && id != "open"', 'if false && id != "open"'),
    ('pan', 'canvas.rs', 'middle_down || reader_drag', 'middle_down || false'),
    ('layer-filter', 'canvas.rs', 'app.read_only && !app.reader_hidden.is_empty()', 'false && !app.reader_hidden.is_empty()'),
]
for name, file, old, new in cases:
    path = root / 'crates/ui-egui/src' / file
    original = path.read_text()
    assert original.count(old) == 1
    try:
        path.write_text(original.replace(old, new))
        with (cache / f'logs/reader-mutation-{name}.log').open('w') as log:
            result = subprocess.run(['cargo', 'test', '-p', 'cadcraft-ui-egui', '--lib', 'reader::tests'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
        report = (cache / f'logs/reader-mutation-{name}.log').read_text()
        assert result.returncode != 0 and 'test result: FAILED' in report, f'Mutation was not caught by an assertion: {name}'
        print(f'Rejected reader mutation: {name}')
    finally:
        path.write_text(original)
