# Hybrid Training App v3

A progressive web app (PWA) for tracking a 12-week hybrid training program.

## What's in v3
- **Smart logging** — session type drives the form: run splits (any time format), strength sets/reps/weight (kg or lbs), erg metrics (distance, time, split, watts, calories), mixed station-by-station logging
- **Session builder** — build or edit any session with warm-up / main set / cool-down blocks, option A/B/C variants, coaching cues and injury flags. Save to plan, save as template, or use directly to log
- **Full session library** — all 12 weeks × 7 days with warm-up → main set → cool-down breakdowns
- **5 screens** — Today, Log, Plan, Stats, More
- **Dark / light mode** — toggle in top right
- **Garmin CSV import** — deduplicates on re-import
- **PWA** — add to iPhone home screen from Safari

## GitHub Pages setup
1. Upload `index.html` to your repository root
2. Settings → Pages → Deploy from main / root
3. Open URL in Safari → Share → Add to Home Screen

## Session logging categories
- **Run** — splits table with auto pace calculation, total distance + time
- **Strength** — exercises, sets, reps, weight (kg/lbs)
- **Erg** — SkiErg / Row / Bike: distance, time, split/500m, watts, calories
- **Mixed** — station-by-station (run, erg, bodyweight per station)
- **Other** — duration + HR + notes

## Time formats accepted
:SS.ms · MM:SS · MM:SS.ms · HH:MM:SS · HH:MM:SS.ms
