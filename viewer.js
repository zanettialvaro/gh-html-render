(async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const err = document.getElementById("err");
  const frame = document.getElementById("frame");
  const size = document.getElementById("size");

  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    frame.hidden = true;
    err.hidden = false;
    err.textContent = "Missing or invalid id.";
    return;
  }

  try { await chrome.runtime.sendMessage({ type: "viewer-bound", id }); } catch {}

  const key = `payload:${id}`;
  const result = await chrome.storage.session.get(key);
  const html = result[key];
  if (typeof html !== "string") {
    frame.hidden = true;
    err.hidden = false;
    err.textContent = "Payload not found (it may have already been consumed).";
    return;
  }
  size.textContent = `${(new Blob([html]).size / 1024).toFixed(1)} KB`;

  // Deliver the payload to the sandboxed renderer via postMessage. We can't
  // use srcdoc or blob: URLs — both inherit the parent extension page's CSP
  // (script-src 'self'), which blocks inline scripts in the user HTML. A
  // sandboxed extension page (declared in manifest.sandbox.pages) gets its
  // own relaxed CSP plus an opaque origin: scripts execute, but the page
  // has no chrome.* APIs and no same-origin access here.
  const handler = (e) => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type !== "ready") return;
    removeEventListener("message", handler);
    frame.contentWindow.postMessage({ type: "render", html }, "*");
  };
  addEventListener("message", handler);
  frame.src = chrome.runtime.getURL("sandbox.html");
})();
