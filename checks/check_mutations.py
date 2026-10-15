"""Run focused viewer mutations in a disposable copy, never changing the working tree."""
from pathlib import Path
import shutil
import subprocess
import tempfile

plugin = Path(__file__).resolve().parents[1]
cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
logs = cache / 'logs'
logs.mkdir(parents=True, exist_ok=True)
mutations = [
    ('sender', 'CadApp.ts', 'event.source !== source', 'false'),
    ('retention', 'CadApp.ts', '} catch (failure) {', '} catch (failure) { pending.value = []; syncDirty();'),
    ('warnings', 'CadApp.ts', 'warnings.value = result.warnings;', 'warnings.value = [];'),
    ('open', 'CadApp.ts', 'frame.value?.contentWindow?.postMessage(', 'false && frame.value?.contentWindow?.postMessage('),
    ('spacing', 'CadApp.ts', 'band.height - spacing', 'band.height'),
    ('document-project', 'DocumentPicker.ts', 'project_handle: props.projectHandle', 'project_handle: ""'),
    ('document-version', 'DocumentPicker.ts', '{ version: file.version }', '{ version: 1 }'),
    ('document-stale', 'DocumentPicker.ts', 'if (!alive || generation !== current) return;', 'if (false) return;'),
    ('document-limit', 'DocumentPicker.ts', '> 30 * 1024 * 1024', '> 300 * 1024 * 1024'),
    ('document-empty', 'DocumentPicker.ts', 'busy.value || file.bytes <= 0', 'busy.value'),
    ('document-capability', 'DocumentPicker.ts', 'if (!available)', 'if (false)'),
    ('library-root', 'lib/library.ts', 'item.plugin_id === "sheet-versions"', 'item.name === "Drawing library"'),
    ('library-serial', 'lib/library.ts', 'serial_number: serial }, options)', 'serial_number: "" }, options)'),
    ('library-name', 'lib/library.ts', 'source.filename, { type:', '"renamed.dwg", { type:'),
    ('library-conversion', 'lib/library.ts', 'await exportDwg(bytes, source.project_handle)', '({ bytes, warnings: [] })'),
    ('library-version', 'lib/library.ts', 'current.version !== source.version', 'false'),
    ('library-verify', 'lib/library.ts', 'actual.some((value, index) => value !== output[index])', 'false'),
    ('save-project', 'CadApp.ts', 'packet.source.project_handle !== state.project?.project_handle', 'false'),
]
with tempfile.TemporaryDirectory(dir=cache) as directory:
    root = Path(directory)
    shutil.copytree(plugin / 'src', root / 'src')
    shutil.copytree(plugin / 'test', root / 'test')
    for file in ('package.json', 'vitest.config.ts'):
        shutil.copy(plugin / file, root / file)
    (root / 'node_modules').symlink_to(plugin / 'node_modules', target_is_directory=True)
    for name, file, old, new in [('baseline', 'CadApp.ts', '', ''), *mutations]:
        shutil.copytree(plugin / 'src', root / 'src', dirs_exist_ok=True)
        source = (plugin / 'src' / file).read_text()
        assert not old or old in source
        (root / 'src' / file).write_text(source.replace(old, new, 1) if old else source)
        result = subprocess.run(['npm', 'test'], cwd=root,
                                capture_output=True, text=True, timeout=60)
        output = result.stdout + result.stderr
        (logs / f'mutation-{name}.log').write_text(output)
        if name == 'baseline':
            assert result.returncode == 0, 'Baseline failed; inspect mutation-baseline.log'
        else:
            assert result.returncode != 0 and 'AssertionError' in output, f'Undetected mutation: {name}'
print(f'PASS: baseline and all {len(mutations)} targeted mutations rejected')
