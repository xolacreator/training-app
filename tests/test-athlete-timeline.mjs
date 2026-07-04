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
check('Timeline API exists', await page.evaluate(()=>
  typeof buildAthleteTimeline==='function' && typeof timelineSummary==='function' && typeof openTimeline==='function'));

// ── Empty state
const empty=await page.evaluate(()=>{ sessions.length=0; recoveryLog.length=0; return {ev:buildAthleteTimeline(), sum:timelineSummary()}; });
check('Empty account → empty stream + zero summary', empty.ev.length===0 && empty.sum.total===0 && empty.sum.sessions===0, JSON.stringify(empty.sum));

// ── Seed a mixed history: 3 sessions + 2 recovery check-ins over several days
const built=await page.evaluate(()=>{
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  const t=off=>new Date(iso(off)+'T12:00:00').getTime();
  sessions.length=0; recoveryLog.length=0;
  sessions.push({session:'Long Run',intensity:'easy',dist:'22',dur:'110',pace:'5:30',hr:'142',feel:4,notes:'Felt strong late',date:iso(0),ts:t(0),gid:'a'});
  sessions.push({session:'Threshold Intervals',intensity:'hard',dist:'12',dur:'55',pace:'4:05',hr:'168',feel:3,date:iso(2),ts:t(2),gid:'b'});
  sessions.push({session:'Lower Strength',type:'strength',dur:'50',feel:4,date:iso(3),ts:t(3),gid:'c'});
  recoveryLog.push({date:iso(0),sleepHours:8,sleepScore:78,restingHR:48,ts:new Date(iso(0)+'T07:00:00').getTime()});
  recoveryLog.push({date:iso(3),sleepHours:6,sleepScore:41,restingHR:56,ts:new Date(iso(3)+'T07:00:00').getTime()});
  return {ev:buildAthleteTimeline(), sum:timelineSummary()};
});
check('Stream folds sessions + recovery (5 events)', built.ev.length===5, built.ev.length);
check('Summary counts sessions=3, recovery=2', built.sum.sessions===3 && built.sum.recovery===2 && built.sum.total===5, JSON.stringify(built.sum));

// ── Chronological order: newest first (descending ts)
const ordered=await page.evaluate(()=>{ const ev=buildAthleteTimeline(); for(let i=1;i<ev.length;i++) if(ev[i-1].ts<ev[i].ts) return false; return true; });
check('Events are newest-first (descending ts)', ordered);
check('Most recent event is today\'s Long Run', built.ev[0].kind==='session' && built.ev[0].title==='Long Run', JSON.stringify({k:built.ev[0].kind,t:built.ev[0].title}));

// ── Event shape: session carries subtitle stats + note + feel meta
const sEv=await page.evaluate(()=>buildAthleteTimeline().find(e=>e.title==='Long Run'));
check('Session event carries dist/dur/pace/hr subtitle', /22 km/.test(sEv.subtitle)&&/110 min/.test(sEv.subtitle)&&/5:30\/km/.test(sEv.subtitle)&&/142 bpm/.test(sEv.subtitle), sEv.subtitle);
check('Session event carries note + feel meta', sEv.note==='Felt strong late' && sEv.meta.some(m=>/Feel 4\/5/.test(m)), JSON.stringify({note:sEv.note,meta:sEv.meta}));
check('Easy run toned green, hard run toned red', await page.evaluate(()=>{const ev=buildAthleteTimeline();const lr=ev.find(e=>e.title==='Long Run');const th=ev.find(e=>e.title==='Threshold Intervals');return lr.tone==='green'&&th.tone==='red';}));

// ── Recovery event: readiness title + tone from score
const rEv=await page.evaluate(()=>buildAthleteTimeline().filter(e=>e.kind==='recovery'));
check('Recovery events titled "Readiness N" with sleep/RHR subtitle', rEv.every(e=>/^Readiness \d+/.test(e.title)) && /8 h sleep/.test(rEv.find(e=>/78/.test(e.title)).subtitle), JSON.stringify(rEv.map(e=>e.title)));
check('High readiness→green, low readiness→red', rEv.find(e=>/78/.test(e.title)).tone==='green' && rEv.find(e=>/41/.test(e.title)).tone==='red', JSON.stringify(rEv.map(e=>({t:e.title,tone:e.tone}))));

// ── View renders in the insight sheet with day groups + no throw
const view=await page.evaluate(()=>{ openTimeline(); const html=document.getElementById('ins-content').innerHTML; const open=document.getElementById('ins-sheet').classList.contains('open'); return {open, hasTitle:/Athlete Timeline/.test(html), hasToday:/Today/.test(html), hasLong:/Long Run/.test(html), hasReadiness:/Readiness/.test(html)}; });
check('openTimeline opens sheet with grouped story', view.open && view.hasTitle && view.hasToday && view.hasLong && view.hasReadiness, JSON.stringify(view));

// ── Reconstructs for the live account after a fresh save (build stays in sync)
const live=await page.evaluate(()=>{ sessions.unshift({session:'Recovery Jog',dist:'6',dur:'32',pace:'6:10',date:todayISO(),ts:Date.now(),gid:'z'}); saveData(); const ev=buildAthleteTimeline(); return ev[0].title; });
check('New session appears at the top after saveData + rebuild', live==='Recovery Jog', live);

// ── limit option is honoured
const lim=await page.evaluate(()=>buildAthleteTimeline({limit:2}).length);
check('limit option caps the stream', lim===2, lim);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
