export async function importCad(files: File[], primary: string, projectHandle: string, signal: AbortSignal): Promise<{ name: string; data: string; warnings: string[] }> {
  const body = new FormData();
  // Materialize browser-selected files before crossing Studio's opaque-frame bridge.
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    signal.throwIfAborted();
    body.append("files", new Blob([bytes], { type: "application/octet-stream" }), file.name);
  }
  const response = await studio.backend.fetch(`import?primary=${encodeURIComponent(primary)}`, {
    method: "POST", body, signal, project_handle: projectHandle
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error?.message || `CAD import failed (${response.status}).`);
  }
  return response.json();
}

export async function exportDwg(bytes: Uint8Array, projectHandle: string): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const body = new FormData();
  body.append("files", new Blob([new Uint8Array(bytes)], { type: "application/dxf" }), "working-copy.dxf");
  const response = await studio.backend.fetch("export-dwg", { method: "POST", body, project_handle: projectHandle });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `DWG conversion failed (${response.status}).`);
  const output = Uint8Array.from(atob(result.data), char => char.charCodeAt(0));
  if (output.length < 6 || new TextDecoder().decode(output.subarray(0, 4)) !== "AC10") throw new Error("The converter did not return a DWG file.");
  return { bytes: output, warnings: result.warnings };
}
