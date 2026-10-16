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
            if (!packet.source) throw new Error("請先從圖說庫開啟圖面再儲存。另存新檔的檔案需要指定圖說庫目的地。");
            if (packet.source.project_handle !== state.project?.project_handle) throw new Error("請先切換回原本的專案，再重試此次儲存。");
            if (!/\.dxf$/i.test(packet.name)) throw new Error("瀏覽器必須傳送 DXF 工作副本才能儲存。");
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
        error.value = `${failure instanceof Error ? failure.message : "儲存失敗。"} 檔案已保留在此處，請在離開前重試。`;
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
      if (data.type === "cadcraft:failed") { error.value = "CADCraft 無法啟動，請確認瀏覽器支援 WebGPU / WebGL2。"; }
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
        error.value = "請選取非空的 DWG / DXF 檔案，總大小不超過 30 MiB。"; return;
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
        if (!origin) throw new Error("圖說庫來源已遺失，請重新開啟圖面。");
        const previous = opened.get(name);
        if (previous && (previous.file_id !== origin.file_id || previous.project_handle !== origin.project_handle || previous.version !== origin.version)) {
          throw new Error("已有另一張使用相同工作檔名的圖面開啟中，請重新載入 CADCraft 後再開啟此檔案。");
        }
        opened.set(name, previous ?? { ...origin });
        frame.value?.contentWindow?.postMessage({ type: "cadcraft:open", name, bytes }, "*", [bytes]);
      } catch (failure) {
        if (request === current && !current.signal.aborted) error.value = failure instanceof Error ? failure.message : "圖面匯入失敗。";
      } finally { if (request === current) busy.value = false; }
    }

    watch(() => state.project?.project_handle, () => { request?.abort(); request = null; busy.value = false; files.value = []; selectedSources = []; primary.value = ""; panel.value = "help"; dialog.value?.close(); });
    const stopViewport = studio.onViewportChange(fitHeight);
    watch(error, value => { if (value) { panel.value = "help"; if (!dialog.value?.open) dialog.value?.showModal(); } });
    watchEffect(() => studio.toolbar.set({
      bottom: [],
      status: state.projectError || error.value || busy.value || saving.value ? {
        text: state.projectError || (error.value ? "操作失敗" : busy.value ? "匯入中…" : "儲存中…"),
        tone: state.projectError || error.value ? "danger" : "neutral"
      } : undefined
    }));
    onBeforeUnmount(() => { alive = false; request?.abort(); stopViewport(); studio.toolbar.clear(); window.removeEventListener("message", receive); studio.dirty(false); });

    return () => h("section", { class: "cad-viewer" }, [
      h("iframe", { ref: frame, class: "workspace", style: { height: `${height.value}px` }, title: "CADCraft 繪圖工作區", src: "./cadcraft/index.html?host=parent" }),
      h("dialog", { ref: dialog, class: "kit-dialog", "aria-label": "圖面資訊" }, [
        h("div", { class: "kit-dialog-header" }, [h("div", { class: "kit-dialog-heading" }, [h("h2", panel.value === "open" ? "開啟圖面" : "資訊")]), h("button", { type: "button", class: "kit-dialog-close", "aria-label": "關閉", onClick: () => dialog.value?.close() }, "×")]),
        h("div", { class: "kit-dialog-body kit-form" }, [
          panel.value === "open" && state.project ? h(DocumentPicker, { key: pickerSession.value, projectHandle: state.project.project_handle, onSelected: selectFiles, onReady: (value: boolean) => { canOpenSelection.value = value; } }) : null,
          panel.value === "open" && files.value.length > 1 ? h("div", { class: "kit-field" }, [h("label", { for: "cad-selected-file" }, "開啟所選檔案"), h("select", { id: "cad-selected-file", value: primary.value, disabled: busy.value, onChange: (event: Event) => { primary.value = (event.target as HTMLSelectElement).value; dialog.value?.close(); void open(); } }, files.value.map(file => h("option", { value: file.name }, file.name)))]) : null,
          !state.project ? h("p", "請先在 Studio 選單中選擇專案，再開啟圖面。") : null,
          h("p", "可一併選取相關的 DWG 參照。儲存時會在原本的圖說庫資料夾建立新版本，並保留流水號。"),
          error.value ? h("p", { class: "kit-callout", "data-status": "danger", role: "alert" }, error.value) : null,
          warnings.value.length ? h("div", { class: "kit-callout", "data-status": "warning", role: "status" }, [h("ul", warnings.value.map(warning => h("li", warning)))]) : null
        ]),
        h("div", { class: "kit-dialog-actions" }, [
          panel.value === "open" && state.project ? h("button", { type: "submit", form: "cad-open-form", class: "kit-button", disabled: !canOpenSelection.value }, "開啟所選圖面") : null,
          pending.value.length ? h("button", { type: "button", class: "kit-button", disabled: saving.value, onClick: savePending }, "重試儲存") : null,
          h("button", { type: "button", class: "kit-button kit-button--secondary", onClick: () => dialog.value?.close() }, "關閉")
        ])
      ])
    ]);
  }
});
