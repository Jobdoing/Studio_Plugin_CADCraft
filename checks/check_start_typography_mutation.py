"""Verify the rendering check rejects the original mixed-font baseline mismatch."""
from pathlib import Path
import os
import subprocess

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
source = cache / 'source-0.6.2'
env = dict(os.environ, CARGO_TARGET_DIR=str(cache / 'rust-test-target'), CADCRAFT_UI_FONT=str(cache / 'fonts/ibm-plex-sans-tc-1.1.1/IBMPlexSansTC-Light.ttf'))
for name, file, old, new in [
    ('fallback', 'theme.rs', 'names.insert(0, "studio-cjk".into());', 'names.push("studio-cjk".into());'),
    ('centering', 'chrome.rs', 'br.center().y - galley.mesh_bounds.center().y', 'br.center().y - galley.size().y / 2.0'),
]:
    path = source / 'crates/ui-egui/src' / file
    original = path.read_text()
    assert original.count(old) == 1
    log_path = cache / f'logs/start-typography-mutation-{name}.log'
    try:
        path.write_text(original.replace(old, new))
        with log_path.open('w') as log:
            result = subprocess.run(['cargo', 'test', '-p', 'cadcraft-ui-egui', '--lib', 'start_actions_use_consistent_mixed_language_metrics'], cwd=source, env=env, stdout=log, stderr=log)
        assert result.returncode != 0 and 'test result: FAILED' in log_path.read_text(), f'Mutation survived or failed to compile: {name}'
    finally:
        path.write_text(original)
    print(f'Detected broken {name}; restored source')
