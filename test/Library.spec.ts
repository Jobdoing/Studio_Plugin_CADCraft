import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/api.js", () => ({ exportDwg: vi.fn() }));
import { exportDwg } from "../src/lib/api.js";
import { saveDrawing } from "../src/lib/library.js";
import type { LibrarySource } from "../src/lib/studio.js";

let source: LibrarySource;
let stored: LibrarySource;
let contents: Uint8Array;
const edited = new TextEncoder().encode("edited DXF geometry");
beforeEach(() => {
  source = { file_id: "plan", filename: "A1-01.dwg", folder_id: "plans", project_handle: "project-one", version: 3, bytes: 5, serial_number: "A1-01", content_sha256: "original" };
  stored = { ...source };
  contents = new Uint8Array();
  vi.mocked(exportDwg).mockReset().mockResolvedValue({ bytes: new TextEncoder().encode("AC1032 actual DWG"), warnings: [] });
  vi.stubGlobal("studio", { docs: {
    tree: vi.fn(async () => ({ root_id: "root", folders: [{ folder_id: "library", parent_id: "root", plugin_id: "sheet-versions", name: "Library", level: 1 }, { folder_id: "plans", parent_id: "library", name: "Plans", level: 2 }] })),
    list: vi.fn(async () => [{ ...stored }]),
    upload: vi.fn(async (input) => {
      contents = new Uint8Array(await input.file.arrayBuffer());
      stored = { ...stored, filename: input.file.name, serial_number: input.serial_number, version: stored.version + 1, content_sha256: "edited" };
      return { ...stored };
    }),
    fetch: vi.fn(async () => new Blob([new Uint8Array(contents)]))
  } });
});
afterEach(() => vi.unstubAllGlobals());

it("converts DWG, uploads the original exact name and serial, then fetches the new version", async () => {
  await expect(saveDrawing(edited, source)).resolves.toEqual([]);
  expect(exportDwg).toHaveBeenCalledWith(edited, "project-one");
  expect(studio.docs.upload).toHaveBeenCalledWith({ folder_id: "plans", file: expect.any(File), serial_number: "A1-01" }, { project_handle: "project-one" });
  const upload = vi.mocked(studio.docs.upload).mock.calls[0][0];
  expect(upload.file.name).toBe("A1-01.dwg");
  expect(new TextDecoder().decode(contents)).toBe("AC1032 actual DWG");
  expect(studio.docs.fetch).toHaveBeenCalledWith("plan", { version: 4 }, { project_handle: "project-one" });
  expect(source.version).toBe(4);
  await expect(saveDrawing(edited, source)).resolves.toEqual([]);
  expect(source.version).toBe(5);
});

it("keeps DXF bytes and explicitly preserves an empty serial number", async () => {
  source.filename = stored.filename = "A1-01.dxf";
  source.serial_number = stored.serial_number = null;
  await expect(saveDrawing(edited, source)).resolves.toEqual([]);
  expect(exportDwg).not.toHaveBeenCalled();
  expect(Array.from(contents)).toEqual(Array.from(edited));
  expect(vi.mocked(studio.docs.upload).mock.calls[0][0].serial_number).toBe("");
});

it.each(["version", "filename", "serial_number", "content_sha256"] as const)("refuses a changed source %s", async field => {
  Object.assign(stored, { [field]: field === "version" ? 4 : "changed" });
  await expect(saveDrawing(edited, source)).rejects.toThrow("已變更");
  expect(studio.docs.upload).not.toHaveBeenCalled();
});

it("rejects a folder moved outside the library", async () => {
  vi.mocked(studio.docs.tree).mockResolvedValue({ root_id: "root", folders: [] });
  await expect(saveDrawing(edited, source)).rejects.toThrow("已不在");
  expect(studio.docs.upload).not.toHaveBeenCalled();
});

it("does not upload after conversion fails", async () => {
  vi.mocked(exportDwg).mockRejectedValue(new Error("conversion failed"));
  await expect(saveDrawing(edited, source)).rejects.toThrow("conversion failed");
  expect(studio.docs.upload).not.toHaveBeenCalled();
});

it("returns converter warnings after verifying the saved drawing", async () => {
  vi.mocked(exportDwg).mockResolvedValue({ bytes: new TextEncoder().encode("AC1032 actual DWG"), warnings: ["Unsupported object"] });
  await expect(saveDrawing(edited, source)).resolves.toEqual(["Unsupported object"]);
});

it.each(["serial", "bytes"])("does not claim success when saved %s cannot be verified", async failure => {
  if (failure === "serial") vi.mocked(studio.docs.upload).mockImplementation(async () => { stored = { ...stored, version: 4, serial_number: null }; return stored; });
  else vi.mocked(studio.docs.fetch).mockResolvedValue(new Blob(["AC1032 actual DWF"]));
  await expect(saveDrawing(edited, source)).rejects.toThrow("驗證");
  expect(source.version).toBe(3);
  await expect(saveDrawing(edited, source)).rejects.toThrow("已變更");
  expect(studio.docs.upload).toHaveBeenCalledTimes(1);
});
