"""Backport only PR 529 localization to the pinned 0.6.2 reader source."""
from pathlib import Path
import subprocess

cache = Path('/Volumes/Vibe-Temp/cadcraft-integration')
source = cache / 'source-0.6.2'
plugin = Path(__file__).resolve().parent.parent
revision = '6f79ef7782de76d5ac9f3ef9f3a3c02070219aa5'
def upstream(file):
    return subprocess.check_output(['git', 'show', f'{revision}:{file}'], cwd=source, text=True)

directory = source / 'crates/ui-egui/src/i18n'
assert 'TraditionalChinese' not in (directory / 'mod.rs').read_text(), 'Localization already applied'
module = upstream('crates/ui-egui/src/i18n/mod.rs')
module = module.replace('    #[serde(rename = "it")]\n    Italian,\n', '')
module = '\n'.join(line for line in module.splitlines() if 'Self::Italian' not in line and 'code: "it"' not in line and '// Italian integer plurals' not in line) + '\n'
module = module.replace('[Self; 12]', '[Self; 11]').replace('[Language; 11]', '[Language; 10]')
(directory / 'mod.rs').write_text(module)
catalog = upstream('crates/ui-egui/src/i18n/zh-Hant.tsv')
catalog += '\tFit\t全圖\n\tRead only\t唯讀\n\tOpen a DWG or DXF drawing\t開啟 DWG 或 DXF 圖說\n'
assert len([line for line in catalog.splitlines() if '\t' in line]) == len(set(tuple(line.split('\t')[:2]) for line in catalog.splitlines() if '\t' in line))
(directory / 'zh-Hant.tsv').write_text(catalog)
(plugin / 'vendor-patches/zh-Hant.tsv').write_text(catalog)
tests = upstream('crates/ui-egui/src/i18n/tests.rs')
tests = tests[tests.index('#[test]\nfn traditional_chinese_locale_selection'):]
# Keep the 0.6.2 native font API; only the Web build gains a bundled fallback.
tests = tests.replace('cjk_font_for("zh-Hant")', 'cjk_font()').replace('install_fonts(&ctx, "zh-Hant")', 'install_fonts(&ctx, true)')
tests = tests.replace('app.fonts_language, Some(app.language())', 'app.fonts_cjk, Some(app.language().starts_with("zh"))')
path = directory / 'tests.rs'
path.write_text(path.read_text() + '\n' + tests + '\n' + (plugin / 'vendor-patches/font-tests.rs').read_text())
theme = source / 'crates/ui-egui/src/theme.rs'
text = theme.read_text()
old = '#[cfg(target_arch = "wasm32")]\n    let _ = (ctx, cjk);'
assert text.count(old) == 1
text = text.replace(old, '''#[cfg(target_arch = "wasm32")]
    {
        let _ = cjk;
        let mut fonts = egui::FontDefinitions::default();
        fonts.font_data.insert("studio-cjk".into(), std::sync::Arc::new(egui::FontData::from_static(include_bytes!(env!("CADCRAFT_UI_FONT")))));
        for family in [FontFamily::Proportional, FontFamily::Monospace] {
            if let Some(fallbacks) = fonts.families.get_mut(&family) {
                fallbacks.push("studio-cjk".into());
            }
        }
        ctx.set_fonts(fonts);
    }''')
old = '!language.starts_with("zh") || cjk_font().is_some()'
assert text.count(old) == 1
text = text.replace(old, 'cfg!(target_arch = "wasm32") || !language.starts_with("zh") || cjk_font().is_some()')
theme.write_text(text)
reader = source / 'crates/ui-egui/src/reader.rs'
reader.write_text((plugin / 'vendor-patches/reader.rs').read_text())
menus = source / 'crates/ui-egui/src/menus.rs'
text = menus.read_text()
old = 'Panel::top("cc_menubar").exact_size(22.0)'
assert text.count(old) == 1
text = text.replace(old, 'Panel::top("cc_menubar").exact_size(34.0)')
assert text.count('inner_margin(egui::Margin::symmetric(6, 0))).show(') == 1
text = text.replace('inner_margin(egui::Margin::symmetric(6, 0))).show(', 'inner_margin(egui::Margin::symmetric(6, 6))).show(')
menus.write_text(text)
print('Backported pinned PR 529 translation and locale selection; preserved 0.6.2 font API')
