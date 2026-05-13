# gh-html-render

Chrome (MV3) extension that recognizes a standard marker in GitHub issue/PR
comments and opens the embedded HTML in an isolated, sandboxed tab.

GitHub's markdown sanitizer strips `<script>` and most styling from comments,
so you can't render rich HTML inline. This extension is the missing piece:
post the HTML as a fenced `html` block with a marker, and reviewers who have
the extension installed get a "Open rendered preview ↗" button on the comment.

## The standard: `gh-html-render:v1`

A GitHub comment is treated as a renderable HTML embed if and only if:

1. The rendered comment body contains the literal token **`gh-html-render:v1`**
   as visible text. HTML comments (`<!-- ... -->`) are stripped by GitHub's
   sanitizer, so the token must live in real text. Wrapping it in `<code>` is
   conventional.
2. The comment contains at least one fenced `html` code block. The **first**
   such block is the payload.

Both posting tools and the extension MUST follow this contract. The version
suffix is intentional — `v2` will be a new opt-in, not a breaking change to
`v1`.

### Recommended comment shape

````markdown
<details>
<summary>📄 <code>gh-html-render:v1</code> — Interactive HTML version (save as <code>plan.html</code> and open in a browser, or install <a href="https://github.com/zanettialvaro/gh-html-render">gh-html-render</a> to render in place)</summary>

```html
<!doctype html>
<html>
  <!-- your full standalone document here -->
</html>
```

</details>
````

Properties this shape gives you:
- Collapsed by default (clean comment thread).
- Token visible in the summary so the marker survives sanitization.
- Source code is still readable as a copy-pasteable fenced block.
- The extension binds the button to the `<summary>` for natural placement.

## Security model

User-controlled HTML never executes in the extension origin and never has
access to `github.com` cookies or DOM.

Pipeline:
1. Content script reads the fenced HTML text from the rendered comment.
2. Sends it to the background service worker, which stores it in
   `chrome.storage.local` keyed by a random 128-bit id with a 24h TTL.
3. Opens `viewer.html?id=<id>` in a new tab. The viewer is an extension page
   (`chrome-extension://<id>/viewer.html`) — different origin from
   `github.com`.
4. The viewer hands the payload to a manifest-declared sandboxed page
   (`sandbox.html`) via `postMessage`. The sandboxed page runs in an opaque
   origin with a relaxed CSP that permits inline scripts but blocks
   `chrome.*` APIs and same-origin access to the parent viewer. Before
   rendering, the sandbox injects a capture-phase click handler that
   retargets cross-document anchors to `target="_blank"` (the iframe lacks
   `allow-top-navigation`, so an inline navigation to a frame-blocking site
   like github.com would otherwise blank the preview). Fragment links and
   user-set targets pass through untouched.
5. The payload is wiped from local storage when the viewer tab closes; the
   24h TTL is a backstop for orphaned entries (browser crash, bookmarked
   viewer URL, etc.). Bookmarking a viewer tab within the TTL window works;
   after expiry the viewer shows "Payload expired".

## Install (unpacked)

1. `chrome://extensions`
2. Toggle "Developer mode" on.
3. "Load unpacked" → pick this directory.
4. Visit a GitHub comment that follows the standard. A button appears in the
   summary line.

## Authoring template: `templates/base.html`

A canonical starting point for new gh-html-render documents. Ships:

- GitHub-aligned dark design tokens (matches the viewer chrome).
- A fixed pill taxonomy: `warn` (Plan/Proposal), `good` (Decision/Demo),
  `bad` (Postmortem), `note` (Investigation/Status), default neutral.
- A heading auto-linker — every `<h1..h4 id="...">` gets a clickable `§`
  prefix that links to its own id, so reviewers can deep-link sections.
- Banner / callout variants in the same four-color taxonomy.

The companion skill reads this file when it produces HTML for posting, so
generated comments stay visually consistent.

## Posting side: `skills/gh-html-comment/`

A Claude Code skill that emits comments in the canonical shape lives at
[`skills/gh-html-comment/SKILL.md`](skills/gh-html-comment/SKILL.md). It:

- Wraps the payload in the recommended shape above.
- Emits the token `gh-html-render:v1` verbatim (inside `<code>` in the
  `<summary>`).
- Keeps the fenced block as the *first* `html` fence in the comment.
- Refuses to post if the HTML contains external `<script src>` / `<link href>`
  (the sandbox iframe runs at null origin and won't reliably load them) or if
  the assembled body exceeds GitHub's 65 KB comment cap.
- Has both natural-language triggers ("post an HTML comment on issue #N",
  "share this as a rich HTML comment", "wrap this in a gh-html-render
  comment") and an explicit `/gh-html-comment` slash command.

To activate in Claude Code, symlink it into your user skills directory:

```bash
ln -s "$(pwd)/skills/gh-html-comment" ~/.claude/skills/gh-html-comment
```

Edits to the skill happen in this repo (versioned alongside the standard);
Claude Code follows the symlink to discover it.
