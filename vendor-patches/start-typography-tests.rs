#[test]
fn start_actions_use_consistent_mixed_language_metrics() {
    let bytes = std::fs::read(std::env::var("CADCRAFT_UI_FONT").unwrap()).unwrap();
    let ctx = egui::Context::default();
    ctx.set_fonts(crate::theme::studio_web_fonts(egui::FontData::from_owned(bytes), true));
    let mut app = CadApp::new(Session::new(), Services::default());
    let mut output = ctx.run_ui(Default::default(), |ui| {
        with_language("zh-Hant", || crate::chrome::start_page(&mut app, ui));
    });
    output.textures_delta.clear();
    let labels = with_language("zh-Hant", || {
        ["Open...", "New", "New (metric)", "Open sample drawing"].map(|label| t(label).to_owned())
    });
    let mut actions = 0;
    let mut mixed = 0;
    for shape in &output.shapes {
        if let egui::epaint::Shape::Text(text) = &shape.shape {
            if labels.iter().any(|label| label == text.galley.text()) {
                assert_eq!(text.galley.rows.len(), 1);
                assert!(text.galley.job.sections.iter().all(|part| part.format.font_id.size == 14.0));
                let bounds = text.galley.mesh_bounds.translate(text.pos.to_vec2());
                assert!(output.shapes.iter().any(|shape| match &shape.shape {
                    egui::epaint::Shape::Rect(rect) => (rect.rect.width() - 220.0).abs() < 0.1
                        && (bounds.center().y - rect.rect.center().y).abs() < 0.1
                        && bounds.top() >= rect.rect.top() + 4.0 && bounds.bottom() <= rect.rect.bottom() - 4.0,
                    _ => false,
                }), "Action glyphs must be visually centered inside their button");
                actions += 1;
            }
            let glyphs: Vec<_> = text.galley.rows.iter().flat_map(|row| &row.glyphs)
                .filter(|glyph| !glyph.chr.is_whitespace()).collect();
            if glyphs.iter().any(|glyph| !glyph.chr.is_ascii()) && glyphs.iter().any(|glyph| glyph.chr.is_ascii()) {
                let first = glyphs[0];
                for glyph in &glyphs {
                    assert!((glyph.font_face_ascent - first.font_face_ascent).abs() < 0.1,
                        "Mixed-language glyph baselines must use matching font metrics");
                    assert!((glyph.font_face_height - first.font_face_height).abs() < 0.1);
                }
                mixed += 1;
            }
        }
    }
    assert_eq!(actions, 4);
    assert!(mixed >= 2, "Include the version and ellipsis");
}
