//! Studio's narrow-screen reader. Visibility is a render-only override, never a document edit.
use crate::CadApp;

pub const BREAKPOINT: f32 = 768.0;

pub fn sync(app: &mut CadApp, width: f32) {
    let narrow = width < BREAKPOINT;
    if app.read_only != narrow {
        if narrow {
            app.session.cancel();
            app.cmd.buffer.clear();
        }
        app.read_only = narrow;
        app.reader_layers = false;
        app.reader_hidden.clear();
        app.canvas.list = None;
    }
    let doc = app.session.state().ok().map(|s| s.uid);
    if app.reader_doc != doc {
        app.reader_doc = doc;
        app.reader_hidden.clear();
        app.canvas.list = None;
    }
}

pub fn show(app: &mut CadApp, ui: &mut egui::Ui) {
    egui::Panel::top("reader_toolbar").show(ui, |ui| {
        ui.spacing_mut().interact_size.y = 44.0;
        ui.horizontal(|ui| {
            let open = egui::Button::new(egui::RichText::new(crate::i18n::t("Open")).color(egui::Color32::WHITE))
                .fill(egui::Color32::from_rgb(0x25, 0x63, 0xeb)).min_size(egui::vec2(64.0, 44.0));
            if ui.add(open).clicked() {
                if let Some(pick) = &app.services.pick_open { pick(); }
            }
            if ui.add_enabled(!app.session.docs.is_empty(), egui::Button::new(crate::i18n::t("Fit"))).clicked() {
                app.canvas.zoom_pending = true;
            }
            if ui.add_enabled(!app.session.docs.is_empty(), egui::Button::new(crate::i18n::t("Layers"))).clicked() {
                app.reader_layers = !app.reader_layers;
            }
            ui.label(crate::i18n::t("Read only"));
        });
        if app.session.docs.len() > 1 {
            let mut active = app.session.active;
            egui::ComboBox::from_id_salt("reader_drawing").selected_text(crate::i18n::t("Drawing")).show_ui(ui, |ui| {
                for (index, doc) in app.session.docs.iter().enumerate() {
                    ui.selectable_value(&mut active, index, &doc.title);
                }
            });
            if active != app.session.active {
                app.session.active = active;
                app.canvas.list = None;
            }
        }
        if let Ok(st) = app.session.state() {
            let title = st.title.clone();
            let mut names = vec!["Model".to_string()];
            names.extend(st.doc.layouts.iter().map(|l| l.name.clone()));
            let mut selected = match app.session.layout_space() {
                cadcraft_doc::Space::Model => "Model".to_string(),
                cadcraft_doc::Space::Paper(n) => n,
            };
            let before = selected.clone();
            ui.label(title);
            let label = if selected == "Model" { crate::i18n::t("Model") } else { &selected };
            egui::ComboBox::from_id_salt("reader_layout").selected_text(label).show_ui(ui, |ui| {
                for name in names {
                    let label = if name == "Model" { crate::i18n::t("Model") } else { &name };
                    ui.selectable_value(&mut selected, name.clone(), label);
                }
            });
            if selected != before {
                let _ = app.session.execute("layout.set", &serde_json::json!({"name": selected}));
                app.canvas.list = None;
            }
        }
        if let Some((message, _)) = &app.status { ui.label(message); }
    });
    if app.reader_layers {
        let layers = app.session.doc().map(|d| d.layers.iter().map(|l| (l.name.clone(), l.on && !l.frozen)).collect::<Vec<_>>()).unwrap_or_default();
        egui::Window::new(crate::i18n::t("Layers")).open(&mut app.reader_layers).default_width(260.0).show(ui.ctx(), |ui| {
            ui.spacing_mut().interact_size.y = 44.0;
            egui::ScrollArea::vertical().max_height(300.0).show(ui, |ui| {
                for (name, available) in layers {
                    let mut visible = available && !app.reader_hidden.contains(&name);
                    if ui.add_enabled(available, egui::Checkbox::new(&mut visible, &name)).changed() {
                        if visible { app.reader_hidden.remove(&name); } else { app.reader_hidden.insert(name); }
                        app.canvas.list = None;
                    }
                }
            });
        });
    }
    egui::CentralPanel::default().frame(egui::Frame::NONE).show(ui, |ui| {
        if app.session.docs.is_empty() || app.ui.start_tab {
            ui.centered_and_justified(|ui| { ui.label(crate::i18n::t("Open a DWG or DXF drawing")); });
        } else { crate::canvas::show(app, ui); }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn frame(app: &mut CadApp, ctx: &egui::Context, width: f32, events: Vec<egui::Event>) {
        let raw = egui::RawInput {
            screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(width, 600.0))),
            events, ..Default::default()
        };
        let mut output = ctx.run_ui(raw, |ui| { app.logic(ui.ctx()); app.ui(ui); });
        output.textures_delta.clear();
    }

    #[test]
    fn reader_drag_and_keyboard_cannot_edit_the_drawing() {
        let mut session = cadcraft_engine::Session::new();
        session.new_drawing(false);
        session.execute("line", &serde_json::json!({"points": [[0,0],[10,10]]})).unwrap();
        let mut app = CadApp::new(session, crate::Services::default());
        app.ui.start_tab = false;
        let ctx = egui::Context::default();
        frame(&mut app, &ctx, 375.0, vec![]);
        let doc = app.session.state().unwrap().doc.clone();
        let view = app.session.state().unwrap().view();
        let pos = egui::pos2(180.0, 350.0);
        frame(&mut app, &ctx, 375.0, vec![egui::Event::PointerMoved(pos), egui::Event::PointerButton {
            pos, button: egui::PointerButton::Primary, pressed: true, modifiers: Default::default()
        }]);
        frame(&mut app, &ctx, 375.0, vec![egui::Event::PointerMoved(pos + egui::vec2(40.0, 20.0))]);
        assert_ne!(app.session.state().unwrap().view(), view, "one-finger drag must pan");
        frame(&mut app, &ctx, 375.0, vec![egui::Event::Text("LINE".into()), egui::Event::Key {
            key: egui::Key::Enter, physical_key: None, pressed: true, repeat: false, modifiers: Default::default()
        }]);
        assert!(app.session.running.is_none());
        assert_eq!(*app.session.state().unwrap().doc, *doc);
        frame(&mut app, &ctx, 375.0, vec![egui::Event::Zoom(1.5)]);
        assert!(app.session.state().unwrap().view().height < view.height, "pinch must zoom");
        app.reader_hidden.insert("0".into());
        app.canvas.list = None;
        frame(&mut app, &ctx, 375.0, vec![]);
        assert!(app.canvas.list.as_ref().unwrap().prims.is_empty(), "layer toggle must hide geometry");
        assert_eq!(*app.session.state().unwrap().doc, *doc, "visibility must not modify layer data");
        let view = app.session.state().unwrap().view();
        frame(&mut app, &ctx, 1024.0, vec![]);
        assert!(!app.read_only);
        assert_eq!(app.session.state().unwrap().view(), view);
        assert_eq!(*app.session.state().unwrap().doc, *doc);
        assert!(!app.canvas.list.as_ref().unwrap().prims.is_empty(), "desktop must restore original visibility");
    }

    #[test]
    fn switching_preserves_document_and_view_and_blocks_commands() {
        let mut session = cadcraft_engine::Session::default();
        session.new_drawing(false);
        session.execute("line", &serde_json::json!({"points": [[0,0],[10,10]]})).unwrap();
        let mut app = CadApp::new(session, crate::Services::default());
        let doc = app.session.state().unwrap().doc.clone();
        let view = app.session.state().unwrap().view();
        let dirty = app.session.state().unwrap().is_dirty();
        sync(&mut app, 375.0);
        assert!(app.read_only);
        assert!(app.run("erase", serde_json::json!({"all": true})).is_err());
        app.cmdline("LINE 0,0 50,50");
        app.start("line");
        assert!(app.session.running.is_none());
        assert_eq!(*app.session.state().unwrap().doc, *doc);
        assert_eq!(app.session.state().unwrap().is_dirty(), dirty);
        sync(&mut app, 1024.0);
        assert!(!app.read_only);
        assert_eq!(*app.session.state().unwrap().doc, *doc);
        assert_eq!(app.session.state().unwrap().view(), view);
    }
}
