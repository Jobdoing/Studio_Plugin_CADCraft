// Development-only shell approximation; production controls are rendered by Studio.
const bar = document.createElement("nav");
document.body.style.margin = "0";
bar.style.display = "flex";
bar.style.alignItems = "center";
bar.style.gap = "var(--space-1)";
bar.setAttribute("aria-label", "Studio actions");
const resize = () => window.__studioMock.setViewport({ top: 0, height: window.innerHeight - bar.getBoundingClientRect().height });
window.studio.toolbar.set = payload => {
  bar.replaceChildren();
  for (const item of payload.bottom ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kit-button" + (item.primary ? "" : " kit-button--secondary");
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    button.onclick = () => window.__studioMock.toolbarAction({ kind: "action", itemId: item.id });
    bar.append(button);
  }
  const status = document.createElement("span");
  status.className = "kit-status-line";
  status.style.minWidth = "0";
  status.style.flex = "1";
  status.style.overflow = "hidden";
  status.style.whiteSpace = "nowrap";
  status.style.textOverflow = "ellipsis";
  status.setAttribute("role", "status");
  status.textContent = payload.status?.text ?? "";
  bar.append(status);
  document.body.append(bar);
  resize();
};
window.studio.toolbar.clear = () => bar.remove();
window.addEventListener("resize", resize);
