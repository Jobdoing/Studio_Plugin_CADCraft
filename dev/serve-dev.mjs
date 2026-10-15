import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Development host only: mocked Studio identity/project with the real local CAD converter.
const root = fileURLToPath(new URL("..", import.meta.url));
const kit = process.env.STUDIO_KIT_DIR || "/Volumes/Vibe-Temp/studio-plugin-kit-20261011-0308";
const vendor = "/Volumes/Vibe-Temp/cadcraft-integration/web-host/cadcraft/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/import" || url.pathname === "/api/export-dwg") {
      const result = await fetch("http://127.0.0.1:5291/" + url.pathname.slice(5) + url.search, {
        method: request.method, headers: { "Content-Type": request.headers["content-type"] }, body: request, duplex: "half"
      });
      response.writeHead(result.status, { "Content-Type": "application/json" });
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (url.pathname === "/dev/library-input.dwg") {
      response.writeHead(200, { "Content-Type": "application/acad" });
      response.end(await readFile("/Volumes/Vibe-Temp/cadcraft-integration/probe-data/drawing-library-output-probe.dwg"));
      return;
    }
    if (url.pathname === "/studio-plugin.js") {
      const mock = await readFile(join(kit, "sdk/studio-mock.js"), "utf8");
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(mock + `
window.__studioMock.backend = (path, init) => fetch('/api/' + path, init);
window.__studioMock.changeProject({project_handle:'demo',project_key:'demo',name:'Development project'});
// Development only: the published mock records downloads without writing a file.
window.studio.download = async (name, bytes, mime) => {
  const url = URL.createObjectURL(new Blob([bytes], {type:mime}));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};`);
      return;
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = url.pathname === "/studio-kit.css" ? join(kit, "sdk/studio-kit.css") : url.pathname.startsWith("/cadcraft/") ? resolve(vendor, relative.slice("cadcraft/".length)) : resolve(root, relative);
    if (url.pathname !== "/studio-kit.css" && !file.startsWith(root) && !file.startsWith(vendor)) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    response.end(relative === "index.html" ? content.toString().replace('<script src="app.js">', '<script src="./dev/host-shell.js"></script><script src="./dev/library-fixture.js"></script><script src="app.js">') : content);
  } catch { if (!response.headersSent) response.writeHead(502); response.end("Development host request failed."); }
}).listen(5282, "127.0.0.1");
