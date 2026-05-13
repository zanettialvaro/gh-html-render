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
   `chrome.storage.session` keyed by a random 128-bit id.
3. Opens `viewer.html?id=<id>` in a new tab. The viewer is an extension page
   (`chrome-extension://<id>/viewer.html`) — different origin from
   `github.com`.
4. The viewer renders the payload inside an
   `<iframe sandbox="allow-scripts allow-popups allow-forms allow-modals">`
   with no `allow-same-origin`. The iframe gets a null opaque origin: scripts
   run, but cannot read the parent (extension page), cannot read
   `chrome-extension://` storage, and cannot reach `github.com`.
5. The payload is wiped from session storage when the viewer tab closes.

## Install (unpacked)

1. `chrome://extensions`
2. Toggle "Developer mode" on.
3. "Load unpacked" → pick this directory.
4. Visit a GitHub comment that follows the standard. A button appears in the
   summary line.

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
