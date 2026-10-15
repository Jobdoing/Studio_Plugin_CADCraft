"""Confirm the glyph-clearance test rejects the original cramped menu bar."""
from pathlib import Path
import os
import subprocess

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
source = cache / 'source-0.6.2'
path = source / 'crates/ui-egui/src/menus.rs'
original = path.read_text()
old = 'Panel::top("cc_menubar").exact_size(34.0)'
margin = 'inner_margin(egui::Margin::symmetric(6, 6))).show('
assert original.count(old) == 1 and original.count(margin) == 1
env = dict(os.environ, CARGO_TARGET_DIR=str(cache / 'rust-test-target'), CADCRAFT_UI_FONT=str(cache / 'fonts/ibm-plex-sans-tc-1.1.1/IBMPlexSansTC-Light.ttf'))
env['RUSTC'] = subprocess.check_output(['rustup', 'which', 'rustc'], text=True).strip()
log_path = cache / 'logs/menu-spacing-mutation.log'
try:
    path.write_text(original.replace(old, 'Panel::top("cc_menubar").exact_size(22.0)').replace(margin, 'inner_margin(egui::Margin::symmetric(6, 0))).show('))
    with log_path.open('w') as log:
        result = subprocess.run(['cargo', 'test', '-p', 'cadcraft-ui-egui', '--lib', 'menu_text_has_clearance_inside_its_panel'], cwd=source, env=env, stdout=log, stderr=log)
    assert result.returncode != 0 and 'test result: FAILED' in log_path.read_text(), 'Mutation survived or failed to compile'
finally:
    path.write_text(original)
print('Detected the original cramped menu bar; restored source')
