# Training App — Claude Code Session Notes

## Current development branch

**Always develop on:** `claude/training-app-updates-yOJGn`

```bash
git checkout claude/training-app-updates-yOJGn
```

## Pushing to GitHub

**Prefer a normal `git push`. It works for `index.html` too** (the historical 503
on large files appears to have been intermittent — test it before reaching for the
script):

```bash
git add index.html && git commit -m "..."
git push -u origin claude/training-app-updates-yOJGn
```

### Why `git push` is preferred over the MCP script

The MCP push script (`scripts/github-push.py`) creates the commit **GitHub-side via
the API**, which means:
- It is authored/committed by `brucesarmento@gmail.com` (the session user), **not**
  `noreply@anthropic.com`, and it is **unsigned** → GitHub marks it **Unverified**,
  and the stop-hook git check flags it on every push.
- It creates a divergent SHA from your local commit, causing the recurring
  "local vs remote diverged" churn (force-resets, re-applying work, etc.).

A plain `git push` pushes your **local** commit as-is, preserving its
`noreply@anthropic.com` author **and** its SSH signature (signing is configured:
`commit.gpgsign=true`, key at `~/.ssh/commit_signing_key.pub`) → GitHub shows it
**Verified**, and local == remote with no divergence.

### Fallback: only if `git push` actually 503s

```bash
# Commit normally, then push via the MCP script (specify branch!):
python3 scripts/github-push.py index.html bruces6 training-app claude/training-app-updates-yOJGn
```
The script reads `CLAUDE_CODE_REMOTE_SESSION_ID` and the session token automatically.
**After using it**, your local branch will diverge from remote — run
`git fetch origin <branch>` and reconcile, and expect the stop-hook to flag the
commit as Unverified (it's a GitHub-API commit, not your signed local one).

### Never use `mcp__github__push_files` for index.html
Passing `"content": ""` to that tool wipes the file on GitHub.

### If the script gets a SHA mismatch error
The remote was updated by another process. Re-run the script — or pass the current
SHA from the error message as the 5th arg:
`python3 scripts/github-push.py index.html bruces6 training-app <branch> <currentSHA>`.

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
