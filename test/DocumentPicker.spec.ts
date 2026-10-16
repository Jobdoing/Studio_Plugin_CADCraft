import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { DocumentPicker } from "../src/DocumentPicker.js";

let wrapper: ReturnType<typeof mount>;
const file = { file_id: "drawing-id", filename: "plan.dwg", version: 3, bytes: 3, serial_number: "A1-01", content_sha256: "original" };
beforeEach(() => {
  vi.stubGlobal("studio", { docs: {
    tree: vi.fn(async () => ({ root_id: "root", folders: [
      { folder_id: "outside", parent_id: "root", name: "Drawing library", level: 1 },
      { folder_id: "plans", parent_id: "library", name: "Plans", level: 2 },
      { folder_id: "library", parent_id: "root", name: "Renamed library", level: 1, plugin_id: "sheet-versions" },
      { folder_id: "deep", parent_id: "plans", name: "Deep", level: 3 }
    ] })),
    list: vi.fn(async () => [file, { ...file, file_id: "pdf-id", filename: "notes.pdf" }]),
    fetch: vi.fn(async () => new Blob(["dwg"]))
  } });
  wrapper = mount(DocumentPicker, { props: { projectHandle: "selected-project" } });
});
afterEach(() => { wrapper.unmount(); vi.unstubAllGlobals(); });

async function select(): Promise<void> {
  await flushPromises();
  await wrapper.get("select").setValue("plans");
  await flushPromises();
  await wrapper.get('input[type="checkbox"]').setValue(true);
}

it.each(["tree", "list", "fetch", "all"])("handles missing document capability: %s", async method => {
  wrapper.unmount();
  const tree = studio.docs.tree;
  vi.mocked(tree).mockClear();
  const docs = method === "all" ? undefined : { ...studio.docs, [method]: undefined };
  vi.stubGlobal("studio", { docs });
  expect(() => { wrapper = mount(DocumentPicker, { props: { projectHandle: "selected-project" } }); }).not.toThrow();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("文件服務");
  expect(wrapper.get("select").attributes("disabled")).toBeDefined();
  expect(tree).not.toHaveBeenCalled();
});

it("lists only CAD files from a user-selected folder using explicit project scope", async () => {
  await flushPromises();
  expect(studio.docs.list).not.toHaveBeenCalled();
  await select();
  expect(studio.docs.tree).toHaveBeenCalledWith({ project_handle: "selected-project" });
  expect(studio.docs.list).toHaveBeenCalledWith("plans", { project_handle: "selected-project" });
  expect(wrapper.text()).toContain("plan.dwg");
  expect(wrapper.text()).not.toContain("notes.pdf");
  expect(wrapper.findAll("option").map(option => option.attributes("value"))).toEqual(["", "plans", "library", "deep"]);
});

it("fetches the listed version and emits its real file bytes", async () => {
  await select();
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(studio.docs.fetch).toHaveBeenCalledWith("drawing-id", { version: 3 }, { project_handle: "selected-project" });
  const files = wrapper.emitted("selected")![0][0] as File[];
  expect(files[0].name).toBe("plan.dwg");
  expect(files[0].size).toBe(3);
  expect(await files[0].text()).toBe("dwg");
  expect(wrapper.emitted("selected")![0][1]).toEqual([{ ...file, folder_id: "plans", project_handle: "selected-project" }]);
});

it("does not substitute a similarly named folder when the library is missing", async () => {
  wrapper.unmount();
  vi.mocked(studio.docs.tree).mockResolvedValue({ root_id: "root", folders: [{ folder_id: "fake", parent_id: "root", name: "Drawing library", level: 1 }] });
  wrapper = mount(DocumentPicker, { props: { projectHandle: "selected-project" } });
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("圖說庫資料夾");
  expect(wrapper.get("select").attributes("disabled")).toBeDefined();
  expect(studio.docs.list).not.toHaveBeenCalled();
});

it("rejects oversized metadata before fetching contents", async () => {
  vi.mocked(studio.docs.list).mockResolvedValue([{ ...file, bytes: 31 * 1024 * 1024 }]);
  await select();
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(studio.docs.fetch).not.toHaveBeenCalled();
  expect(wrapper.get('[role="alert"]').text()).toContain("30 MiB");
});

it("refuses to open when Studio omits serial metadata instead of clearing it on save", async () => {
  vi.mocked(studio.docs.list).mockResolvedValue([{ ...file, serial_number: undefined } as unknown as typeof file]);
  await select();
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(studio.docs.fetch).not.toHaveBeenCalled();
  expect(wrapper.get('[role="alert"]').text()).toContain("流水號");
});

it("shows an empty CAD file without offering to open it", async () => {
  vi.mocked(studio.docs.list).mockResolvedValue([{ ...file, bytes: 0 }]);
  await flushPromises();
  await wrapper.get("select").setValue("plans");
  await flushPromises();
  expect(wrapper.get('input[type="checkbox"]').attributes("disabled")).toBeDefined();
  expect(wrapper.text()).toContain("0 位元組");
  expect(studio.docs.fetch).not.toHaveBeenCalled();
});

it("stops fetching reference files after leaving the picker", async () => {
  let resolve!: (blob: Blob) => void;
  vi.mocked(studio.docs.list).mockResolvedValue([file, { ...file, file_id: "reference-id", filename: "reference.dwg" }]);
  vi.mocked(studio.docs.fetch).mockImplementation(() => new Promise(done => { resolve = done; }));
  await select();
  await wrapper.findAll('input[type="checkbox"]')[1].setValue(true);
  await wrapper.get("form").trigger("submit");
  wrapper.unmount();
  resolve(new Blob(["dwg"]));
  await flushPromises();
  expect(studio.docs.fetch).toHaveBeenCalledTimes(1);
  expect(wrapper.emitted("selected")).toBeUndefined();
});

it("reports denied file access without opening anything", async () => {
  vi.mocked(studio.docs.fetch).mockRejectedValue(new Error("NOT_FOUND"));
  await select();
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(wrapper.emitted("selected")).toBeUndefined();
  expect(wrapper.get('[role="alert"]').text()).toContain("確認權限");
});
