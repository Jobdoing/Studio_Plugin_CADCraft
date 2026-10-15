"""Confirm the locale regression check detects broken Traditional Chinese selection."""
from pathlib import Path
import os
import subprocess

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
source = cache / 'source-0.6.2'
path = source / 'crates/ui-egui/src/i18n/mod.rs'
original = path.read_text()
env = dict(os.environ, CARGO_TARGET_DIR=str(cache / 'rust-test-target'), CADCRAFT_UI_FONT=str(cache / 'fonts/ibm-plex-sans-tc-1.1.1/IBMPlexSansTC-Light.ttf'))
env['RUSTC'] = subprocess.check_output(['rustup', 'which', 'rustc'], text=True).strip()
try:
    for name, old, new in [
        ('region', 'traditional_region = true;', 'traditional_region = false;'),
        ('script', 'Some(s) if s.eq_ignore_ascii_case("Hant") => Some("zh-Hant")', 'Some(s) if s.eq_ignore_ascii_case("Hant") => Some("zh")'),
    ]:
        assert original.count(old) == 1
        path.write_text(original.replace(old, new))
        with (cache / f'logs/localization-mutation-{name}.log').open('w') as log:
            result = subprocess.run(['cargo', 'test', '-p', 'cadcraft-ui-egui', '--lib', 'traditional_chinese_locale_selection_respects_script_and_region'], cwd=source, env=env, stdout=log, stderr=log)
        report = (cache / f'logs/localization-mutation-{name}.log').read_text()
        assert result.returncode != 0 and 'test result: FAILED' in report, f'Mutation survived or failed to compile: {name}'
        print(f'Detected broken {name} selection')
finally:
    path.write_text(original)
