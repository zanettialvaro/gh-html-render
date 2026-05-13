// Receives HTML payloads from the content script, stashes them in local
// storage with a TTL keyed by a random id, opens viewer.html?id=<id> in a
// new tab. The viewer reads its payload back and renders it in a sandboxed
// iframe — so user-controlled HTML never executes in the extension origin
// and never has access to github.com cookies.
//
// Storage choice: chrome.storage.local with a 24h TTL on each entry. local
// (not session) so a bookmarked viewer URL still resolves after a browser
// restart within the TTL window. The tab-close handler still wipes the
// payload eagerly; the TTL is a backstop for orphaned entries (browser
// crashes, bookmarked-then-closed tabs, etc.).

const PAYLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sweepExpired() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("payload:")) continue;
    if (value && typeof value === "object" && typeof value.expiresAt === "number") {
      if (value.expiresAt <= now) stale.push(key);
    } else {
      // Unrecognized shape (e.g., pre-TTL entry from an older build). Drop it.
      stale.push(key);
    }
  }
  if (stale.length) await chrome.storage.local.remove(stale);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "render-html") return;
  (async () => {
    try {
      if (typeof msg.html !== "string" || msg.html.length === 0) {
        throw new Error("empty html payload");
      }
      await sweepExpired();
      const id = randomId();
      await chrome.storage.local.set({
        [`payload:${id}`]: { html: msg.html, expiresAt: Date.now() + PAYLOAD_TTL_MS },
      });
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
  // The tab→payload mapping lives in session storage (cheap, doesn't need to
  // survive restarts — if the tab is closing in this session, we know it).
  const { [`tab:${tabId}`]: payloadId } = await chrome.storage.session.get(
    `tab:${tabId}`
  );
  if (payloadId) {
    await chrome.storage.local.remove(`payload:${payloadId}`);
    await chrome.storage.session.remove(`tab:${tabId}`);
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "viewer-bound") return;
  if (sender.tab?.id && msg.id) {
    chrome.storage.session.set({ [`tab:${sender.tab.id}`]: msg.id });
  }
});
