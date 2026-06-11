# Training App — Claude Code Session Notes

## Current development branch

**Always develop on:** `claude/training-app-updates-yOJGn`

```bash
git checkout claude/training-app-updates-yOJGn
```

## Pushing to GitHub

**The git HTTP proxy in this environment returns HTTP 503 on `git push` for large files.**
`git push origin <branch>` will fail silently with a 503 for index.html. Always use the script instead:

```bash
# Commit normally, then push via the MCP script (specify branch!):
git add index.html && git commit -m "..."
python3 scripts/github-push.py index.html bruces6 training-app claude/training-app-updates-yOJGn
```

The script reads `CLAUDE_CODE_REMOTE_SESSION_ID` and the session token automatically — no manual tokens needed.

For small files (e.g. `worker/index.js`, `CLAUDE.md`) you can use `git push -u origin claude/training-app-updates-yOJGn`.

### Never use `mcp__github__push_files` for index.html
Passing `"content": ""` to that tool wipes the file on GitHub. Use the Python script above.

### If the script gets a SHA mismatch error
The remote was updated by another process. Re-run the script — it always fetches the latest SHA first.

## Repo layout

| Path | Purpose |
|------|---------|
| `index.html` | Single-file PWA — all HTML/CSS/JS |
| `worker/index.js` | Cloudflare Worker — Strava OAuth, token refresh, Claude proxy, health sync |
| `scripts/github-push.py` | MCP-based push script (bypasses git proxy 503) |

## Worker environment variables (Cloudflare dashboard)

Set these in **Workers & Pages → training-app-api → Settings → Variables & Secrets**:

| Variable | Value |
|----------|-------|
| `STRAVA_CLIENT_ID` | From Strava developer portal |
| `STRAVA_CLIENT_SECRET` | From Strava developer portal |
| `APP_URL` | `https://bruces6.github.io/training-app` (or wherever the PWA is hosted) |
| `HEALTH_DATA` | KV namespace binding |

If Strava token refresh fails, check these first.

## Key architecture decisions

- All app logic lives in `index.html` — CSS variables for theming, single `<script>` block
- Overlays use `display:flex;flex-direction:column;overflow:hidden` with fixed header + scrollable middle + fixed footer
- Safe area variables (`--sat`, `--sab`, `--sal`, `--sar`) are set via `env(safe-area-inset-*)` with fallbacks
- Claude API calls route through `stravaWorker/claude` proxy when configured (avoids iOS PWA CORS issues)
- Model: `claude-haiku-4-5-20251001`
