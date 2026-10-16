import { defineComponent, h, onBeforeUnmount, ref, shallowRef, watchEffect } from "vue";
import type { CadDocument, CadFolder, LibrarySource } from "./lib/studio.js";
import { drawingFolders } from "./lib/library.js";

export const DocumentPicker = defineComponent({
  props: { projectHandle: { type: String, required: true } },
  emits: { selected: (files: File[], sources: LibrarySource[]) => files.length > 0 && files.length === sources.length, ready: (value: boolean) => typeof value === "boolean" },
  setup(props, { emit }) {
    const folders = shallowRef<CadFolder[]>([]);
    const documents = shallowRef<CadDocument[]>([]);
    const folder = ref("");
    const selected = ref<string[]>([]);
    const busy = ref(true);
    const error = ref("");
    watchEffect(() => emit("ready", !busy.value && selected.value.length > 0));
    let generation = 0;
    let alive = true;
    const options = { project_handle: props.projectHandle };
    const available = typeof studio.docs?.tree === "function" && typeof studio.docs?.list === "function" && typeof studio.docs?.fetch === "function";
    onBeforeUnmount(() => { alive = false; generation++; });

    async function list(): Promise<void> {
      const current = ++generation;
      busy.value = true; error.value = ""; selected.value = []; documents.value = [];
      try {
        const files = await studio.docs.list(folder.value, options);
        if (alive && generation === current) documents.value = files.filter(file => /\.(dwg|dxf)$/i.test(file.filename));
      } catch { if (alive && generation === current) error.value = "無法載入此資料夾，請確認權限後重試。"; }
      finally { if (alive && generation === current) busy.value = false; }
    }
    if (!available) {
      busy.value = false;
      error.value = "Studio 文件服務目前無法使用，請聯絡管理員啟用或更新 Studio 後重新開啟 CAD。";
    } else void studio.docs.tree(options).then(async tree => {
      if (!alive) return;
      folders.value = drawingFolders(tree.folders);
      if (!folders.value.length) error.value = "此專案中的圖說庫資料夾目前無法使用。";
      busy.value = false;
    }).catch(() => { if (alive) { busy.value = false; error.value = "無法載入 Studio 資料夾，請確認所選專案與權限。"; } });

    async function open(): Promise<void> {
      const picked = selected.value.map(id => documents.value.find(file => file.file_id === id)!);
      if (!picked.length) return;
      if (picked.some(file => !Number.isFinite(file.bytes) || file.bytes <= 0 || !Number.isInteger(file.version) || file.version < 1) || picked.reduce((total, file) => total + file.bytes, 0) > 30 * 1024 * 1024) {
        error.value = "請選取非空的 CAD 檔案，總大小不超過 30 MiB。"; return;
      }
      if (picked.some(file => !file.content_sha256 || !Object.hasOwn(file, "serial_number") ||
          (file.serial_number !== null && typeof file.serial_number !== "string"))) {
        error.value = "Studio 未回傳安全儲存圖說庫所需的檔案雜湊與流水號。"; return;
      }
      const current = ++generation;
      busy.value = true; error.value = "";
      try {
        const files: File[] = [];
        for (const file of picked) {
          const blob = await studio.docs.fetch(file.file_id, { version: file.version }, options);
          if (!alive || generation !== current) return;
          files.push(new File([blob], file.filename, { type: blob.type }));
        }
        if (files.some(file => !file.size) || files.reduce((total, file) => total + file.size, 0) > 30 * 1024 * 1024) throw new Error("size");
        emit("selected", files, picked.map(file => ({ ...file, folder_id: folder.value, project_handle: props.projectHandle })));
      } catch { if (alive && generation === current) error.value = "無法開啟所選的 CAD 檔案，請確認權限與 30 MiB 大小限制。"; }
      finally { if (alive && generation === current) busy.value = false; }
    }
    return () => h("form", { id: "cad-open-form", class: "kit-form", onSubmit: (event: Event) => { event.preventDefault(); if (!busy.value) void open(); } }, [
      h("div", { class: "kit-field" }, [h("label", { for: "cad-library-folder" }, "圖說庫資料夾"), h("select", { id: "cad-library-folder", value: folder.value, disabled: busy.value || !available || !folders.value.length, onChange: (event: Event) => { folder.value = (event.target as HTMLSelectElement).value; if (folder.value) void list(); } }, [h("option", { value: "", disabled: true }, "請選擇資料夾"), ...folders.value.map(item => h("option", { value: item.folder_id }, `${"— ".repeat(Math.max(0, item.level - 1))}${item.name}`))])]),
      busy.value ? h("p", { class: "kit-loading", role: "status" }, "載入中…") : null,
      !busy.value && folder.value && !documents.value.length ? h("p", { class: "kit-empty" }, "此資料夾內沒有 DWG 或 DXF 檔案。") : null,
      h("div", { class: "document-list" }, documents.value.map(file => h("label", { class: "document-row" }, [
        h("input", { class: "document-checkbox", type: "checkbox", checked: selected.value.includes(file.file_id), disabled: busy.value || file.bytes <= 0, onChange: (event: Event) => {
          selected.value = (event.target as HTMLInputElement).checked ? [...selected.value, file.file_id] : selected.value.filter(id => id !== file.file_id);
        } }), h("span", `${file.filename} (v${file.version ?? "?"}, ${Number.isFinite(file.bytes) ? `${file.bytes.toLocaleString()} 位元組` : "大小未知"})`)
      ]))),
      error.value ? h("p", { class: "kit-callout", "data-status": "danger", role: "alert" }, error.value) : null
    ]);
  }
});
