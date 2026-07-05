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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── API exists
check('Weekly dashboard API exists', await page.evaluate(()=>
  typeof weeklyAdaptationDashboard==='function' && typeof weeklyReview==='function' && typeof openWeeklyDashboard==='function' && typeof renderWeekAdaptations==='function'));

// ── Seed an endurance program (week 1 = this week) + partial completion
await page.evaluate(()=>{
  localStorage.setItem('ht-goal','Marathon'); trainGoal='Marathon';
  saveProgramData({ id:'wk', name:'Marathon Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:8, sessionsPerWeek:5,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'},
              {id:'easy',type:'endurance',name:'Easy',runType:'easy'},{id:'intervals',type:'endurance',name:'Intervals',runType:'intervals'}],
    dayMap:['tempo','easy','intervals','easy','long','easy',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1})) });
  sessions.length=0;
  // Log a tempo run today (Mon slot) → completes lactate_threshold
  const mon=_mondayISO(new Date());
  sessions.push({cat:'run',session:'Tempo Run',date:mon,ts:new Date(mon+'T09:00:00').getTime(),gid:'a',progId:'wk',progWeek:1,progSid:'tempo'});
  saveData(); recomputeAthleteState();
});

// ── Dashboard: required adaptations each get a status
const d=await page.evaluate(()=>weeklyAdaptationDashboard(1));
check('Dashboard covers the required adaptations for the type', d.rows.length>=5 && d.rows.every(r=>r.id&&r.name&&r.status), d.rows.map(r=>`${r.id}:${r.status}`).join(','));
check('Statuses are from the C/S/R/M set', d.rows.every(r=>['completed','scheduled','remaining','missed'].includes(r.status)));
check('Logged tempo → lactate_threshold Completed', d.rows.find(r=>r.id==='lactate_threshold')?.status==='completed', JSON.stringify(d.rows.find(r=>r.id==='lactate_threshold')));
check('Counts tally to the row total', d.counts.completed+d.counts.scheduled+d.counts.remaining+d.counts.missed===d.rows.length, JSON.stringify(d.counts));
// A fully-future week has its slots' adaptations Scheduled (not missed/completed).
const future=await page.evaluate(()=>weeklyAdaptationDashboard(2).counts);
check('A future week shows Scheduled adaptations', future.scheduled>=1 && future.missed===0, JSON.stringify(future));

// ── A future long-run slot → race_specificity/aerobic scheduled, not missed
check('Window is a 7-day Mon-Sun span', await page.evaluate(()=>{ const w=weeklyAdaptationDashboard(1).window; const a=new Date(w.start+'T00:00:00'),b=new Date(w.end+'T00:00:00'); return Math.round((b-a)/86400000)===6; }));

// ── Weekly review folds everything together
const r=await page.evaluate(()=>weeklyReview({week:1}));
check('Review reports objectives completed/total', r.objectives && r.objectives.total>0 && r.objectives.completed>=1, JSON.stringify(r.objectives));
check('Review lists achieved adaptations incl. Lactate Threshold', r.achieved.includes('Lactate Threshold'), JSON.stringify(r.achieved));
check('Review reports consistency (done vs planned)', r.consistency && r.consistency.done===1 && r.consistency.planned>=4, JSON.stringify(r.consistency));
check('Review carries fatigue budget + next-week priorities', !!r.fatigue && Array.isArray(r.nextWeek) && r.nextWeek.length>=1, JSON.stringify({f:!!r.fatigue,n:r.nextWeek.length}));

// ── Recovery trend: add this-week + last-week check-ins → trend computed
const trend=await page.evaluate(()=>{
  const mon=_mondayISO(new Date());
  const d0=new Date(mon+'T00:00:00');
  const iso=off=>{const x=new Date(d0);x.setDate(x.getDate()+off);return x.toISOString().slice(0,10);};
  recoveryLog.length=0;
  recoveryLog.push({date:iso(0),sleepScore:75},{date:iso(1),sleepScore:77});   // this week ~76
  recoveryLog.push({date:iso(-6),sleepScore:60},{date:iso(-5),sleepScore:62}); // last week ~61
  saveRecovery();
  return weeklyReview({week:1}).recovery;
});
check('Recovery trend compares this week vs last (up)', trend.thisWeek>trend.prevWeek && trend.trend==='up', JSON.stringify(trend));

// ── Render: Plan card + full dashboard sheet
const ui=await page.evaluate(()=>{
  nav('plan', document.querySelectorAll('.nb')[1]); renderPlan(1);
  const card=document.getElementById('week-adaptations').innerHTML;
  openWeeklyDashboard(1);
  const sheet=document.getElementById('ins-content').innerHTML;
  return { cardHasObjectives:/objectives hit/.test(card), cardTappable:/openWeeklyDashboard/.test(card),
    sheetTitle:/Weekly Adaptation Dashboard/.test(sheet), sheetReview:/weekly review/i.test(sheet), sheetNext:/next week/i.test(sheet),
    open:document.getElementById('ins-sheet').classList.contains('open') };
});
check('Plan card renders adaptation summary + is tappable', ui.cardHasObjectives && ui.cardTappable, JSON.stringify(ui));
check('Dashboard sheet opens with review + next-week', ui.open && ui.sheetTitle && ui.sheetReview && ui.sheetNext, JSON.stringify(ui));

// ── No program → dashboard falls back to trailing 7 days, card clears
const noProg=await page.evaluate(()=>{ savedProgram=null; localStorage.removeItem('ht-program'); renderWeekAdaptations(); const d=weeklyAdaptationDashboard(); return { card:document.getElementById('week-adaptations').innerHTML, rows:d.rows.length }; });
check('No program → Plan card cleared but engine still computes', noProg.card==='' && noProg.rows>=1, JSON.stringify(noProg));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
