// The athlete's own account of where they are — and what the block does with it.
//
// THE LOG IS MANUAL. A thin log means "didn't record", not "didn't train", so it can
// only ever RAISE a stated figure, never lower one. Reading a sparse log as low volume
// is how you under-prescribe for whoever trains hardest and logs least.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});

const reset=()=>page.evaluate(()=>{
  ['ht-training-inputs','ht-v4','ht-program','ht-goal','ht-coach'].forEach(k=>localStorage.removeItem(k));
  savedProgram=null; sessions=[]; AthleteState=null;
});
// A log covering `weeks` weeks at `perWeek` runs of `km`, spread over real days.
const log=(weeks,perWeek,km)=>page.evaluate(({weeks,perWeek,km})=>{
  const out=[]; const now=Date.now();
  for(let w=0;w<weeks;w++) for(let s=0;s<perWeek;s++){
    const ts=now-((weeks-w)*7 - Math.floor(s*7/perWeek))*86400000;
    out.push({gid:`x${w}${s}`,week:String(w+1),day:'Mon',session:'Easy Run',dist:String(km),
              pace:'5:30',date:new Date(ts).toISOString().slice(0,10),ts});
  }
  sessions=out; localStorage.setItem('ht-v4',JSON.stringify(out));
},{weeks,perWeek,km});

// ── Stated input is accepted and stored ─────────────────────────────────────
await reset();
check('The athlete can state where they are', await page.evaluate(()=>{
  setTrainingInput('weeklyKm', 45); setTrainingInput('longestKm', 20);
  const st=athleteTrainingState();
  return st.weeklyKm===45 && st.longestKm===20 && st.fields.weeklyKm.source==='stated'; }));
check('An out-of-range value is refused, not silently clamped', await page.evaluate(()=>{
  const before=athleteTrainingState().weeklyKm;
  const ok=setTrainingInput('weeklyKm', 9999);
  return ok===false && athleteTrainingState().weeklyKm===before; }));
check('A cleared value goes back to unknown', await page.evaluate(()=>{
  setTrainingInput('trainingAge', 5);
  const had=athleteTrainingState().trainingAge===5;
  setTrainingInput('trainingAge', '');
  return had && athleteTrainingState().trainingAge===null; }));

// ── The log may raise, never lower ──────────────────────────────────────────
await reset(); await log(6, 2, 6);                       // ~12 km/week visible
check('A thin log does NOT lower what the athlete stated', await page.evaluate(()=>{
  setTrainingInput('weeklyKm', 50);
  const st=athleteTrainingState();
  return st.weeklyKm===50 && st.fields.weeklyKm.source==='stated'; }),
  'stated 50, log shows ~12');
await reset(); await log(6, 5, 14);                      // ~70 km/week visible
check('A log that EXCEEDS the stated figure raises it', await page.evaluate(()=>{
  setTrainingInput('weeklyKm', 20);
  const st=athleteTrainingState();
  return st.weeklyKm>20 && st.fields.weeklyKm.source==='logged-exceeds-stated'; }),
  await page.evaluate(()=>JSON.stringify(athleteTrainingState().fields.weeklyKm)));
await reset(); await log(6, 4, 10);
check('With nothing stated, the log is used and labelled as such', await page.evaluate(()=>{
  const st=athleteTrainingState();
  return st.weeklyKm>0 && st.fields.weeklyKm.source==='logged'; }));
await reset();
check('With no log and nothing stated, it says it does not know', await page.evaluate(()=>{
  const st=athleteTrainingState();
  return st.weeklyKm===null && st.canAnchor===false && st.missing.length===4; }));

// ── The block starts from the athlete, not a constant ───────────────────────
const longRunFor = (inputs) => page.evaluate((inputs)=>{
  ['ht-training-inputs','ht-program'].forEach(k=>localStorage.removeItem(k));
  savedProgram=null; sessions=[];
  Object.entries(inputs).forEach(([k,v])=>setTrainingInput(k,v));
  localStorage.setItem('ht-goal','marathon');
  const p=buildBlockForGoal({goal:'Run a marathon', weeks:16, sessionsPerWeek:5,
    trainDays:['Mon','Tue','Wed','Fri','Sat']});
  if(!p) return null;
  saveProgramData(p);
  const long=(_progWeekSessions(1)||[]).map(s=>s.session).filter(s=>s&&/Long/.test(s.name))[0];
  const rx=long?_sessSummary(long,1):'';
  return { rx, km:parseFloat((rx.match(/(\d+) km/)||[])[1]||0) };
}, inputs);

const bigBase = await longRunFor({weeklyKm:60, longestKm:24, runDays:5, trainingAge:6});
const smallBase = await longRunFor({weeklyKm:18, longestKm:14, runDays:3, trainingAge:1});
check('A big base gets a long run scaled to it', bigBase && bigBase.km>=20, bigBase && bigBase.rx);
check('A small base gets a shorter one', smallBase && smallBase.km<20, smallBase && smallBase.rx);
check('The two are genuinely different, not noise',
  Math.abs(bigBase.km - smallBase.km) >= 5, `${bigBase.km} km vs ${smallBase.km} km`);

// ── Hard work is gated on having a base for it ──────────────────────────────
const gateFor = (inputs) => page.evaluate((inputs)=>{
  ['ht-training-inputs','ht-program'].forEach(k=>localStorage.removeItem(k));
  savedProgram=null; sessions=[];
  Object.entries(inputs).forEach(([k,v])=>setTrainingInput(k,v));
  localStorage.setItem('ht-goal','marathon');
  const g=_intensityGate();
  const p=buildBlockForGoal({goal:'Run a marathon', weeks:16, sessionsPerWeek:5,
    trainDays:['Mon','Tue','Wed','Fri','Sat']});
  let names=[];
  if(p){ saveProgramData(p); names=(_progWeekSessions(1)||[]).filter(s=>s.session).map(s=>s.session.name); }
  return { blocked:g.blocked, reasons:g.reasons, known:g.known, names };
}, inputs);

const novice = await gateFor({weeklyKm:18, longestKm:14, runDays:3, trainingAge:1});
check('A novice does not get VO₂ intervals in week 1',
  !novice.names.some(n=>/Interval|Track/i.test(n)), novice.names.join(', '));
check('...and the reason is stated, not silent',
  novice.reasons.some(r=>/aerobic base/i.test(r)), novice.reasons[0]||'(none)');
const strong = await gateFor({weeklyKm:60, longestKm:24, runDays:5, trainingAge:6});
check('An athlete with a base still gets them',
  strong.names.some(n=>/Interval|Track/i.test(n)), strong.names.join(', '));
check('...with nothing withheld', strong.blocked.length===0, strong.blocked.join(','));

const unknown = await gateFor({});
check('An athlete we know nothing about is NOT withheld from',
  unknown.blocked.length===0 && unknown.known===false,
  `blocked=${unknown.blocked.join(',')} known=${unknown.known}`);

// The gate must survive the defaults and the top-up, not just the first list —
// filtering only the value-ranked list let DEFAULT_OBJECTIVES put it straight back.
check('A blocked objective cannot come back via the defaults', await page.evaluate(()=>{
  ['ht-training-inputs','ht-program'].forEach(k=>localStorage.removeItem(k));
  savedProgram=null; sessions=[];
  setTrainingInput('weeklyKm',10); setTrainingInput('longestKm',5);
  const p=buildAdaptiveWeek('endurance', 9, {allowedDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    sessionsPerWeek:7, preview:true, goal:'marathon'});
  saveProgramData(p);
  return !(_progWeekSessions(1)||[]).some(s=>s.session && /Track|Interval/i.test(s.session.name)); }));

// ── The interview can fill these in ─────────────────────────────────────────
check('The coach can record what the athlete says about their volume', await page.evaluate(()=>{
  const r=_extractTrainingInputs('Got it.\n```training\n{"weeklyKm":42,"longestKm":18}\n```\nThanks.');
  return r.training && r.training.weeklyKm===42 && r.training.longestKm===18 && !/```/.test(r.clean); }));
check('...and an implausible number is dropped, not stored', await page.evaluate(()=>{
  const r=_extractTrainingInputs('```training\n{"weeklyKm":5000,"longestKm":18}\n```');
  return r.training && r.training.weeklyKm===undefined && r.training.longestKm===18; }));
// Assert on the prompt the model actually receives — the whole assembly — not on
// whichever function happens to hold a given paragraph today.
const fullPrompt = () => _designSystemPrompt() + '\n' + _designEnginePrompt();
check('The design prompt asks for what is missing', await page.evaluate(()=>{
  ['ht-training-inputs'].forEach(k=>localStorage.removeItem(k));
  coachMessages=[]; const p=_designSystemPrompt()+'\n'+_designEnginePrompt();
  return /how many kilometres/i.test(p) && /```training/.test(p); }));
check('...and tells the coach NOT to read them off the log', await page.evaluate(()=>{
  const p=_designSystemPrompt()+'\n'+_designEnginePrompt();
  return /log is manual and incomplete/i.test(p); }));
check('It does not re-ask for what it already knows', await page.evaluate(()=>{
  setTrainingInput('weeklyKm',45); setTrainingInput('longestKm',20);
  setTrainingInput('runDays',5); setTrainingInput('trainingAge',6);
  coachMessages=[]; const p=_designSystemPrompt()+'\n'+_designEnginePrompt();
  return /already know where they are/i.test(p) && !/```training/.test(p); }));

// ── The builder screen lets the athlete set them ───────────────────────────
const ui=await page.evaluate(()=>{
  ['ht-training-inputs'].forEach(k=>localStorage.removeItem(k));
  savedProgram=null; coachProfile={goal:'Run a marathon'};
  localStorage.setItem('ht-goal','Run a marathon');
  setTrainingInput('weeklyKm',12); setTrainingInput('longestKm',6);
  renderProgramBuilder();
  const el=document.getElementById('program-overlay-body');
  return { html:el.innerHTML, text:el.innerText,
           inputs:[...el.querySelectorAll('input[type=number]')].map(i=>i.id) };
});
check('Every training input is editable on the builder screen',
  ['ti-weeklyKm','ti-longestKm','ti-runDays','ti-trainingAge'].every(id=>ui.inputs.includes(id)),
  ui.inputs.join(','));
check('It explains that the log only ever raises what you tell it',
  /never lowers what you've told us/i.test(ui.text));
check('A withheld session is explained on the screen too',
  /held back/i.test(ui.text), ui.text.slice(0,60).replace(/\n/g,' / '));

check('Training inputs survive a backup', await page.evaluate(()=>
  BACKUP_KEYS.includes('ht-training-inputs')));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
