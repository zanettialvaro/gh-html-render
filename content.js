// Scans GitHub comments for the gh-html-render marker and injects an
// "Open rendered preview" button. The standard is defined in README.md.
//
// Detection contract:
//   1. A <details> element whose <summary> visible text contains the literal
//      token `gh-html-render:v1`.
//   2. That <details> contains at least one fenced ```html code block. The
//      first such block (by document order) is the payload.
//
// We deliberately do NOT scope detection by "comment body" selectors:
// GitHub's React-based issue UI uses CSS-module hashed class names
// (`IssueCommentViewer-module__IssueCommentContent__*`) that drift. Scanning
// for the marker on <details> directly is stable across UI rewrites.

const STANDARD_TOKEN = "gh-html-render:v1";

// Selectors for the rendered <pre> of an ```html fenced block. Covers both
// GitHub UIs (classic linguist scope `source.html`, new scope `text.html.basic`)
// and Prism/highlight.js conventions used by some plugins.
const HTML_FENCE_SELECTOR = [
  ".highlight-text-html-basic pre",
  ".highlight-source-html pre",
  "pre > code.language-html",
  "pre > code[class*='language-html']",
].join(", ");

const BUTTON_CLASS = "gh-html-render-btn";
const PROCESSED_ATTR = "data-gh-html-render-processed";

function extractHtmlFence(detailsEl) {
  const node = detailsEl.querySelector(HTML_FENCE_SELECTOR);
  if (!node) return null;
  // textContent (not innerText) — innerText returns "" for collapsed <details>
  // because the content isn't rendered. The recommended marker shape uses a
  // collapsed <details>, so innerText would silently extract empty payloads.
  return node.textContent;
}

function findPayload(detailsEl) {
  if (detailsEl.hasAttribute(PROCESSED_ATTR)) return null;
  const summary = detailsEl.querySelector(":scope > summary");
  if (!summary || !summary.textContent.includes(STANDARD_TOKEN)) return null;
  return extractHtmlFence(detailsEl);
}

function makeButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${BUTTON_CLASS} btn btn-sm`;
  btn.textContent = "Open rendered preview ↗";
  btn.title = `Recognized standard marker: ${STANDARD_TOKEN}`;
  btn.style.marginLeft = "8px";
  btn.style.verticalAlign = "middle";
  return btn;
}

function attach(detailsEl) {
  const html = findPayload(detailsEl);
  if (!html) return;
  detailsEl.setAttribute(PROCESSED_ATTR, "1");

  const summary = detailsEl.querySelector(":scope > summary");
  if (!summary) return;

  const btn = makeButton();
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Opening…";
    chrome.runtime.sendMessage({ type: "render-html", html }, (resp) => {
      btn.disabled = false;
      btn.textContent = original;
      if (!resp || !resp.ok) {
        console.error("[gh-html-render] background error:", resp);
      }
    });
  });

  summary.appendChild(btn);
}

function scan() {
  document.querySelectorAll(`details:not([${PROCESSED_ATTR}])`).forEach(attach);
}

scan();

// On any subtree mutation, re-scan the whole document. The PROCESSED_ATTR
// filter makes this O(new <details> elements), which is cheap. An earlier
// version only scanned the added node — but GitHub's React UI sometimes
// mutates by adding the <pre> inside an existing <details>, so the added
// node was the <pre> (not a <details>) and the scan missed it.
const observer = new MutationObserver(() => scan());
observer.observe(document.body, { childList: true, subtree: true });
