# CADCraft — Studio local plugin

Open-source (Apache-2.0) Studio plugin that embeds the CADCraft CAD engine for DWG/DXF viewing and
editing inside Studio. The engine itself is fetched and patched at build time (`checks/prepare_vendor.py`);
see NOTICE for its license. Build: `npm ci && npm run build` (produces `app.js`), then package with
`checks/package_plugin.py` or install the directory with `node scripts/plugin.mjs install` on a Studio box.

Version 0.5.1 uses the current platform-served Studio Kit CSS, the documented label/field and dialog-heading markup, token-based selectable file rows, and Kit loading/empty/error/warning components. The CAD engine's own canvas UI is unchanged. Real `PS-6-2F2.dwg` plus its original `YA_LI.dwg` were imported through the existing sandboxed plugin converter: the reference was embedded and the output DWG reopened with no remaining XREFs. Detailed evidence is in `deploy/drawing-library-integration.md`.

Version 0.5.0 opens CAD files only from the drawing library subtree (`plugin_id: sheet-versions`). Save uploads a new version with the original exact filename and serial number. DWG working copies are converted back to actual DWG by this plugin's own sandboxed backend; DrawingBox's backend is never called. Missing source metadata, conflicting versions, ambiguous working names and failed verification retain the save rather than guessing a destination. See `deploy/drawing-library-integration.md` for evidence and current acceptance limits.

Version 0.4.2 gives the desktop menu bar a 34-pixel height and six pixels of vertical inset. A geometry check renders actual Traditional Chinese menu labels with the bundled font and checks glyph clearance against the painted panel. Restoring the original 22-pixel bar without vertical inset fails that check. Reader layout is unchanged.

Version 0.4.1 replaces the interface font with IBM Plex Sans TC Light 1.1.1 (SIL OFL 1.1). The complete hinted TTF is pinned by commit and SHA-256, weighs 5,495,692 bytes, and replaces the previous 15,267,616-byte calligraphic font. The translated display-text coverage check passed. This is an interface font, not a replacement for DWG text-font processing.

Version 0.4.0 backports Traditional Chinese from PR 529 at `6f79ef7782de76d5ac9f3ef9f3a3c02070219aa5` without upgrading the CAD engine. Auto selects Traditional Chinese for `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant`; explicit choices remain saved. Reader controls use the same catalog. English command IDs, filenames, drawing text and layout identifiers remain unchanged. The Studio Open dialog remains English.

To reproduce, fetch `pull/529/head:pr-529` after cloning 0.6.2, run `checks/apply_reader.py`, then `checks/apply_localization.py` once, followed by the existing build/prepare scripts. The font is downloaded to the cache volume and checked against its pinned SHA-256. License and attribution accompany the shipped assets. See `deploy/localization-validation.md` for verification and the upstream native-font test failure.

Version 0.3.3 checks that all three document APIs exist before loading the folder picker. A missing or partial document service shows a recovery message and disables selection without throwing. The document source is a platform capability, not a dependency on the folders UI Skill. A separate Skill-availability/dependency contract has been requested in `deploy/framework-dependency-request.md`; no undocumented manifest field or Skill ID is assumed.

Version 0.3.2 keeps the App shell on Studio folders even in wide landscape, using the existing `studio.env().shell` UX signal. The web desktop retains Local files. CAD rows show listed version and byte size; empty files cannot be selected. Checkbox rows have a 44-pixel label hit area.

Version 0.3.1 routes narrow-screen Open to the project's Studio folders, using read-only `studio.docs.tree/list/fetch`. Users select a folder and one or more CAD files (primary first, followed by references); listed versions are fetched explicitly and passed through the existing DWG/DXF importer. Project changes close the picker and late fetch results are discarded. Metadata and actual bytes are limited to 30 MiB. Desktop Open offers Local files and Studio folders. Reader Open is a 64 × 44 blue button with white text. A separately named drawing-library source is not mapped until the owner confirms what library is intended.

Version 0.3.0 uses one live CADCraft workspace with responsive modes: below 768 logical pixels it exposes only Open, Fit, Layers, drawing selection and Model/Layout selection. Primary drag pans; the existing pinch path zooms. Menus, command entry, editing clicks and Save/Export are unavailable in reader mode. Returning to a wide workspace restores the desktop UI without reloading documents or resetting views. Layer visibility is a render-only override and resets on document/mode changes; originally off/frozen layers remain unavailable. Existing unsaved edits remain guarded by Studio.

The reader requires a small pinned source adaptation, not CSS hiding. `vendor-patches/reader.rs` and `checks/apply_reader.py` contain the adaptation to upstream tag `v0.6.2`. Clone that tag into `/Volumes/Vibe-Temp/cadcraft-integration/source-0.6.2`, run the apply script once on clean source, install wasm-bindgen-cli 0.2.129 into the cache tools directory, then run `checks/build_reader.py` and `checks/prepare_vendor.py`. Rust build artifacts remain on the cache volume. Upstream updates require reapplying and checking this adaptation; the update monitor must not replace it automatically. Browser emulation verifies responsiveness and gestures; physical iOS/Android acceptance remains separate.

Version 0.2.6 removes the duplicate Studio bottom actions. CADCraft's own Open picker delegates to the Studio DWG/DXF import dialog; selected reference files can be reopened there. Download retries remain available in the error dialog. Workspace height subtracts the body's computed vertical margins/padding from the SDK visible band. Authenticated production measures iframe bottom 840px against an 840px viewport; native CAD controls remain fully visible. Native Open delegation, eleven tests, five targeted mutations and official Chromium checks pass.

Version 0.2.5 removes the permanent project/Ready status row because the Studio sidebar already owns project context. Status appears only during import/download or when an error requires attention.

Version 0.2.1 adapts the wrapper to the Studio layout contract: host-rendered actions and status, Kit dialogs for file selection and import information, root class `cad-viewer`, and workspace height supplied by `studio.viewport()` / `onViewportChange`. No viewport CSS units, fixed large heights, duplicate product header or permanent help paragraph remain. The official CADCraft workspace stays intact.

Version 0.2.0 embeds the complete official CADCraft 0.6.2 Web workspace, replacing the previous SVG-only preview. All upstream menus remain available: drawing, modification, layers, properties, dimensions, layouts, comparison, Save and Export. Availability does not mean every upstream command is implemented or every drawing is supported.

CAD and PDF remain separate plugins, manifests, backends and versions. The PDF `sheet-versions` plugin is unchanged. No Jobdone cloud integration is added. CAD reuses Studio assertion source without loading the PDF API, database, AI pipeline or PDF processing dependencies.

## Opening and saving

- One DXF opens directly in WASM. Select a DWG together with related DWG/DXF references for the local native importer.
- DWG becomes a DXF working copy. Loaded references are bound into that copy because WASM cannot read the filesystem. Missing references are reported; original files are unchanged.
- Use the original workspace for zoom, pan, editing and Layout switching. Compare requires another drawing already open; filesystem paths are unavailable in WASM.
- Save uses the official `?host=parent` bridge and `studio.docs.upload`, preserving the original name, folder and serial number. DWG is converted in the plugin backend before upload; DXF stays DXF. The plugin then fetches the new version and verifies its bytes. Earlier versions remain in Studio history.
- PDF/PNG/SVG exports retain the existing download flow. Renamed Save As or new drawings without an opened library source do not guess a library destination.
- Failed saves stay queued and keep Studio's dirty guard enabled until retried. Upstream marks Save complete when bytes are sent; only the wrapper confirms upload. A failed post-upload check requires inspecting the library before retrying.

## Limits

Native DWG import/output currently requires macOS and sandbox-exec isolation. Other platforms require equivalent isolation before enabling DWG conversion. Browser DXF editing uses official WASM. Selected inputs and generated drawings are limited to 30 MiB. One conversion runs at a time, with at most two 50-second converter passes; manifest timeout is 120 seconds.

CADCraft remains alpha. SHX fonts, unsupported objects and complex DWGs can render incompletely. Real `PS-2-01-P01FL_240506.dwg` with `YA_LI.dwg` now shows its frame and lower table, but Chinese glyphs and some red filled shapes remain incorrect. Rendering fidelity is not verified.

## Structure and interface

- Frontend: `plugin/cad-viewer/`; backend: `dotnet/src/CadViewer.Api/`, loopback port 8971. PDF retains port 8970.
- `POST import?primary=<filename>` accepts multipart `files`, returning `{name,data,warnings}` with base64 DXF.
- `X-Studio-Assertion` requires audience `cad-viewer` and a project. PDF assertions are rejected.
- Configuration: `CadViewer__DataDir`, `CadViewer__StudioBaseUrl`, `CadViewer__CadcraftCli` (absolute path).
- `dotnet/tools/CadPreviewProbe` and `dev/serve-dev.mjs` use mocked Studio identity for development. Never install the probe as the production backend.

Official release: https://github.com/storytold/cadcraft/releases/tag/v0.6.2

Verified archive SHA256:

- CLI macOS universal: `2ffe9b0a0169810e3177e4f1119807e04fb4ea96efe5e3e1599cea52b25c87a1`
- Web: `9d27c10b3c9101df894e44867bba46c644f23f7b4e05bd2c743762fb49509e7b`

`checks/prepare_vendor.py` retains original WASM/licenses and moves inline bootstrap to an external module for Studio CSP. Version 0.2.3 adapts the pinned generated JavaScript host bindings for opaque sandbox origins, as approved in `deploy/framework-answer.md`: exact parent/child Window identity remains required, replies use wildcard targetOrigin, and script integrity is recalculated. The WASM is unchanged. Assets, logs and packages live under `/Volumes/Vibe-Temp/cadcraft-integration/`. Upstream monitoring notifies without automatically replacing pinned assets.

## Verification

```sh
npm --prefix plugin/cad-viewer test
npm --prefix plugin/cad-viewer run build
python3 -B plugin/cad-viewer/checks/check_mutations.py
CADCRAFT_TEST_CLI=/absolute/path/to/cadcraft-cli dotnet test dotnet/tests/CadViewer.Tests/CadViewer.Tests.csproj
```

2026-10-14: four frontend and eight backend tests passed, zero skipped. Four targeted mutations were rejected. Type checking and build passed. Browser verification covers the full workspace, real DWG plus bound reference, Layout access, circle drawing, object selection and actual DXF download containing the circle. Comparison menu is present, but comparison results are not validated: automated command entry did not resolve the other document. All upstream commands remain exposed.

This uses the development SDK and real WASM/converter. Installed Studio acceptance remains pending. Original PDF source/manifest/version are unchanged; its separate checks passed 64 frontend and 34 backend tests with zero skipped during the split.

## M2 installation — 2026-10-14

`cad-viewer@0.2.1` is installed through the official Studio5 operator CLI on M2. Strict lint is clean; imported-code information is reported for Vue and official CADCraft assets. The official Chromium check passes at 320/375/1024px, with no console errors, network failures or rejected SDK bridge calls.

Backend: `/Users/jobdone/cad-viewer/app`, converter: `/Users/jobdone/cad-viewer/vendor`, data/logs: `/Users/jobdone/cad-viewer/data` and `/Users/jobdone/cad-viewer/logs`. LaunchAgent: `cc.jobdoing.cad-viewer`, configured by `deploy/cc.jobdoing.cad-viewer.plist`. The backend listens only on `127.0.0.1:8971`; unauthenticated import returns 401. Studio health returns 200. Existing PDF service is untouched.

The actual public Studio5 page redirects to Jobdone login. Authenticated sidebar, DWG import and download acceptance are pending user login; the headless check alone does not establish those outcomes.

## Authenticated M2 acceptance — 2026-10-14, version 0.2.4

The earlier 0.2.1 pending-login status is superseded. Following `deploy/framework-answer.md`, the plugin fetches the current project explicitly and authenticates CADCraft messages by exact Window identity. Production displays the selected Nan Tian Men project and Ready, with Open CAD enabled, while retaining Studio's original sandbox.

The actual authenticated page imports `PS-2-01-P01FL_240506.dwg` plus `YA_LI.dwg` through Studio; the production backend reports HTTP 200. Save downloads `PS-2-01-P01FL_240506.dxf` (1,301,137 bytes). The native CLI reads this downloaded DXF successfully and finds Layouts `2-01` and `3-01`. The original DWG matches the pre-test copy byte for byte. Screenshot: `/Volumes/Vibe-Temp/cadcraft-integration/logs/studio-cad-accepted.jpg`.

Browser-selected native File objects failed during host fetch before reaching the CAD backend. Version 0.2.4 materializes their bytes into Blob parts before SDK multipart delivery. Tests verify byte/filename/project preservation and rejection of unreadable or canceled input. Eleven frontend tests, type checking, build and the official strict/Chromium checks pass; the four focused bridge mutations were rejected. Rendering/font limitations remain as described above; this acceptance does not certify every upstream CAD command.
