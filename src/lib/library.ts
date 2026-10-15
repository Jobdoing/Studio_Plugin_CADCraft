import { exportDwg } from "./api.js";
import type { CadFolder, LibrarySource } from "./studio.js";

export function drawingFolders(folders: CadFolder[]): CadFolder[] {
  const root = folders.find(item => item.plugin_id === "sheet-versions");
  if (!root) return [];
  const ids = new Set([root.folder_id]);
  // NOTE(ceiling): repeated scans suit small folder trees; use a parent-to-children map for large trees.
  for (let count = -1; count !== ids.size;) {
    count = ids.size;
    for (const item of folders) if (item.parent_id && ids.has(item.parent_id)) ids.add(item.folder_id);
  }
  return folders.filter(item => ids.has(item.folder_id));
}

export async function saveDrawing(bytes: Uint8Array, source: LibrarySource): Promise<string[]> {
  if (!bytes.byteLength || bytes.byteLength > 30 * 1024 * 1024) throw new Error("The drawing must contain at most 30 MiB of non-empty data.");
  if (typeof studio.docs?.upload !== "function") throw new Error("Studio document upload is unavailable.");
  const serial = source.serial_number ?? "";
  if (serial.length > 20) throw new Error("The original serial number exceeds Studio's 20-character limit.");
  const options = { project_handle: source.project_handle };
  const converted = /\.dwg$/i.test(source.filename) ? await exportDwg(bytes, source.project_handle) : { bytes, warnings: [] };
  const output = converted.bytes;
  const tree = await studio.docs.tree(options);
  if (!drawingFolders(tree.folders).some(folder => folder.folder_id === source.folder_id)) throw new Error("The original folder is no longer in the drawing library.");
  const current = (await studio.docs.list(source.folder_id, options)).find(file => file.file_id === source.file_id);
  if (!current || !Object.hasOwn(current, "serial_number") || current.filename !== source.filename || current.version !== source.version ||
      current.content_sha256 !== source.content_sha256 || (current.serial_number ?? "") !== serial) {
    throw new Error("The source changed since opening or the last save. Reopen it before saving another version.");
  }
  // NOTE(ceiling): docs.upload has no conditional version parameter; an atomic conflict check requires platform support.
  await studio.docs.upload({ folder_id: source.folder_id,
    file: new File([new Uint8Array(output)], source.filename, { type: /\.dwg$/i.test(source.filename) ? "application/acad" : "application/dxf" }),
    serial_number: serial }, options);
  const saved = (await studio.docs.list(source.folder_id, options)).find(file => file.file_id === source.file_id);
  if (!saved || !saved.content_sha256 || !Object.hasOwn(saved, "serial_number") || saved.filename !== source.filename || saved.version !== source.version + 1 || (saved.serial_number ?? "") !== serial) {
    throw new Error("Upload returned, but the saved version or serial number could not be verified. Check the library before retrying.");
  }
  const blob = await studio.docs.fetch(saved.file_id, { version: saved.version }, options);
  const actual = new Uint8Array(await blob.arrayBuffer());
  if (actual.length !== output.length || actual.some((value, index) => value !== output[index])) {
    throw new Error("The saved contents could not be verified. Check the library before retrying.");
  }
  Object.assign(source, saved);
  return converted.warnings;
}
