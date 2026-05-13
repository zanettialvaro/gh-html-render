// Receives HTML payloads from the content script, stashes them in session
// storage keyed by a random id, opens viewer.html?id=<id> in a new tab.
// The viewer reads its payload back from session storage and renders it in a
// sandboxed iframe — so user-controlled HTML never executes in the extension
// origin and never has access to github.com cookies.

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "render-html") return;
  (async () => {
    try {
      if (typeof msg.html !== "string" || msg.html.length === 0) {
        throw new Error("empty html payload");
      }
      const id = randomId();
      await chrome.storage.session.set({ [`payload:${id}`]: msg.html });
      const url = chrome.runtime.getURL(`viewer.html?id=${id}`);
      await chrome.tabs.create({ url });
      sendResponse({ ok: true, id });
    } catch (err) {
      console.error("[gh-html-render] failed:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { [`tab:${tabId}`]: payloadId } = await chrome.storage.session.get(
    `tab:${tabId}`
  );
  if (payloadId) {
    await chrome.storage.session.remove([`payload:${payloadId}`, `tab:${tabId}`]);
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "viewer-bound") return;
  if (sender.tab?.id && msg.id) {
    chrome.storage.session.set({ [`tab:${sender.tab.id}`]: msg.id });
  }
});
