import { afterEach, describe, expect, it, vi } from "vitest";
import { exportDwg, importCad } from "../src/lib/api.js";

afterEach(() => vi.unstubAllGlobals());
describe("CAD upload through Studio", () => {
  it("sends edited DXF bytes to the plugin converter in the original project", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: btoa("AC1032binary DWG"), warnings: ["Output warning"] }) }));
    vi.stubGlobal("studio", { backend: { fetch } });
    const bytes = new Uint8Array([0, 255, 13, 10]);
    const output = await exportDwg(bytes, "original-project");
    expect(new TextDecoder().decode(output.bytes)).toBe("AC1032binary DWG");
    expect(output.warnings).toEqual(["Output warning"]);
    expect(fetch).toHaveBeenCalledWith("export-dwg", expect.objectContaining({ method: "POST", project_handle: "original-project" }));
    const body = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    const file = body.get("files") as File;
    expect(file.name).toBe("working-copy.dxf");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(Array.from(bytes));
  });

  it("rejects converter errors and DXF falsely returned as DWG", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "busy" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: btoa("0\nSECTION\n") }) });
    vi.stubGlobal("studio", { backend: { fetch } });
    await expect(exportDwg(new Uint8Array([1]), "project")).rejects.toThrow("busy");
    await expect(exportDwg(new Uint8Array([1]), "project")).rejects.toThrow("未回傳 DWG");
  });
  it("preserves the binary files, filenames and selected project", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ name: "plan.dxf", data: "AA==", warnings: [] }) }));
    vi.stubGlobal("studio", { backend: { fetch } });
    const bytes = new Uint8Array([0, 255, 13, 10]);
    const file = new File([bytes], "plan.dwg");
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    await importCad([file], file.name, "selected-project", new AbortController().signal);
    expect(fetch).toHaveBeenCalledWith("import?primary=plan.dwg", expect.objectContaining({ project_handle: "selected-project" }));
    const uploaded = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    const payload = uploaded.get("files") as File;
    expect(payload.name).toBe("plan.dwg");
    expect(payload.size).toBe(bytes.length);
    const reader = new FileReader();
    const read = new Promise<ArrayBuffer>(resolve => { reader.onload = () => resolve(reader.result as ArrayBuffer); });
    reader.readAsArrayBuffer(payload);
    expect(new Uint8Array(await read)).toEqual(bytes);
  });

  it("does not submit unreadable or canceled input", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("studio", { backend: { fetch } });
    const file = new File(["bytes"], "plan.dwg");
    Object.defineProperty(file, "arrayBuffer", { value: async () => { throw new Error("read failed"); }, configurable: true });
    await expect(importCad([file], file.name, "project", new AbortController().signal)).rejects.toThrow("read failed");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
    const controller = new AbortController(); controller.abort();
    await expect(importCad([file], file.name, "project", controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
