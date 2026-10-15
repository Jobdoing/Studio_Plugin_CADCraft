export interface StudioProject { project_handle: string; project_key: string; name: string }
export interface CadFolder { folder_id: string; name: string; level: number; parent_id: string | null; plugin_id?: string | null }
export interface CadDocument { file_id: string; filename: string; bytes: number; version: number; content_sha256: string; serial_number: string | null }
export interface LibrarySource extends CadDocument { folder_id: string; project_handle: string }
declare global {
  const studio: {
    env(): { shell: "web" | "app" };
    docs: {
      tree(opts: { project_handle: string }): Promise<{ root_id: string; folders: CadFolder[] }>;
      list(folderId: string, opts: { project_handle: string }): Promise<CadDocument[]>;
      fetch(fileId: string, input: { version: number }, opts: { project_handle: string }): Promise<Blob>;
      upload(input: { folder_id: string; file: File; serial_number: string }, opts: { project_handle: string }): Promise<CadDocument>;
    };
    backend: { fetch(path: string, init?: RequestInit & { project_handle?: string }): Promise<Response> };
    onProjectChange(fn: (project: StudioProject | null) => void): () => void;
    project(): Promise<StudioProject | null>;
    download(filename: string, content: Uint8Array, mimeType?: string): Promise<void>;
    dirty(value: boolean): void;
    viewport(): { top: number; height: number } | null;
    onViewportChange(fn: (band: { top: number; height: number }) => void): () => void;
    toolbar: {
      set(payload: { bottom: { id: string; label: string; icon?: string; disabled?: boolean; primary?: boolean }[]; status?: { text: string; tone: "neutral" | "warning" | "danger" } }): void;
      clear(): void;
    };
  };
}
