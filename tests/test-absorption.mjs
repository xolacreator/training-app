
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Seed a 3-session week and log `doneDays` of them.
const seed=(doneDays)=>page.evaluate((doneDays)=>{
  const d=new Date(); d.setDate(d.getDate()-7);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  const wk=_progActualWeek();
  const win=_weekWindow(wk);
  const dayISO=(off)=>{ const x=new Date(win.start); x.setDate(x.getDate()+off); return x.toISOString().slice(0,10); };
  const idx={Mon:0,Wed:2,Sat:5};
  sessions.length=0;
  doneDays.forEach((dy,i)=>{ const iso=dayISO(idx[dy]);
    sessions.push({gid:'g'+dy, week:String(wk), day:dy, session:'Run', dist:'10', pace:'5:00',
                   date:iso, ts:new Date(iso+'T09:00:00').getTime()}); });
  recomputeAthleteState();
  return { wk, ab:computeWeekAbsorption(wk) };
}, doneDays);

check('Absorption API exists', await page.evaluate(()=>
  ['computeWeekAbsorption','absorptionSummary'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── The headline fact: plan says 3, athlete does 2 ──────────────────────────
const two=await seed(['Mon','Wed']);
check('Prescribed session count is measured', two.ab.prescribed.sessions===3, JSON.stringify(two.ab.prescribed));
check('Absorbed session count is measured', two.ab.absorbed.sessions===2, JSON.stringify(two.ab.absorbed));
check('The ratio is computed (2 of 3)', Math.abs(two.ab.sessionRatio-0.667)<0.01, String(two.ab.sessionRatio));
check('Prescribed LOAD is measured, not just counts', two.ab.prescribed.km>0, JSON.stringify(two.ab.prescribed));
check('Absorbed load is measured', two.ab.absorbed.km===20, String(two.ab.absorbed.km));
check('Load ratio is separate from session ratio', two.ab.loadRatio!=null && two.ab.loadRatio!==two.ab.sessionRatio,
  JSON.stringify({s:two.ab.sessionRatio,l:two.ab.loadRatio}));

// ── It names WHICH session was missed, not just a number ───────────────────
check('The specific missed session is identified', two.ab.missed.length===1 && two.ab.missed[0].day==='Sat',
  JSON.stringify(two.ab.missed));
check('The missed session carries its name', !!(two.ab.missed[0] && two.ab.missed[0].name), JSON.stringify(two.ab.missed[0]));

// ── Full adherence ─────────────────────────────────────────────────────────
const all=await seed(['Mon','Wed','Sat']);
check('A fully completed week reports ratio 1', all.ab.sessionRatio===1 && all.ab.missed.length===0, JSON.stringify(all.ab.sessionRatio));

// ── Nothing done ───────────────────────────────────────────────────────────
const none=await seed([]);
check('A skipped week reports 0, not null', none.ab.sessionRatio===0, String(none.ab.sessionRatio));
check('...and lists every prescribed session as missed', none.ab.missed.length===3, JSON.stringify(none.ab.missed.map(m=>m.day)));
check('...with low confidence rather than a confident claim', none.ab.confidence==='low', none.ab.confidence);

// ── ONE MODEL: every surface reads the same computation ────────────────────
check('Absorption is on the athlete model', await page.evaluate(()=>{
  const a=athleteState().absorption;
  return !!(a && a.current && typeof a.current.sessionRatio!=='undefined'); }));
check('The model agrees with a direct call (no second answer)', await page.evaluate(()=>{
  const direct=computeWeekAbsorption(_progActualWeek());
  const model=athleteState().absorption.current;
  return direct.sessionRatio===model.sessionRatio && direct.prescribed.sessions===model.prescribed.sessions; }));
check('CoachEV exposes it through the model', await page.evaluate(()=>{
  try{ const st=CoachEV.athlete.state(); return !!(st && st.absorption && st.absorption.current); }catch(e){ return false; } }));

// ── Autoregulation now READS absorption instead of deriving its own ────────
const auto=await seed(['Mon']);
check('Autoregulation reports load adherence, not just counts', await page.evaluate(()=>{
  const p=weeklyAutoregulation();
  return p && p.inputs && typeof p.inputs.loadAdherence!=='undefined'; }));
// Autoregulation reviews the week just finished, not the current one, so it must
// match the model's entry for THAT week. Asserting against `current` was what let
// the wrong-week bug through.
check('Its adherence matches the model entry for the week it reviewed', await page.evaluate(()=>{
  const p=weeklyAutoregulation();
  const reviewed=p.targetWeek-1;
  const st=athleteState();
  const m=(st.absorption.weeks||[]).find(w=>w.week===reviewed) || computeWeekAbsorption(reviewed);
  return p.inputs.adherence===m.sessionRatio; }));

// ── A multi-week view ──────────────────────────────────────────────────────
check('A rolling summary is available', await page.evaluate(()=>{
  const s=absorptionSummary(4);
  return Array.isArray(s.weeks) && s.weeks.length>=1 && typeof s.meanSessionRatio!=='undefined'; }));

// ── No program → no claim ──────────────────────────────────────────────────
check('With no program it claims nothing', await page.evaluate(()=>{
  const save=savedProgram; savedProgram=null;
  const a=computeWeekAbsorption(1); savedProgram=save;
  return a.sessionRatio===null && a.confidence==='none'; }));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
