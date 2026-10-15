"""Apply the small, pinned reader adaptation to CADCraft 0.6.2 source."""
from pathlib import Path
import shutil

root = Path('/Volumes/Vibe-Temp/cadcraft-integration/source-0.6.2')
plugin = Path(__file__).resolve().parent.parent
shutil.copyfile(plugin / 'vendor-patches/reader.rs', root / 'crates/ui-egui/src/reader.rs')

def edit(file, replacements):
    path = root / file
    text = path.read_text()
    for old, new in replacements:
        assert text.count(old) == 1, f'Pinned source changed: {file}: {old[:60]}'
        text = text.replace(old, new)
    path.write_text(text)

edit('crates/ui-egui/src/lib.rs', [
    ('pub mod canvas;', 'pub mod canvas;\npub mod reader;'),
    ('    pub canvas: canvas::CanvasState,', '    pub canvas: canvas::CanvasState,\n    pub read_only: bool,\n    pub reader_hidden: std::collections::HashSet<String>,\n    pub reader_doc: Option<u64>,\n    pub reader_layers: bool,'),
    ('            canvas: canvas::CanvasState::default(),', '            canvas: canvas::CanvasState::default(),\n            read_only: false,\n            reader_hidden: Default::default(),\n            reader_doc: None,\n            reader_layers: false,'),
    ('    pub fn run(&mut self, id: &str, params: Value) -> Result<Value, String> {', '    pub fn run(&mut self, id: &str, params: Value) -> Result<Value, String> {\n        if self.read_only && id != "open" { return Err("Reader mode is read only".into()); }'),
    ('    pub fn start(&mut self, name: &str) {', '    pub fn start(&mut self, name: &str) {\n        if self.read_only { return; }'),
    ('    pub fn cmdline(&mut self, text: &str) -> Option<String> {', '    pub fn cmdline(&mut self, text: &str) -> Option<String> {\n        if self.read_only { return Some("Reader mode is read only".into()); }'),
    ('    pub fn logic(&mut self, ctx: &egui::Context) {', '    pub fn logic(&mut self, ctx: &egui::Context) {\n        reader::sync(self, ctx.input(|i| i.content_rect().width()));'),
    ('        menus::shortcuts(self, ctx);', '        if !self.read_only { menus::shortcuts(self, ctx); }'),
    ('    fn draw(&mut self, ui: &mut egui::Ui) {', '    fn draw(&mut self, ui: &mut egui::Ui) {\n        if self.read_only { reader::show(self, ui); return; }'),
])
edit('crates/ui-egui/src/canvas.rs', [
    ('    app.canvas.list = Some(cadcraft_render::build(&st.doc, &space, &opts));', '''    app.canvas.list = Some(if app.read_only && !app.reader_hidden.is_empty() {
        // NOTE(ceiling): clone on display-list rebuilds while layers are hidden; use upstream renderer filters when available.
        let mut drawing = (*st.doc).clone();
        for layer in &mut drawing.layers { if app.reader_hidden.contains(&layer.name) { layer.on = false; } }
        cadcraft_render::build(&drawing, &space, &opts)
    } else { cadcraft_render::build(&st.doc, &space, &opts) });'''),
    ('    if middle_down\n        && focused', '    let reader_drag = app.read_only && ui.input(|i| i.pointer.primary_down() && i.multi_touch().is_none());\n    if (middle_down || reader_drag)\n        && focused'),
    ('(middle_pressed && inside)', '((middle_pressed || (app.read_only && ui.input(|i| i.pointer.primary_pressed()))) && inside)'),
    ('    // ZOOM Realtime: dragging up zooms in, down zooms out.', '    // ZOOM Realtime: dragging up zooms in, down zooms out.\n    if !app.read_only {'),
    ('    // Re-read the view after navigation.', '    }\n    // Re-read the view after navigation.'),
    ('    // Double-click a viewport to work inside it; double-click the sheet outside it to return.', '    let raw_world = hover_pos.filter(|_| inside).map(|p| xf.to_world(p));\n    let selecting = app.session.picking_objects();\n    if !app.read_only {\n    // Double-click a viewport to work inside it; double-click the sheet outside it to return.'),
    ('    let raw_world = hover_pos.filter(|_| inside).map(|p| xf.to_world(p));\n    let dyn_frame', '    let dyn_frame'),
    ('    let selecting = app.session.picking_objects();\n    if inside', '    if inside'),
    ('    // ---------- paint ----------', '    }\n    // ---------- paint ----------'),
    ('    // UCS icon, ViewCube and viewport label.', '    if app.read_only { return; }\n    // UCS icon, ViewCube and viewport label.'),
])
print('Applied pinned CADCraft reader adaptation')
