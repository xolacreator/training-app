
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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(300);

const block=await page.evaluate(()=>{
  const d=new Date();
  saveProgramData({id:'p',name:'Marathon',type:'endurance',startDate:_mondayISO(d),weeks:12,sessionsPerWeek:4,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},
              {id:'int',type:'endurance',name:'Intervals',runType:'intervals'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo','int',null,'long',null],
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1,deload:i===12}))});
  recomputeAthleteState();
  const get=(id,w)=>_progressEndurance(savedProgram.sessions.find(s=>s.id===id), w, 13);
  const rows=[];
  for(let w=1;w<=12;w++) rows.push({w, phase:_phaseForWeek(savedProgram,w),
    tempo:get('tempo',w).intervals, int:get('int',w).intervals, long:get('long',w) });
  return rows;
});

check('Phase design API exists', await page.evaluate(()=>
  ['_phaseForWeek','_phaseRx','_PHASE_DESIGN'].every(n=>{try{return typeof eval(n)!=='undefined';}catch(e){return false;}})));

// ── The interval FORMAT changes by phase, not just the rep count ───────────
const fmt=w=>(block.find(r=>r.w===w).int.match(/×([\d\s]*(km|m))/)||[])[1];
check('Base uses long reps (1 km)', /1 km/.test(block.find(r=>r.w===2).int), block.find(r=>r.w===2).int);
check('Build uses classic 800s', /800 m/.test(block.find(r=>r.w===6).int), block.find(r=>r.w===6).int);
check('Peak sharpens to 400s', /400 m/.test(block.find(r=>r.w===11).int), block.find(r=>r.w===11).int);
check('The interval distance genuinely changes across the block',
  new Set(block.map(r=>fmt(r.w))).size>=3, JSON.stringify([...new Set(block.map(r=>fmt(r.w)))]));

// ── Threshold format changes: broken blocks → continuous ──────────────────
check('Base threshold is broken into short blocks', /2×8 min/.test(block.find(r=>r.w===1).tempo), block.find(r=>r.w===1).tempo);
check('Peak threshold is long sustained work', /\d\d min/.test(block.find(r=>r.w===10).tempo) &&
  parseInt(block.find(r=>r.w===10).tempo.match(/×(\d+) min/)[1])>=15, block.find(r=>r.w===10).tempo);
check('Peak threshold is capped at a sane volume (not 2×30)', await page.evaluate(()=>{
  const t=_progressEndurance(savedProgram.sessions.find(s=>s.id==='tempo'), 11, 13);
  const m=t.intervals.match(/(\d+)×(\d+) min/);
  return !m || (parseInt(m[1])*parseInt(m[2])) <= 40; }));

// ── The long run acquires race specificity ────────────────────────────────
check('Base long runs are plain aerobic', !block.find(r=>r.w===2).long.segment, JSON.stringify(block.find(r=>r.w===2).long.segment));
check('Build long runs add marathon-effort work', /marathon effort/.test(block.find(r=>r.w===6).long.segment||''),
  String(block.find(r=>r.w===6).long.segment));
check('Peak long runs rehearse goal race pace', /race pace/.test(block.find(r=>r.w===10).long.segment||''),
  String(block.find(r=>r.w===10).long.segment));

// ── Week 2 and week 11 are no longer the same session ─────────────────────
const w2=block.find(r=>r.w===2), w11=block.find(r=>r.w===11);
check('Week 2 and week 11 differ in interval format', w2.int!==w11.int, `${w2.int} vs ${w11.int}`);
check('...and in threshold format', w2.tempo!==w11.tempo);
check('...and in long-run specificity', (w2.long.segment||null)!==(w11.long.segment||null));

// ── A real taper phase, not just the final week ───────────────────────────
check('Weeks flagged as taper are prescribed as taper', await page.evaluate(()=>{
  savedProgram.weeklyProgressions[9].taper=true;   // week 10
  const ph=_phaseForWeek(savedProgram,10);
  const t=_progressEndurance(savedProgram.sessions.find(s=>s.id==='int'), 10, 13);
  delete savedProgram.weeklyProgressions[9].taper;
  return ph==='Taper' && /4×400 m|5×400 m/.test(t.intervals); }));

// ── An unknown run type is refused, not silently made an easy run ─────────
check('An unrecognised run type is reported, not degraded to easy', await page.evaluate(()=>{
  const r=_progressEndurance({type:'endurance',name:'Mystery',runType:'fartlek_supreme'}, 5, 13);
  return r.unknownRunType==='fartlek_supreme' && /No prescription defined/.test(r.note||''); }));
check('Known types still prescribe normally', await page.evaluate(()=>{
  const r=_progressEndurance({type:'endurance',name:'E',runType:'easy'}, 5, 13);
  return !r.unknownRunType && !!r.duration; }));

// ── Deload still reduces ──────────────────────────────────────────────────
check('Deload weeks still cut volume', await page.evaluate(()=>{
  const a=_progressEndurance(savedProgram.sessions.find(s=>s.id==='long'), 12, 13);
  const b=_progressEndurance(savedProgram.sessions.find(s=>s.id==='long'), 13, 13);
  const km=x=>parseFloat(String(x.distance||'0'));
  return km(b)<km(a); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
