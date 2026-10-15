#[test]
fn bundled_web_font_covers_traditional_chinese_display_text() {
    let path = std::env::var("CADCRAFT_UI_FONT").expect("Set CADCRAFT_UI_FONT to the pinned Web font");
    let bytes = std::fs::read(path).expect("Read the same font used by the Web build");
    let ctx = egui::Context::default();
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert("studio-cjk".into(), std::sync::Arc::new(egui::FontData::from_owned(bytes)));
    for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
        fonts.families.get_mut(&family).unwrap().push("studio-cjk".into());
    }
    ctx.set_fonts(fonts);
    let mut output = ctx.run_ui(Default::default(), |_| {});
    output.textures_delta.clear();
    let letters: BTreeSet<_> = include_str!("zh-Hant.tsv").lines()
        .filter(|line| !line.starts_with('#'))
        .filter_map(|line| line.split('\t').nth(2))
        .flat_map(str::chars)
        // NOTE(ceiling): the upstream untranslated WCS arrow is an existing icon gap; this check covers translated text.
        .filter(|c| !c.is_ascii() && !c.is_whitespace() && *c != '⌄')
        .collect();
    ctx.fonts_mut(|view| {
        for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
            let mut font = view.fonts.font(&family);
            for c in &letters {
                assert!(font.characters().contains_key(c), "missing {c} in {family:?}");
            }
        }
    });
}

#[test]
fn menu_text_has_clearance_inside_its_panel() {
    let path = std::env::var("CADCRAFT_UI_FONT").expect("Set CADCRAFT_UI_FONT to the pinned Web font");
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert("studio-cjk".into(), std::sync::Arc::new(egui::FontData::from_owned(std::fs::read(path).unwrap())));
    fonts.families.get_mut(&egui::FontFamily::Proportional).unwrap().push("studio-cjk".into());
    let ctx = egui::Context::default();
    ctx.set_fonts(fonts);
    crate::theme::apply(&ctx, egui::Theme::Dark, false);
    let mut app = CadApp::new(Session::new(), Services::default());
    let mut output = ctx.run_ui(Default::default(), |ui| {
        with_language("zh-Hant", || crate::menus::menu_bar(&mut app, ui));
    });
    output.textures_delta.clear();
    let panel = output.shapes.iter().find_map(|shape| match &shape.shape {
        egui::epaint::Shape::Rect(rect) if rect.fill == crate::theme::Tokens::get().chrome_dark => Some(rect.rect),
        _ => None,
    }).expect("The actual menu panel must be painted");
    let mut count = 0;
    for shape in &output.shapes {
        if let egui::epaint::Shape::Text(text) = &shape.shape {
            let bounds = text.galley.mesh_bounds.translate(text.pos.to_vec2());
            assert!(bounds.min.y >= panel.min.y + 2.0 && bounds.max.y <= panel.max.y - 2.0,
                "Menu glyphs {:?} must stay inside panel {:?} with clearance", bounds, panel);
            count += 1;
        }
    }
    assert!(count >= 10, "The check must include actual menu labels");
}
