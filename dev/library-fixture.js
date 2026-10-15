// Development only: in-memory document storage, real WASM editing and native DWG conversion.
// NOTE(ceiling): this fixture tests the plugin flow, not the live Studio SDK or DrawingBox UI.
(() => {
  let content;
  let file;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.id = "library-fixture-status";
  document.body.prepend(status);
  const show = action => { status.textContent = `Development library: ${action}; ${file.filename}; version ${file.version}; serial ${file.serial_number}; SHA-256 ${file.content_sha256}`; };
  const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
  const ready = fetch("/dev/library-input.dwg").then(response => response.blob()).then(async blob => {
    content = blob;
    file = { file_id: "fixture-cad", filename: "A1-01.dwg", version: 1, bytes: blob.size, serial_number: "A1-01", content_sha256: await hash(blob) };
    show("ready");
  });
  window.studio.docs = {
    tree: async () => { await ready; return { root_id: "root", folders: [
      { folder_id: "library", parent_id: "root", plugin_id: "sheet-versions", name: "Drawing library", level: 1 },
      { folder_id: "plans", parent_id: "library", name: "Architecture", level: 2 },
      { folder_id: "outside", parent_id: "root", name: "Other files", level: 1 }
    ] }; },
    list: async folder => { await ready; return folder === "plans" ? [{ ...file }] : []; },
    fetch: async (id, input) => {
      await ready;
      if (id !== file.file_id || input.version !== file.version) throw new Error("Fixture version not found.");
      show(`fetched v${input.version}`);
      return content;
    },
    upload: async input => {
      await ready;
      if (input.folder_id !== "plans" || input.file.name !== file.filename || input.serial_number !== file.serial_number) throw new Error("Fixture identity mismatch.");
      if (new TextDecoder().decode(new Uint8Array(await input.file.arrayBuffer()).subarray(0, 4)) !== "AC10") throw new Error("Fixture expected actual DWG bytes.");
      content = input.file;
      file = { ...file, bytes: content.size, version: file.version + 1, content_sha256: await hash(content) };
      show("uploaded");
      return { ...file };
    }
  };
})();
