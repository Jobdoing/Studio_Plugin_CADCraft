import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { initializeProject, state } from "../src/state.js";
import type { StudioProject } from "../src/lib/studio.js";

const first = { project_handle: "one", project_key: "one", name: "One" };
const next = { project_handle: "two", project_key: "two", name: "Two" };
afterEach(() => { state.project = null; state.projectError = ""; vi.unstubAllGlobals(); });

describe("Studio initial project", () => {
  it("fetches the existing selection without requiring a change notification", async () => {
    vi.stubGlobal("studio", { project: vi.fn(async () => first), onProjectChange: () => vi.fn() });
    initializeProject();
    await flushPromises();
    expect(state.project).toEqual(first);
  });

  it("does not overwrite a newer selection with a late initial response", async () => {
    let resolve!: (project: StudioProject) => void;
    let change!: (project: StudioProject) => void;
    vi.stubGlobal("studio", { project: () => new Promise<StudioProject>(done => { resolve = done; }),
      onProjectChange: (fn: typeof change) => { change = fn; return vi.fn(); } });
    initializeProject();
    change(next);
    resolve(first);
    await flushPromises();
    expect(state.project).toEqual(next);
  });

  it("reports a failed initial fetch and clears it when the host sends a project", async () => {
    let change!: (project: StudioProject) => void;
    vi.stubGlobal("studio", { project: async () => { throw new Error("unavailable"); },
      onProjectChange: (fn: typeof change) => { change = fn; return vi.fn(); } });
    initializeProject();
    await flushPromises();
    expect(state.projectError).toContain("could not be loaded");
    change(next);
    expect(state.projectError).toBe("");
    expect(state.project).toEqual(next);
  });
});
