---
name: gh-html-comment
description: Post an interactive HTML rendering as a GitHub issue or PR comment using the gh-html-render:v1 standard. Triggers on natural-language requests like "post an HTML comment on issue/PR #N", "share this as a rich/interactive HTML comment on GitHub", "wrap this in a gh-html-render comment", "post an embedded HTML preview comment", or any explicit /gh-html-comment invocation. Pairs with the gh-html-render Chrome extension, which renders these comments in-place; reviewers without the extension see the raw HTML and can save+open it locally.
allowed-tools: Bash(gh *), Bash(wc *), Bash(jq *), Read, Write
argument-hint: "<owner>/<repo>#<issue-or-pr-number>"
---

# Post a `gh-html-render:v1` GitHub comment

Companion to the [gh-html-render](https://github.com/zanettialvaro/gh-html-render) Chrome extension. The extension detects the marker in this skill's output and renders the embedded HTML in a sandboxed extension-origin tab.

This skill's job: take or produce a standalone HTML document, wrap it in the canonical comment shape, and post (or edit) the comment via `gh api`.

## The standard (`gh-html-render:v1`)

A GitHub comment is recognized iff:
1. The rendered comment body contains the literal token **`gh-html-render:v1`** as visible text. HTML comments (`<!-- … -->`) are stripped by GitHub's sanitizer, so the marker must live in real text — by convention inside `<code>` in the `<summary>`.
2. The body contains at least one fenced ` ```html ` code block. The **first** such block is the payload.

## Canonical shape (emit this exactly, varying only the summary suffix and the HTML payload)

````markdown
<details>
<summary>📄 <code>gh-html-render:v1</code> — Interactive HTML version (save as <code>plan.html</code> and open in a browser, or install the gh-html-render extension to render in place)</summary>

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>…</title>
  <style>/* inline styles */</style>
</head>
<body>
  …
  <script>/* inline scripts */</script>
</body>
</html>
```

</details>
````

The outer fence must have **strictly more backticks than any backtick sequence inside the HTML**. Four backticks is the default. If the HTML contains four-backtick sequences (rare), bump to five.

## Pre-flight (run BEFORE posting, surface failures to the user)

1. **Standalone document.** Starts with `<!doctype html>` and is a complete `<html>…</html>`. The renderer doesn't merge into surrounding pages — it loads the document as-is into a sandboxed iframe.
2. **Inline only.** No `<script src="…">`, no `<link rel="stylesheet" href="…">`, no `<img src="https://…">` for required visuals. The sandbox iframe has a null origin with no `allow-same-origin`; many external requests are blocked. Inline scripts, inline `<style>` blocks, inline SVG, and `data:` images are all fine.
3. **No secrets.** Posted to a GitHub thread (durable, indexed, potentially public). Strip API keys, tokens, internal hostnames, customer data, anything that shouldn't leak.
4. **Comment size.** GitHub caps issue/PR comments at 65,536 bytes. `wc -c` the assembled body before posting. If too large, split the HTML into multiple comments — each is independently renderable as long as each contains its own marker + fence.
5. **Fence length.** Count consecutive backticks in the HTML. Outer fence > inner max. Four backticks is the default.

## Posting

Use `gh api` with the body delivered via stdin (a temp file or heredoc) — never `-f body="…"`, escaping is unreliable for HTML.

**New comment:**
```bash
gh api -X POST repos/<owner>/<repo>/issues/<n>/comments \
  -f body=@- < /tmp/comment-body.md
```
(For PRs, use the same `/issues/<n>/comments` endpoint — PRs are issues for the comment API.)

**Edit existing comment** (e.g., iterating on a previously-posted preview):
```bash
gh api -X PATCH repos/<owner>/<repo>/issues/comments/<comment-id> \
  -f body=@- < /tmp/comment-body.md
```

Or build the JSON via `jq` and use `--input`:
```bash
jq -Rs '{body: .}' /tmp/comment-body.md > /tmp/comment-patch.json
gh api -X PATCH repos/<owner>/<repo>/issues/comments/<id> --input /tmp/comment-patch.json
```

Note: editing or posting to a production-repo comment may hit Claude Code's auto-mode confirmation. If so, surface the diff to the user and let them re-confirm — don't try to bypass.

## Flow when invoked

1. **Identify the target.** Parse `<owner>/<repo>#<n>` from the argument; if missing, ask. Distinguish new comment vs. editing an existing one (the user usually says "post" vs. "edit"; an existing comment id appears as `?` in the URL anchor `#issuecomment-<id>`).
2. **Get or produce the HTML.** Either accept a file path / pasted document, or produce one from a description. If producing, keep the structure focused: clear title, one-paragraph problem statement, one or two interactive visuals (toggles, click-to-expand sections), well-organized supporting detail. Lean into interactivity — that's what justifies the rich format over plain markdown.
3. **Pre-flight.** Run all five checks. If any fails, fix and re-check rather than posting a broken comment.
4. **Assemble the body.** Write the full markdown (canonical shape + payload) to a temp file like `/tmp/comment-body.md`. The summary line may vary in suffix wording, but the `<code>gh-html-render:v1</code>` token must be present.
5. **Post (or edit).** Use the `gh api` command with stdin/`--input` from step above. Capture the response.
6. **Report back.** Print the comment's `.html_url`. Remind the user: reviewers with the [gh-html-render extension](https://github.com/zanettialvaro/gh-html-render) installed see an "Open rendered preview ↗" button on the `<summary>`. Reviewers without the extension see the raw HTML source inside a collapsed `<details>` — they can copy it into a local `.html` file and open it.

## When NOT to use this skill

- For ordinary markdown comments. Plain `gh api … -f body=…` is the right tool.
- For long-form prose that doesn't benefit from interactivity. Markdown is fine and reviewers don't need any extension.
- For anything containing secrets, even transiently. Comments are durable and indexed.

## Related

- Extension source and standard reference: `gh-html-render/README.md` (this skill lives in the same repo at `skills/gh-html-comment/`).
- Symlinked into `~/.claude/skills/gh-html-comment/` for Claude Code discovery — edit the repo file, not the symlink target.
