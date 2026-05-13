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
  const result = await chrome.storage.local.get(key);
  const entry = result[key];
  if (!entry || typeof entry.html !== "string") {
    frame.hidden = true;
    err.hidden = false;
    err.textContent = "Payload not found (it may have already been consumed or expired).";
    return;
  }
  if (typeof entry.expiresAt === "number" && entry.expiresAt <= Date.now()) {
    // Backstop in case the background sweep hasn't run yet.
    await chrome.storage.local.remove(key);
    frame.hidden = true;
    err.hidden = false;
    err.textContent = "Payload expired (24h TTL).";
    return;
  }
  const html = entry.html;
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
