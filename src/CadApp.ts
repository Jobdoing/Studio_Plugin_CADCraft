import { defineComponent, h, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from "vue";
import { importCad } from "./lib/api.js";
import { state } from "./state.js";
import { DocumentPicker } from "./DocumentPicker.js";
import { saveDrawing } from "./lib/library.js";
import type { LibrarySource } from "./lib/studio.js";

interface SavePacket { name: string; bytes: Uint8Array; source?: LibrarySource }
const mimeFor = (name: string) => ({ pdf: "application/pdf", png: "image/png", svg: "image/svg+xml", dxf: "application/dxf" }[name.split(".").pop()?.toLowerCase() ?? ""] || "application/octet-stream");

export const CadApp = defineComponent({
  name: "CadApp",
  setup() {
    const frame = ref<HTMLIFrameElement | null>(null);
    const dialog = ref<HTMLDialogElement | null>(null);
    const panel = ref("help");
    const pickerSession = ref(0);
    const canOpenSelection = ref(false);
    const height = ref(0);
    function fitHeight(band: { height: number }): void {
      const body = getComputedStyle(document.body);
      const spacing = [body.marginTop, body.marginBottom, body.paddingTop, body.paddingBottom]
        .reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
      height.value = Math.max(0, band.height - spacing);
    }
    fitHeight(studio.viewport() ?? { height: 0 });
    const ready = ref(false);
    const busy = ref(false);
    const saving = ref(false);
    const dirty = ref(false);
    const error = ref("");
    const warnings = ref<string[]>([]);
    const files = shallowRef<File[]>([]);
    const primary = ref("");
    const pending = shallowRef<SavePacket[]>([]);
    let selectedSources: LibrarySource[] = [];
    const opened = new Map<string, LibrarySource>();
    let request: AbortController | null = null;
    let alive = true;
    const syncDirty = () => studio.dirty(dirty.value || pending.value.length > 0);

    async function savePending(): Promise<void> {
      if (saving.value) return;
      saving.value = true;
      error.value = "";
      try {
        while (pending.value.length) {
          const packet = pending.value[0];
          if (/\.(pdf|png|svg)$/i.test(packet.name)) await studio.download(packet.name, packet.bytes, mimeFor(packet.name));
          else {
            if (!packet.source) throw new Error("Open a drawing from the drawing library before saving. Renamed Save As files need an explicit library destination.");
            if (packet.source.project_handle !== state.project?.project_handle) throw new Error("Return to the original project before retrying this save.");
            if (!/\.dxf$/i.test(packet.name)) throw new Error("The browser must send a DXF working copy for saving.");
            const notes = await saveDrawing(packet.bytes, packet.source);
            if (notes.length) {
              warnings.value = [...warnings.value, ...notes];
              panel.value = "help";
              if (!dialog.value?.open) dialog.value?.showModal();
            }
          }
          pending.value = pending.value.slice(1);
          syncDirty();
        }
      } catch (failure) {
        error.value = `${failure instanceof Error ? failure.message : "Save failed."} The file is retained here; retry before leaving.`;
      } finally { saving.value = false; }
    }

    function receive(event: MessageEvent): void {
      const source = frame.value?.contentWindow;
      // Studio's opaque sandbox has no usable origin; trust only the iframe we created.
      if (!source || event.source !== source) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "cadcraft:request-open" && ready.value && !busy.value) {
        pickerSession.value++;
        canOpenSelection.value = false;
        panel.value = "open";
        dialog.value?.showModal();
      }
      if (data.type === "cadcraft:ready") ready.value = true;
      if (data.type === "cadcraft:failed") { error.value = "CADCraft could not start. Check browser WebGPU / WebGL2 support."; }
      if (data.type === "cadcraft:dirty" && typeof data.dirty === "boolean") { dirty.value = data.dirty; syncDirty(); }
      if (data.type === "cadcraft:save") {
        if (typeof data.name !== "string" || /[\0\r\n]/.test(data.name)) return;
        const name = data.name.split(/[\\/]/).pop();
        const bytes = data.bytes instanceof ArrayBuffer ? new Uint8Array(data.bytes) : data.bytes instanceof Uint8Array ? data.bytes : null;
        if (!name?.trim() || name.length > 255 || !bytes?.byteLength) return;
        // NOTE(ceiling): upstream reports delivery before upload confirmation; retain failed packets and guard leaving in the parent.
        // NOTE(ceiling): the name-only bridge cannot identify renamed/new drawings; stable engine document IDs are needed for Save As destinations.
        pending.value = [...pending.value, { name, bytes, source: opened.get(name) }];
        syncDirty();
        void savePending();
      }
    }
    window.addEventListener("message", receive);

    function selectFiles(selected: File[], sources: LibrarySource[]): void {
      if (!selected.length) return;
      if (selected.some(file => !/\.(dwg|dxf)$/i.test(file.name) || !file.size) || selected.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) {
        error.value = "Select non-empty DWG / DXF files totaling at most 30 MiB."; return;
      }
      files.value = selected;
      selectedSources = sources;
      primary.value = selected[0].name;
      dialog.value?.close();
      void open();
    }

    async function open(): Promise<void> {
      const source = files.value.find(file => file.name === primary.value);
      if (!ready.value || !source || !state.project) return;
      request?.abort();
      const current = new AbortController();
      request = current;
      busy.value = true;
      error.value = "";
      warnings.value = [];
      try {
        let name = source.name;
        let bytes: ArrayBuffer;
        if (/\.dxf$/i.test(source.name) && files.value.length === 1) bytes = await source.arrayBuffer();
        else {
          const result = await importCad(files.value, source.name, state.project.project_handle, current.signal);
          name = result.name;
          warnings.value = result.warnings;
          bytes = Uint8Array.from(atob(result.data), char => char.charCodeAt(0)).buffer;
        }
        if (!alive || request !== current || current.signal.aborted) return;
        const origin = selectedSources.find(item => item.filename === source.name);
        if (!origin) throw new Error("The drawing library source is missing. Reopen the drawing.");
        const previous = opened.get(name);
        if (previous && (previous.file_id !== origin.file_id || previous.project_handle !== origin.project_handle || previous.version !== origin.version)) {
          throw new Error("A different drawing with this working filename is already open. Reload CADCraft before opening this file.");
        }
        opened.set(name, previous ?? { ...origin });
        frame.value?.contentWindow?.postMessage({ type: "cadcraft:open", name, bytes }, "*", [bytes]);
      } catch (failure) {
        if (request === current && !current.signal.aborted) error.value = failure instanceof Error ? failure.message : "Drawing import failed.";
      } finally { if (request === current) busy.value = false; }
    }

    watch(() => state.project?.project_handle, () => { request?.abort(); request = null; busy.value = false; files.value = []; selectedSources = []; primary.value = ""; panel.value = "help"; dialog.value?.close(); });
    const stopViewport = studio.onViewportChange(fitHeight);
    watch(error, value => { if (value) { panel.value = "help"; if (!dialog.value?.open) dialog.value?.showModal(); } });
    watchEffect(() => studio.toolbar.set({
      bottom: [],
      status: state.projectError || error.value || busy.value || saving.value ? {
        text: state.projectError || (error.value ? "Action failed" : busy.value ? "Importing…" : "Saving…"),
        tone: state.projectError || error.value ? "danger" : "neutral"
      } : undefined
    }));
    onBeforeUnmount(() => { alive = false; request?.abort(); stopViewport(); studio.toolbar.clear(); window.removeEventListener("message", receive); studio.dirty(false); });

    return () => h("section", { class: "cad-viewer" }, [
      h("iframe", { ref: frame, class: "workspace", style: { height: `${height.value}px` }, title: "CADCraft drawing workspace", src: "./cadcraft/index.html?host=parent" }),
      h("dialog", { ref: dialog, class: "kit-dialog", "aria-label": "CAD information" }, [
        h("div", { class: "kit-dialog-header" }, [h("div", { class: "kit-dialog-heading" }, [h("h2", panel.value === "open" ? "Open CAD" : "Information")]), h("button", { type: "button", class: "kit-dialog-close", "aria-label": "Close", onClick: () => dialog.value?.close() }, "×")]),
        h("div", { class: "kit-dialog-body kit-form" }, [
          panel.value === "open" && state.project ? h(DocumentPicker, { key: pickerSession.value, projectHandle: state.project.project_handle, onSelected: selectFiles, onReady: (value: boolean) => { canOpenSelection.value = value; } }) : null,
          panel.value === "open" && files.value.length > 1 ? h("div", { class: "kit-field" }, [h("label", { for: "cad-selected-file" }, "Open a selected file"), h("select", { id: "cad-selected-file", value: primary.value, disabled: busy.value, onChange: (event: Event) => { primary.value = (event.target as HTMLSelectElement).value; dialog.value?.close(); void open(); } }, files.value.map(file => h("option", { value: file.name }, file.name)))]) : null,
          !state.project ? h("p", "Open the Studio menu and select a project before opening a drawing.") : null,
          h("p", "Select related DWG references together. Save creates a new version in the original drawing library folder and preserves the serial number."),
          error.value ? h("p", { class: "kit-callout", "data-status": "danger", role: "alert" }, error.value) : null,
          warnings.value.length ? h("div", { class: "kit-callout", "data-status": "warning", role: "status" }, [h("ul", warnings.value.map(warning => h("li", warning)))]) : null
        ]),
        h("div", { class: "kit-dialog-actions" }, [
          panel.value === "open" && state.project ? h("button", { type: "submit", form: "cad-open-form", class: "kit-button", disabled: !canOpenSelection.value }, "Open selected CAD") : null,
          pending.value.length ? h("button", { type: "button", class: "kit-button", disabled: saving.value, onClick: savePending }, "Retry save") : null,
          h("button", { type: "button", class: "kit-button kit-button--secondary", onClick: () => dialog.value?.close() }, "Close")
        ])
      ])
    ]);
  }
});
