import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const js = readFileSync("/Volumes/Vibe-Temp/cadcraft-integration/web-host/cadcraft/cadcraft-web-d269cf8fb65cf85.js", "utf8");
const binding = js.match(/__wbg_click_d990e70c576b7c54: (function\(arg0\) \{[\s\S]*?\n        \})/);
assert.ok(binding, "Pinned click binding must exist");
const messages = [];
const click = runInNewContext(`(${binding[1]})`, { window: { parent: { postMessage: (message, origin) => messages.push({ type: message.type, origin }) } } });
let nativeClicks = 0;
let removals = 0;
click({ id: "cadcraft_open_input", click: () => nativeClicks++, remove: () => removals++ });
assert.deepEqual(messages, [{ type: "cadcraft:request-open", origin: "*" }]);
assert.equal(nativeClicks, 0, "Drawing Open must use the Studio import path");
assert.equal(removals, 1);
click({ id: "font_input", click: () => nativeClicks++, remove: () => removals++ });
assert.equal(nativeClicks, 1, "Unrelated pickers must retain upstream behavior");
assert.equal(messages.length, 1);
console.log("PASS: native drawing Open delegates; unrelated clicks are preserved");
