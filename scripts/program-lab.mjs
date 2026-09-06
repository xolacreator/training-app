#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM LAB — see what the app actually programmes, without opening the app.
//
// The question this exists to answer is not "does it build a block" but "does it
// build a DIFFERENT block for a different athlete". A coach who asks ten good
// questions and then writes the same week for everyone is not coaching; the
// interview is theatre. This harness makes that visible in one command.
//
//   node scripts/program-lab.mjs                 # every scenario, one-line each
//   node scripts/program-lab.mjs <name>          # one scenario, full block
//   node scripts/program-lab.mjs --diff a b      # do these two differ, and where
//   node scripts/program-lab.mjs --matrix        # every pair — who gets the same plan
//   node scripts/program-lab.mjs --weeks 1,6,12  # which weeks to print
//
// Scenarios live in scripts/lab-scenarios.mjs so adding an athlete is a data edit.
// ─────────────────────────────────────────────────────────────────────────────
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
import { SCENARIOS, LAB_INPUTS } from './lab-scenarios.mjs';

const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const argv = process.argv.slice(2);
const flag = (n, d=null) => { const i=argv.indexOf(n); return i>=0 ? (argv[i+1] ?? true) : d; };
const WEEKS = String(flag('--weeks','1,4,8,12')).split(',').map(n=>parseInt(n)).filter(Boolean);
const DIFF   = argv.includes('--diff');
const MATRIX = argv.includes('--matrix');
const named  = argv.filter(a=>!a.startsWith('--') && SCENARIOS[a]);

const C = { dim:s=>`\x1b[2m${s}\x1b[0m`, b:s=>`\x1b[1m${s}\x1b[0m`,
            g:s=>`\x1b[32m${s}\x1b[0m`, r:s=>`\x1b[31m${s}\x1b[0m`, y:s=>`\x1b[33m${s}\x1b[0m` };

const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page = await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs = []; page.on('pageerror', e=>errs.push(String(e)));
await page.goto(APP, {waitUntil:'load'});

// Build one scenario's block and read back everything worth comparing.
async function run(key){
  const sc = { ...SCENARIOS[key], inputs: (LAB_INPUTS||{})[key] || null };
  return page.evaluate(({sc, WEEKS}) => {
    // ── Reset every store this scenario could inherit from the last one ──────
    ['ht-v4','ht-program','ht-program-week','ht-goal','ht-goal-category','ht-goal-race-type',
     'ht-race-date','ht-coach','ht-baselines','ht-avail','ht-anchor-dismissed','ht-hyrox',
     'ht-training-inputs']
      .forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
    localStorage.setItem('ht-onboarded','true');
    savedProgram = null;
    try { sessions = []; } catch(e){}
    try { AthleteState = null; } catch(e){}

    // ── Install the athlete ─────────────────────────────────────────────────
    coachProfile = { name:'Lab', ...(sc.profile||{}) };
    localStorage.setItem('ht-coach', JSON.stringify(coachProfile));
    if (coachProfile.raceDate) localStorage.setItem('ht-race-date', coachProfile.raceDate);
    if (sc.baselines) { try { localStorage.setItem('ht-baselines', JSON.stringify(sc.baselines)); } catch(e){} }
    if (Array.isArray(sc.sessions) && sc.sessions.length) {
      try { sessions = sc.sessions.slice(); localStorage.setItem('ht-v4', JSON.stringify(sessions)); } catch(e){}
    }
    // What the athlete TOLD the app — the log is manual, so this is the primary source.
    if (sc.inputs) { try { saveTrainingInputs(sc.inputs); } catch(e){} }
    try { if (typeof loadBaselines==='function') loadBaselines(); } catch(e){}
    try { if (typeof load==='function') load(); } catch(e){}
    const goal = (sc.intake && sc.intake.goal) || coachProfile.goal || '';
    try { _syncGoalToEngine(goal); } catch(e){}
    try { recomputeAthleteState(); } catch(e){}

    // ── The interview's conclusions, as the coach would have recorded them ───
    coachMessages = [{ role:'assistant', intake: sc.intake || {} }];

    // ── Build, exactly as the app does ──────────────────────────────────────
    const spec = { goal, weeks:sc.weeks, sessionsPerWeek:sc.sessionsPerWeek,
                   trainDays:sc.trainDays, division:sc.division };
    let prog=null, err=null;
    try { prog = buildBlockForGoal(spec); } catch(e){ err = e.message; }
    if (!prog) return { key:sc.key, label:sc.label, goal, err: err || 'no block produced' };

    saveProgramData(prog);
    try { recomputeAthleteState(); } catch(e){}
    const totalW = (prog.weeklyProgressions||[]).length || prog.weeks || 8;

    const weekOf = (w) => {
      const wp = (prog.weeklyProgressions||[])[w-1] || {};
      const slots = (_progWeekSessions(w)||[]).filter(s=>s.session);
      return {
        n:w,
        phase:(typeof _phaseForWeek==='function') ? _phaseForWeek(w,totalW,prog) : '',
        note:wp.note||'', deload:!!wp.deload,
        days: slots.map(s=>({
          day:s.day, name:s.session.name,
          rx:(()=>{ try { return _sessSummary(s.session, w) || ''; } catch(e){ return ''; } })(),
        })),
      };
    };
    const weeks = WEEKS.filter(w=>w>=1 && w<=totalW).map(weekOf);
    // A fingerprint of the PRESCRIPTION across the whole block — this is what has
    // to differ between athletes for the programming to be personal.
    const fingerprint = Array.from({length:totalW},(_,i)=>weekOf(i+1))
      .map(w=>w.days.map(d=>`${d.day}|${d.name}|${d.rx}`).join(';')).join('||');

    return { key:sc.key, label:sc.label, goal,
             name:prog.name, engine:prog.engine, type:prog.type,
             weeks:prog.weeks, totalW, spw:prog.sessionsPerWeek,
             builtFor:prog.builtFor, hyrox:!!prog.hyrox,
             paces:(typeof _runPaces==='function') ? _runPaces() : null,
             athlete:(typeof athleteTrainingState==='function') ? (()=>{ const s=athleteTrainingState();
               return { weeklyKm:s.weeklyKm, longestKm:s.longestKm, trainingAge:s.trainingAge,
                        sources:Object.fromEntries(Object.entries(s.fields).map(([k,v])=>[k,v.source])) }; })() : null,
             gate:(typeof _intensityGate==='function') ? _intensityGate() : null,
             sessionCount:(prog.sessions||[]).length,
             weeksOut:weeks, fingerprint };
  }, {sc:{...sc, key}, WEEKS});
}

const line = (r) => r.err
  ? `${C.r('✗')} ${C.b(r.label.padEnd(30))} ${C.r(r.err)}`
  : `  ${C.b(r.label.padEnd(30))} ${String(r.engine||'?').padEnd(9)} ${String(r.totalW+'w').padEnd(5)} ${String(r.spw+'/wk').padEnd(6)} ${C.dim(r.name)}`;

function printBlock(r){
  if (r.err) { console.log(`\n${C.r('✗ '+r.label)} — ${r.err}`); return; }
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`${C.b(r.label)}`);
  console.log(C.dim(`goal: ${r.goal}`));
  console.log(C.dim(`→ ${r.name}  ·  engine: ${r.engine}  ·  ${r.totalW} weeks  ·  ${r.spw}/wk  ·  ${r.sessionCount} session types`));
  if (r.athlete) console.log(C.dim(`  athlete: ${r.athlete.weeklyKm??'?'} km/wk · longest ${r.athlete.longestKm??'?'} km · ${r.athlete.trainingAge??'?'} yr  ${C.dim('('+Object.entries(r.athlete.sources).filter(([,v])=>v!=='none').map(([k,v])=>`${k}:${v}`).join(' ')+')')}`));
  if (r.gate && r.gate.reasons && r.gate.reasons.length) r.gate.reasons.forEach(x=>console.log(C.y('  ⚑ '+x)));
  for (const w of r.weeksOut){
    console.log(`\n  ${C.y(`WEEK ${w.n}`)} ${C.dim(`[${w.phase}]`)}${w.deload?C.dim(' · deload'):''}${w.note?C.dim(' · '+w.note):''}`);
    if (!w.days.length) console.log(C.dim('     (no sessions)'));
    for (const d of w.days) console.log(`     ${d.day}  ${d.name.padEnd(18)} ${C.dim(d.rx)}`);
  }
}

const keys = named.length ? named : Object.keys(SCENARIOS);
const results = {};
for (const k of keys) results[k] = await run(k);

if (DIFF || MATRIX){
  const ks = MATRIX ? Object.keys(results) : named.slice(0,2);
  if (!MATRIX && ks.length<2){ console.log(C.r('--diff needs two scenario names')); }
  const pairs = [];
  for (let i=0;i<ks.length;i++) for (let j=i+1;j<ks.length;j++) pairs.push([ks[i],ks[j]]);
  console.log(`\n${C.b('DOES THE PROGRAMMING ACTUALLY DIFFER?')}\n`);
  let same=0;
  for (const [a,b] of pairs){
    const ra=results[a], rb=results[b];
    if (ra.err||rb.err){ console.log(`  ${C.dim('skip')} ${a} / ${b}`); continue; }
    const identical = ra.fingerprint===rb.fingerprint;
    if (identical) same++;
    console.log(`  ${identical?C.r('IDENTICAL'):C.g('differs  ')}  ${ra.label} ${C.dim('vs')} ${rb.label}`);
    if (!identical && !MATRIX){
      // Show the first week that actually diverges.
      const wa=ra.fingerprint.split('||'), wb=rb.fingerprint.split('||');
      for (let i=0;i<Math.max(wa.length,wb.length);i++){
        if (wa[i]!==wb[i]){
          console.log(C.dim(`     first divergence — week ${i+1}`));
          console.log(C.dim(`       ${ra.label}: ${(wa[i]||'(none)').replace(/;/g,'  ')}`));
          console.log(C.dim(`       ${rb.label}: ${(wb[i]||'(none)').replace(/;/g,'  ')}`));
          break;
        }
      }
    }
  }
  if (pairs.length) console.log(`\n  ${same?C.r(`${same}/${pairs.length} pairs get an IDENTICAL block`):C.g(`all ${pairs.length} pairs differ`)}`);
} else if (named.length){
  for (const k of named) printBlock(results[k]);
} else {
  console.log(`\n${C.b('SCENARIOS')}  ${C.dim('(pass a name for the full block, --matrix to compare)')}\n`);
  for (const k of keys) console.log(line(results[k]));
  console.log(C.dim(`\n  ${keys.length} scenarios · names: ${keys.join(' ')}`));
}

const real = errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
if (real.length) console.log(`\n${C.r('JS errors:')} ${real.slice(0,3).join(' | ')}`);
await browser.close();
