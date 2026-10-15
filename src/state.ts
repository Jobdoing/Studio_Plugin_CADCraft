import { reactive } from "vue";
import type { StudioProject } from "./lib/studio.js";
export const state = reactive<{ project: StudioProject | null; projectError: string }>({ project: null, projectError: "" });

export function initializeProject(): () => void {
  let changed = false;
  const stop = studio.onProjectChange(project => { changed = true; state.project = project; state.projectError = ""; });
  void studio.project().then(project => { if (!changed) state.project = project; }).catch(() => {
    if (!changed) state.projectError = "Project could not be loaded. Reload Studio.";
  });
  return stop;
}
