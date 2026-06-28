// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION HARNESS — Phase 0
//
// Loads the real index.html in a headless browser, seeds a benchmark athlete,
// stubs the AI call (capturing the exact generation PROMPT and returning a
// deterministic fixture program), runs the real post-processing pipeline
// (_normalizeProgram → savedProgram), and analyses the result into coaching-quality
// metrics.
//
// Why stub the AI: program GENERATION is non-deterministic and needs a key. What IS
// deterministic — and is exactly what future phases (knowledge extraction, reasoning,
// validation) change — is (a) the prompt we send, and (b) the deterministic pipeline
// that shapes/validates a program. Those are what we snapshot. A separate optional
// "live" mode (LIVE=1 + a key) runs real generation through the same analyzer.
// ─────────────────────────────────────────────────────────────────────────────
import { pathToFileURL } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const APP_URL = pathToFileURL(new URL('../../index.html', import.meta.url).pathname).href;

// Resolve a Chromium binary: env override, Playwright default, or the sandbox path.
function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = readdirSync(base).find(d => d.startsWith('chromium'));
    if (dir) { const p = `${base}/${dir}/chrome-linux/chrome`; if (existsSync(p)) return p; }
  } catch {}
  return undefined; // let Playwright try its default
}

export async function launchApp() {
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('ht-onboarded','true'); sessionStorage.setItem('mc-shown','1'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: '#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}' });
  await page.evaluate(() => { try { dismissDigest(); } catch {} });
  page.__realErrors = () => errors.filter(e => !/Failed to load resource|ERR_|net::/.test(e));
  return { browser, page };
}

// Deterministic, type-appropriate fixture program in the unified schema. Stands in
// for the AI's output so the pipeline + metrics are stable across runs.
export function synthProgram(cfg) {
  const total = cfg.weeks + 1, spw = cfg.sessionsPerWeek, type = cfg.type || 'strength';
  const S = []; // sessions
  const strengthSession = (id,name,focus,lifts) => ({ id, type:'strength', name, focus,
    exercises: lifts.map(([n,sets,reps,load,cue]) => ({ name:n, sets, reps, load, rest:'2 min', cue })) });
  const runSession = (id,name,runType,fields) => ({ id, type:'endurance', name, focus:runType, runType, ...fields });
  const fitstop = (id,name,format,items) => ({ id, type:'fitstop', name, focus:'conditioning', format,
    exercises: items.map(([n,d]) => ({ name:n, detail:d })) });

  if (type === 'strength') {
    S.push(strengthSession('lower','Lower A','Quads/Posterior',[['Back Squat',4,'5','80% 1RM','brace'],['RDL',3,'8','RPE8'],['Leg Press',3,'12','RPE9'],['Calf Raise',4,'15','RPE9']]));
    S.push(strengthSession('upper','Upper A','Chest/Back',[['Bench Press',4,'5','80% 1RM','tuck'],['Row',4,'8','RPE8'],['OHP',3,'8','RPE8'],['Pull-up',3,'8','bw']]));
    S.push(strengthSession('full','Full Body','Compound',[['Deadlift',3,'5','82% 1RM','wedge'],['Incline DB',3,'10','RPE8'],['Lat Pulldown',3,'12','RPE9']]));
  } else if (type === 'endurance') {
    S.push(runSession('easy','Zone 2 Easy','easy',{distance:'8 km',duration:'45 min',pace:'5:25/km',zone:'Z2',cue:'conversational'}));
    S.push(runSession('tempo','Tempo','tempo',{distance:'10 km',duration:'50 min',pace:'4:30/km',zone:'Z3-4',intervals:'3×8min @ threshold, 2min jog'}));
    S.push(runSession('intervals','VO2 Intervals','intervals',{duration:'45 min',intervals:'6×800m @ 3:20, 90s jog',zone:'Z5'}));
    S.push(runSession('long','Long Run','long',{distance:'18 km',duration:'95 min',pace:'5:40/km',zone:'Z2'}));
  } else if (type === 'fitstop') {
    S.push(strengthSession('lift','Fitstop LIFT','Strength',[['Back Squat',4,'6','RPE8','brace'],['Bench',4,'6','RPE8'],['Row',3,'10','RPE8']]));
    S.push(fitstop('perform','Fitstop PERFORM','AMRAP 20 · 4 stations',[['Wall Balls','15'],['Row','250m'],['Burpees','10'],['KB Swing','20']]));
    S.push(runSession('z2','Zone 2 Run','easy',{distance:'6 km',duration:'35 min',pace:'5:40/km',zone:'Z2'}));
  } else { // hybrid
    S.push(strengthSession('lift','Strength LIFT','Full body',[['Back Squat',4,'5','80% 1RM','brace'],['Bench',3,'6','RPE8'],['Row',3,'10','RPE8'],['Core',3,'12','']]));
    S.push(strengthSession('lift2','Strength LIFT B','Posterior',[['Deadlift',3,'5','82%','wedge'],['OHP',3,'8','RPE8'],['Pull-up',3,'8','bw']]));
    S.push(runSession('easy','Zone 2 Run','easy',{distance:'8 km',duration:'45 min',pace:'5:30/km',zone:'Z2'}));
    S.push(runSession('tempo','Tempo Run','tempo',{distance:'8 km',duration:'40 min',pace:'4:40/km',zone:'Z3-4',intervals:'4×6min, 90s jog'}));
    S.push(runSession('intervals','Intervals','intervals',{duration:'40 min',intervals:'8×400m @ 3:10, 60s',zone:'Z5'}));
    S.push(runSession('long','Long Run','long',{distance:'16 km',duration:'85 min',pace:'5:45/km',zone:'Z2'}));
  }

  // Build a 7-day template (Mon..Sun) placing `spw` sessions, rest as null.
  const ALL = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const slotDays = ({1:['Mon'],2:['Mon','Thu'],3:['Mon','Wed','Fri'],4:['Mon','Tue','Thu','Sat'],
    5:['Mon','Tue','Wed','Fri','Sat'],6:['Mon','Tue','Wed','Thu','Fri','Sat'],7:ALL})[Math.min(Math.max(spw,1),7)];
  const order = type === 'hybrid'
    ? ['lift','easy','tempo','lift2','intervals','long']   // alternate disciplines
    : S.map(s => s.id);
  const dayMap = ALL.map(d => { const i = slotDays.indexOf(d); return i>=0 ? (order[i % order.length] || S[i%S.length].id) : null; });

  const weeklyProgressions = Array.from({length: total}, (_,i) => i === total-1
    ? { week:i+1, deload:true, note:'Deload — reduce volume ~50%' }
    : { week:i+1, setsAdd:i, note:`Week ${i+1} progression` });

  return { name:`${type[0].toUpperCase()+type.slice(1)} Block`, type, weeks: total,
    sessionsPerWeek: spw, progression:'Volume rises weekly, deload last week.',
    sessions: S, dayMap, weeklyProgressions };
}

// Seed a benchmark athlete, stub the AI, run real generation, return {prompt, program}.
export async function runBenchmark(page, bench, fixture) {
  // Use non-colliding param names so we can assign the app's top-level globals
  // (coachProfile / baselines / programBuilderConfig) without shadowing them.
  await page.evaluate(({ profile, bl, config }) => {
    coachProfile = profile;
    baselines = bl || {};
    programBuilderConfig = config;
    try { localStorage.setItem('ht-coach', JSON.stringify(profile)); } catch {}
    try { localStorage.setItem('ht-baselines', JSON.stringify(bl||{})); } catch {}
    savedProgram = null;
    try { localStorage.removeItem('ht-program'); } catch {}
    openProgramOverlay(); // ensures #program-overlay-body exists for generateProgram
  }, { profile: bench.profile, bl: bench.baselines, config: bench.config });

  const out = await page.evaluate(async (fx) => {
    window.__cap = null;
    aiAPI = async (opts) => { window.__cap = { system: opts.system, user: opts.messages?.[0]?.content, model: opts.model }; return { content: [{ text: '```json\n' + JSON.stringify(fx) + '\n```' }] }; };
    await generateProgram();
    return { prompt: window.__cap, program: savedProgram };
  }, fixture);
  return out;
}

// Strip volatile fields so snapshots are stable run-to-run.
export function stripVolatile(prog) {
  if (!prog) return prog;
  const { id, startDate, ...rest } = prog;
  return rest;
}

// ── Coaching-quality metrics ─────────────────────────────────────────────────
// Descriptive analysis of a generated program. These metrics are the regression
// baseline AND the seed checks for the future Validation Engine.
const ALL_DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function analyzeProgram(prog) {
  if (!prog) return { error: 'no program' };
  const sessions = prog.sessions || [];
  const byId = Object.fromEntries(sessions.map(s => [s.id, s]));
  const dm = Array.isArray(prog.dayMap) && prog.dayMap.length === 7 ? prog.dayMap : null;
  const slots = dm ? dm.map(id => id ? byId[id] : null) : [];
  const training = slots.filter(Boolean);
  const typeOf = s => s?.type || 'strength';

  const disciplineMix = { strength:0, endurance:0, fitstop:0 };
  training.forEach(s => { const t = typeOf(s); disciplineMix[t] = (disciplineMix[t]||0) + 1; });

  const runs = training.filter(s => typeOf(s) === 'endurance');
  const easyRT = new Set(['easy','recovery','long']);
  const easy = runs.filter(s => easyRT.has(s.runType)).length;
  const quality = runs.length - easy;

  const strengthS = sessions.filter(s => typeOf(s) === 'strength');
  const avgEx = strengthS.length ? +(strengthS.reduce((a,s)=>a+(s.exercises?.length||0),0)/strengthS.length).toFixed(1) : 0;
  const compoundRe = /squat|deadlift|bench|press|row|pull-?up|clean|snatch|lunge|hinge/i;
  const hasCompound = strengthS.some(s => (s.exercises||[]).some(e => compoundRe.test(e.name||'')));

  const wp = prog.weeklyProgressions || [];
  const progression = { weeks: wp.length, deloadPresent: wp.some(w=>w.deload),
    setsAddPattern: wp.map(w => w.deload ? 'D' : (w.setsAdd ?? 0)).join(',') };

  // Concurrent-training proxy: a hard run adjacent (prev/next day) to a strength day.
  const concurrencyFlags = [];
  if (dm) {
    for (let i=0;i<7;i++){
      const a=slots[i]; if(!a) continue;
      const next=slots[(i+1)%7];
      const hardRun = s => typeOf(s)==='endurance' && !easyRT.has(s.runType);
      const heavyLift = s => typeOf(s)==='strength';
      if (a && next && ((hardRun(a)&&heavyLift(next))||(heavyLift(a)&&hardRun(next))))
        concurrencyFlags.push(`${ALL_DOW[i]}→${ALL_DOW[(i+1)%7]}: hard run adjacent to strength`);
    }
  }

  const nonNull = dm ? dm.filter(Boolean).length : 0;
  const structural = {
    dayMapValid: !!dm,
    allIdsResolve: dm ? dm.every(id => id===null || !!byId[id]) : false,
    spwMatchesDayMap: nonNull === (prog.sessionsPerWeek || 0),
    weeklyProgCoversWeeks: wp.length === (prog.weeks || 0),
  };

  return {
    type: prog.type, weeks: prog.weeks, sessionsPerWeek: prog.sessionsPerWeek,
    trainingDays: training.length, restDays: dm ? 7 - nonNull : null,
    disciplineMix,
    endurance: { total: runs.length, easy, quality, easyRatio: runs.length ? +(easy/runs.length).toFixed(2) : null },
    strength: { sessions: strengthS.length, avgExercises: avgEx, hasCompound },
    progression, concurrencyFlags, structural,
  };
}
