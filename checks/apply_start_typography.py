"""Align mixed-language UI text using the existing bundled font."""
from pathlib import Path

plugin = Path(__file__).resolve().parents[1]
source = Path('/Volumes/Vibe-Temp/cadcraft-integration/source-0.6.2/crates/ui-egui/src')
theme = source / 'theme.rs'
text = theme.read_text()
assert 'fn studio_web_fonts' not in text, 'Start typography already applied'
start = text.index('        let _ = cjk;', text.index('#[cfg(target_arch = "wasm32")]', text.index('pub fn install_fonts')))
end = text.index('        ctx.set_fonts(fonts);', start) + len('        ctx.set_fonts(fonts);')
text = text[:start] + '        ctx.set_fonts(studio_web_fonts(egui::FontData::from_static(include_bytes!(env!("CADCRAFT_UI_FONT"))), cjk));' + text[end:]
text += '''
#[cfg(any(target_arch = "wasm32", test))]
pub(crate) fn studio_web_fonts(data: egui::FontData, cjk: bool) -> egui::FontDefinitions {
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert("studio-cjk".into(), std::sync::Arc::new(data));
    for family in [FontFamily::Proportional, FontFamily::Monospace] {
        let names = fonts.families.get_mut(&family).unwrap();
        if cjk && family == FontFamily::Proportional {
            names.insert(0, "studio-cjk".into());
        } else {
            names.push("studio-cjk".into());
        }
    }
    fonts
}
'''
theme.write_text(text)
chrome = source / 'chrome.rs'
text = chrome.read_text()
old = 'crate::i18n::t(label), crate::theme::body(), t.text);'
assert text.count(old) == 1
old_line = 'p.text(pos2(br.left() + 16.0, br.center().y), egui::Align2::LEFT_CENTER, ' + old
assert text.count(old_line) == 1
chrome.write_text(text.replace(old_line, '''let galley = p.layout_no_wrap(crate::i18n::t(label).to_owned(), egui::FontId::proportional(14.0), t.text);
        let position = pos2(br.left() + 16.0 - galley.mesh_bounds.left(), br.center().y - galley.mesh_bounds.center().y);
        p.galley(position, galley, t.text);'''))
tests = source / 'i18n/tests.rs'
tests.write_text(tests.read_text() + '\n' + (plugin / 'vendor-patches/start-typography-tests.rs').read_text())
print('Applied mixed-language font alignment and 14-point start actions')
