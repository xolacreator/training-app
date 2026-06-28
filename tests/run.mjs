#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 0 REGRESSION RUNNER
//
//   node tests/run.mjs            # update snapshots + print metrics report
//   node tests/run.mjs --check    # compare against committed snapshots, fail on diff
//   LIVE=1 node tests/run.mjs     # (future) call the real AI per benchmark
//
// For each benchmark athlete it records:
//   • prompt   — the exact system+user generation prompt (what our coaching logic
//                produces today; future phases must change this intentionally)
//   • program  — the normalized program after the real pipeline (volatile id/date stripped)
//   • metrics  — coaching-quality analysis (the benchmark "score")
// Snapshots live in tests/snapshots/<key>.json.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BENCHMARKS } from './benchmarks/athletes.mjs';
import { launchApp, runBenchmark, synthProgram, stripVolatile, analyzeProgram } from './lib/harness.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dir, 'snapshots');
const CHECK = process.argv.includes('--check');
if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });

const stable = (o) => JSON.stringify(o, Object.keys(o).length ? undefined : undefined, 2);
function diffKeys(a, b, path = '') {
  const out = [];
  const ak = a && typeof a === 'object' ? Object.keys(a) : [];
  const bk = b && typeof b === 'object' ? Object.keys(b) : [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path||'(root)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return out;
  }
  for (const k of new Set([...ak, ...bk])) out.push(...diffKeys(a?.[k], b?.[k], path ? `${path}.${k}` : k));
  return out;
}

const { browser, page } = await launchApp();
const report = [];
let failures = 0;

for (const bench of BENCHMARKS) {
  const fixture = synthProgram(bench.config);
  let snap;
  try {
    const { prompt, program } = await runBenchmark(page, bench, fixture);
    if (!program) throw new Error('generation returned no program');
    snap = { key: bench.key, label: bench.label,
      prompt: { system: prompt?.system || '', user: prompt?.user || '' },
      program: stripVolatile(program),
      metrics: analyzeProgram(program) };
  } catch (e) {
    console.error(`✗ ${bench.label}: ${e.message}`);
    failures++; continue;
  }

  const file = join(SNAP_DIR, `${bench.key}.json`);
  const serialized = JSON.stringify(snap, null, 2);
  if (CHECK) {
    if (!existsSync(file)) { console.error(`✗ ${bench.label}: no snapshot to check against`); failures++; }
    else {
      const prev = JSON.parse(readFileSync(file, 'utf8'));
      const d = diffKeys(prev, snap);
      if (d.length) { console.error(`✗ ${bench.label}: ${d.length} change(s)`); d.slice(0,8).forEach(x=>console.error('   '+x)); failures++; }
      else console.log(`✓ ${bench.label}: unchanged`);
    }
  } else {
    writeFileSync(file, serialized);
    console.log(`• wrote ${bench.key}.json`);
  }

  const m = snap.metrics;
  report.push({
    Athlete: bench.label,
    Type: m.type, Wks: m.weeks, 'S/wk': m.sessionsPerWeek,
    Mix: `S${m.disciplineMix.strength}/E${m.disciplineMix.endurance}/F${m.disciplineMix.fitstop}`,
    'Easy%': m.endurance.easyRatio === null ? '—' : Math.round(m.endurance.easyRatio*100)+'%',
    Deload: m.progression.deloadPresent ? 'Y' : 'N',
    Concur: m.concurrencyFlags.length,
    Valid: (m.structural.dayMapValid && m.structural.allIdsResolve && m.structural.spwMatchesDayMap && m.structural.weeklyProgCoversWeeks) ? 'OK' : 'BAD',
  });
}

await browser.close();

console.log('\n── Benchmark metrics ' + '─'.repeat(40));
console.table(report);
const realErrs = page.__realErrors();
if (realErrs.length) { console.error('\nJS errors during run:'); realErrs.slice(0,5).forEach(e=>console.error('  '+e)); failures++; }

console.log(`\n${CHECK ? 'Check' : 'Snapshot update'} complete — ${report.length}/${BENCHMARKS.length} benchmarks processed${failures?`, ${failures} issue(s)`:''}.`);
process.exit(failures ? 1 : 0);
