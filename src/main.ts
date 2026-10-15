import { createApp } from "vue";
import { CadApp } from "./CadApp.js";
import { initializeProject } from "./state.js";
initializeProject();
createApp(CadApp).mount("#app");
