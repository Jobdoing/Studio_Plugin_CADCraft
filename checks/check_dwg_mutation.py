"""Verify that returning DXF instead of DWG fails the real native round-trip check."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

plugin = Path(__file__).resolve().parents[1]
dotnet = plugin.parents[1] / 'dotnet'
cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
cli = cache / 'vendor/cadcraft-cli-0.6.2-macos-universal/cadcraft-cli'
assert cli.is_file(), 'The verified native CLI is required; do not skip this check'
with tempfile.TemporaryDirectory(dir=cache) as directory:
    root = Path(directory)
    for relative in ('src/CadViewer.Api', 'src/SheetVersions.Api/Auth', 'tests/CadViewer.Tests'):
        shutil.copytree(dotnet / relative, root / relative, ignore=shutil.ignore_patterns('bin', 'obj'))
    shared = root / 'tests/SheetVersions.Tests'
    shared.mkdir()
    for name in ('TestStudio.cs', 'TestPaths.cs'):
        shutil.copy(dotnet / 'tests/SheetVersions.Tests' / name, shared / name)
    env = {**os.environ, 'CADCRAFT_TEST_CLI': str(cli), 'TMPDIR': str(cache / 'tmp')}
    source = root / 'src/CadViewer.Api/CadFiles.cs'
    original = source.read_text()
    old = 'writeDwg ? "working-copy.dwg" : "working-copy.dxf"'
    assert original.count(old) == 1
    for name, text in (('baseline', original), ('dxfinstead', original.replace(old, '"working-copy.dxf"'))):
        source.write_text(text)
        result = subprocess.run(['dotnet', 'test', str(root / 'tests/CadViewer.Tests/CadViewer.Tests.csproj')],
                                env=env, capture_output=True, text=True, timeout=120)
        output = result.stdout + result.stderr
        for log in (root / 'tests/CadViewer.Tests/bin/Debug/net10.0/TestResults').glob('*.log'):
            raw = log.read_bytes()
            output += '\n' + raw.decode('utf-16' if raw.startswith(b'\xff\xfe') else 'utf-8')
        (cache / f'logs/library-backend-mutation-{name}.log').write_text(output)
        if name == 'baseline':
            assert result.returncode == 0, 'Backend baseline failed'
        else:
            assert result.returncode != 0 and 'Assert.StartsWith() Failure' in output, 'DWG format mutation was not detected by the real output check'
print('PASS: native baseline and DXF-instead-of-DWG mutation rejected')
