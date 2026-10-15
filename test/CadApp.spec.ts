import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
vi.mock("../src/lib/api.js", () => ({ importCad: vi.fn() }));
vi.mock("../src/lib/library.js", async original => ({ ...await original<typeof import("../src/lib/library.js")>(), saveDrawing: vi.fn() }));
import { importCad } from "../src/lib/api.js";
import { saveDrawing } from "../src/lib/library.js";
import { DocumentPicker } from "../src/DocumentPicker.js";
import { CadApp } from "../src/CadApp.js";
import { state } from "../src/state.js";

const mounted: ReturnType<typeof mount>[] = [];
let viewport: (band: { top: number; height: number }) => void;
const message = (wrapper: ReturnType<typeof mount>, data: unknown, origin = window.location.origin, source = wrapper.get("iframe").element.contentWindow) => {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
};
const screen = () => { const wrapper = mount(CadApp, { attachTo: document.body }); mounted.push(wrapper); return wrapper; };
const origin = { file_id: "drawing", filename: "plan.dwg", folder_id: "plans", project_handle: "project-one", version: 1, bytes: 3, serial_number: "A1-01", content_sha256: "original" };
async function openLibrary(wrapper: ReturnType<typeof mount>): Promise<void> {
  message(wrapper, { type: "cadcraft:ready" });
  message(wrapper, { type: "cadcraft:request-open" });
  await flushPromises();
  wrapper.getComponent(DocumentPicker).vm.$emit("selected", [new File(["dwg"], "plan.dwg")], [{ ...origin }]);
  await flushPromises();
}
describe("upstream CADCraft integration", () => {
  beforeEach(() => {
    document.body.style.cssText = "margin: 8px";
    // jsdom does not implement native dialog methods.
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn() });
    state.project = { project_handle: "project-one", project_key: "one", name: "One" };
    vi.stubGlobal("studio", { download: vi.fn(async () => {}), dirty: vi.fn(),
      env: vi.fn(() => ({ shell: "web" })),
      docs: { tree: vi.fn(async () => ({ root_id: "root", folders: [] })), list: vi.fn(async () => []), fetch: vi.fn() },
      viewport: () => ({ top: 0, height: 600 }),
      onViewportChange: vi.fn(fn => { viewport = fn; return vi.fn(); }),
      toolbar: { set: vi.fn(), clear: vi.fn() }
    });
    vi.mocked(importCad).mockReset().mockResolvedValue({ name: "plan.dxf", data: btoa("drawing bytes"), warnings: ["Missing reference"] });
    vi.mocked(saveDrawing).mockReset().mockResolvedValue([]);
  });
  afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

  it("keeps the open action outside the scrolling body and submits the selected file", async () => {
    vi.mocked(studio.docs.tree).mockResolvedValue({ root_id: "root", folders: [{ folder_id: "plans", parent_id: "root", name: "Library", level: 1, plugin_id: "sheet-versions" }] });
    vi.mocked(studio.docs.list).mockResolvedValue([origin]);
    vi.mocked(studio.docs.fetch).mockResolvedValue(new Blob(["dwg"]));
    const wrapper = screen();
    message(wrapper, { type: "cadcraft:ready" });
    message(wrapper, { type: "cadcraft:request-open" });
    await flushPromises();
    const action = wrapper.get('.kit-dialog-actions button[type="submit"]');
    expect(wrapper.find('.kit-dialog-body button[type="submit"]').exists()).toBe(false);
    expect(action.attributes("disabled")).toBeDefined();
    await wrapper.get("#cad-library-folder").setValue("plans");
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(action.attributes("disabled")).toBeUndefined();
    expect((action.element as HTMLButtonElement).form).toBe(wrapper.get("form").element);
    (action.element as HTMLButtonElement).click();
    await flushPromises();
    expect(studio.docs.fetch).toHaveBeenCalledWith("drawing", { version: 1 }, { project_handle: "project-one" });
    expect(importCad).toHaveBeenCalled();
  });

  it("embeds upstream workspace instead of reimplementing CAD controls", () => {
    const wrapper = screen();
    expect(wrapper.get("iframe").attributes("src")).toBe("./cadcraft/index.html?host=parent");
    expect(wrapper.find("img").exists()).toBe(false);
    expect(studio.toolbar.set).toHaveBeenCalledWith(expect.objectContaining({ bottom: [] }));
    message(wrapper, { type: "cadcraft:ready", version: "0.6.2" });
  });

  it("rejects save messages from any window other than the created iframe", async () => {
    const wrapper = screen();
    const data = { type: "cadcraft:save", name: "plan.pdf", bytes: new Uint8Array([1]).buffer };
    window.dispatchEvent(new MessageEvent("message", { data, origin: "null", source: window }));
    window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source: window }));
    await flushPromises();
    expect(studio.download).not.toHaveBeenCalled();
  });

  it("opens Studio folders on a phone without exposing the device file picker", async () => {
    const wrapper = screen();
    Object.defineProperty(wrapper.get("iframe").element, "clientWidth", { value: 375 });
    message(wrapper, { type: "cadcraft:ready" });
    message(wrapper, { type: "cadcraft:request-open" });
    await flushPromises();
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Drawing library folder");
    expect(studio.docs.tree).toHaveBeenCalledWith({ project_handle: "project-one" });
    state.project = { project_handle: "another-project", project_key: "another", name: "Another" };
    await flushPromises();
    expect(wrapper.text()).not.toContain("Drawing library folder");
  });

  it("keeps the App shell on Studio folders even when landscape is wide", async () => {
    vi.mocked(studio.env).mockReturnValue({ shell: "app" });
    const wrapper = screen();
    Object.defineProperty(wrapper.get("iframe").element, "clientWidth", { value: 1024 });
    message(wrapper, { type: "cadcraft:ready" });
    message(wrapper, { type: "cadcraft:request-open" });
    await flushPromises();
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Drawing library folder");
  });

  it("retains failed downloads and keeps the Studio dirty guard until retry succeeds", async () => {
    const wrapper = screen();
    vi.mocked(studio.download).mockRejectedValueOnce(new Error("offline"));
    message(wrapper, { type: "cadcraft:save", name: "plan.pdf", bytes: new Uint8Array([1, 2]).buffer });
    message(wrapper, { type: "cadcraft:dirty", dirty: false });
    await flushPromises();
    expect(studio.dirty).toHaveBeenLastCalledWith(true);
    expect(wrapper.get('[role="alert"]').text()).toContain("retained");
    await wrapper.findAll("button").find(button => button.text() === "Retry save")!.trigger("click");
    await flushPromises();
    expect(studio.download).toHaveBeenCalledTimes(2);
    expect(studio.download).toHaveBeenLastCalledWith("plan.pdf", new Uint8Array([1, 2]), "application/pdf");
    expect(studio.dirty).toHaveBeenLastCalledWith(false);
  });

  it("uses native CAD controls and fits the whole document inside the host visible band", async () => {
    const wrapper = screen();
    expect(wrapper.classes()).toContain("cad-viewer");
    expect(wrapper.find("header").exists()).toBe(false);
    expect(wrapper.get("iframe").element.style.height).toBe("584px");
    viewport({ top: 0, height: 420 });
    await flushPromises();
    expect(wrapper.get("iframe").element.style.height).toBe("404px");
    document.body.style.cssText = "margin: 10px 0; padding: 4px 0";
    viewport({ top: 0, height: 420 });
    await flushPromises();
    expect(wrapper.get("iframe").element.style.height).toBe("392px");
    message(wrapper, { type: "cadcraft:ready", version: "0.6.2" });
    await flushPromises();
    expect(studio.toolbar.set).toHaveBeenLastCalledWith(expect.objectContaining({ bottom: [] }));
    expect(vi.mocked(studio.toolbar.set).mock.lastCall?.[0].status).toBeUndefined();
    const modal = vi.spyOn(wrapper.get("dialog").element, "showModal");
    message(wrapper, { type: "cadcraft:request-open" }, "null");
    await flushPromises();
    expect(modal).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(studio.toolbar.clear).toHaveBeenCalledOnce();
  });

  it("sends converted DWG bytes to the upstream app and reports actual import warnings", async () => {
    const wrapper = screen();
    message(wrapper, { type: "cadcraft:ready", version: "0.6.2" });
    await flushPromises();
    message(wrapper, { type: "cadcraft:request-open" });
    await flushPromises();
    const post = vi.spyOn(wrapper.get("iframe").element.contentWindow!, "postMessage");
    wrapper.getComponent(DocumentPicker).vm.$emit("selected", [new File(["dwg"], "plan.dwg")], [{ ...origin }]);
    await flushPromises();
    expect(importCad).toHaveBeenCalledWith(expect.any(Array), "plan.dwg", "project-one", expect.any(AbortSignal));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "cadcraft:open", name: "plan.dxf", bytes: expect.any(ArrayBuffer) }), "*", expect.any(Array));
    expect(wrapper.text()).toContain("Missing reference");
  });

  it("accepts opaque-origin readiness and saves only from the created iframe", async () => {
    const wrapper = screen();
    message(wrapper, { type: "cadcraft:ready", version: "0.6.2" }, "null");
    await flushPromises();
    const modal = vi.spyOn(wrapper.get("dialog").element, "showModal");
    message(wrapper, { type: "cadcraft:request-open" }, "null");
    expect(modal).toHaveBeenCalledOnce();
    message(wrapper, { type: "cadcraft:save", name: "opaque.pdf", bytes: new Uint8Array([1, 2]).buffer }, "null");
    await flushPromises();
    expect(studio.download).toHaveBeenCalledWith("opaque.pdf", new Uint8Array([1, 2]), "application/pdf");
  });

  it("saves a DWG working copy through its original library identity and retains failures", async () => {
    const wrapper = screen();
    await openLibrary(wrapper);
    vi.mocked(saveDrawing).mockRejectedValueOnce(new Error("offline"));
    message(wrapper, { type: "cadcraft:save", name: "plan.dxf", bytes: new Uint8Array([4, 5]).buffer });
    message(wrapper, { type: "cadcraft:dirty", dirty: false });
    await flushPromises();
    expect(saveDrawing).toHaveBeenCalledWith(new Uint8Array([4, 5]), origin);
    expect(studio.download).not.toHaveBeenCalled();
    expect(studio.dirty).toHaveBeenLastCalledWith(true);
    await wrapper.findAll("button").find(button => button.text() === "Retry save")!.trigger("click");
    await flushPromises();
    expect(saveDrawing).toHaveBeenCalledTimes(2);
    expect(studio.dirty).toHaveBeenLastCalledWith(false);
  });

  it("never guesses a destination for an unknown drawing name", async () => {
    const wrapper = screen();
    await openLibrary(wrapper);
    message(wrapper, { type: "cadcraft:save", name: "renamed.dxf", bytes: new Uint8Array([4]).buffer });
    await flushPromises();
    expect(saveDrawing).not.toHaveBeenCalled();
    expect(studio.download).not.toHaveBeenCalled();
    expect(studio.dirty).toHaveBeenLastCalledWith(true);
    expect(wrapper.get('[role="alert"]').text()).toContain("destination");
  });

  it("shows conversion warnings after saving instead of silently dropping them", async () => {
    const wrapper = screen();
    await openLibrary(wrapper);
    vi.mocked(saveDrawing).mockResolvedValueOnce(["Unsupported object"]);
    message(wrapper, { type: "cadcraft:save", name: "plan.dxf", bytes: new Uint8Array([4]).buffer });
    await flushPromises();
    expect(wrapper.text()).toContain("Unsupported object");
    expect(studio.dirty).toHaveBeenLastCalledWith(false);
  });

  it("rejects another source with the same working filename", async () => {
    const wrapper = screen();
    await openLibrary(wrapper);
    message(wrapper, { type: "cadcraft:request-open" });
    await flushPromises();
    wrapper.getComponent(DocumentPicker).vm.$emit("selected", [new File(["dwg"], "plan.dwg")], [{ ...origin, file_id: "another-drawing", folder_id: "another-folder" }]);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("different drawing");
    message(wrapper, { type: "cadcraft:save", name: "plan.dxf", bytes: new Uint8Array([4]).buffer });
    await flushPromises();
    expect(saveDrawing).toHaveBeenCalledWith(new Uint8Array([4]), origin);
  });

  it("retains the original project identity after switching projects", async () => {
    const wrapper = screen();
    await openLibrary(wrapper);
    state.project = { project_handle: "another-project", project_key: "two", name: "Two" };
    await flushPromises();
    message(wrapper, { type: "cadcraft:save", name: "plan.dxf", bytes: new Uint8Array([4]).buffer });
    await flushPromises();
    expect(saveDrawing).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain("original project");
    state.project = { project_handle: "project-one", project_key: "one", name: "One" };
    await flushPromises();
    await wrapper.findAll("button").find(button => button.text() === "Retry save")!.trigger("click");
    await flushPromises();
    expect(saveDrawing).toHaveBeenCalledWith(new Uint8Array([4]), origin);
  });
});
