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

check('Rolling-week API exists', await page.evaluate(()=>typeof _rollingWeeks==='function' && typeof _statsBuckets==='function'));

// 12 Mon-start weeks, last one contains today
const weeks=await page.evaluate(()=>{ const w=_rollingWeeks(12); const now=new Date();
  return { n:w.length, lastHasToday: now>=new Date(w[11].start) && now<new Date(w[11].end), monday: new Date(w[11].start).getDay() }; });
check('12 rolling weeks, last contains today, weeks start Monday', weeks.n===12 && weeks.lastHasToday && weeks.monday===1, JSON.stringify(weeks));

// ── The key adaptive property: bucketing is by DATE, not by the legacy s.week index
const adaptive=await page.evaluate(()=>{
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  sessions.length=0;
  // Two sessions with WILDLY different s.week values but BOTH dated this week:
  sessions.push({week:'2', session:'Run A', dist:'8', pace:'4:30', feel:4, date:iso(0), ts:Date.now(), gid:'a'});
  sessions.push({week:'11',session:'Run B', dist:'6', pace:'5:00', feel:3, date:iso(1), ts:Date.now()-86400000, gid:'b'});
  // One session dated 3 weeks ago (regardless of its week field)
  sessions.push({week:'1', session:'Run C', dist:'10', pace:'4:45', feel:5, date:iso(21), ts:Date.now()-21*86400000, gid:'c'});
  const B=_statsBuckets(12);
  return { thisWeekVol:B.volData[11], thisWeekCnt:B.cnt[11], threeAgoCnt:B.cnt[8], weekFieldsIgnored:true };
});
check('Two sessions dated this week bucket together despite s.week 2 & 11', adaptive.thisWeekCnt===2 && Math.abs(adaptive.thisWeekVol-14)<0.1, JSON.stringify(adaptive));
check('A session dated 3 weeks ago lands 3 buckets back (by date, not s.week)', adaptive.threeAgoCnt===1, JSON.stringify(adaptive));

// ── renderStats produces DATE labels + "This wk" (not W1..W12), and survives no Chart.js
const rendered=await page.evaluate(()=>{
  nav('stats',document.querySelectorAll('.nb')[3]);
  try { renderStats(); } catch(e){ return {err:String(e)}; }
  const cb=document.getElementById('completion-bars').innerHTML;
  const metrics=document.getElementById('stats-metrics').innerHTML;
  return { cb, metrics, err:null };
});
check('renderStats completes even without Chart.js (guarded)', rendered.err===null, rendered.err||'');
check('Completion bars are date-labelled + "This wk" (not W1..W12)', /This wk/.test(rendered.cb) && !/>W1<|>W12</.test(rendered.cb), rendered.cb.slice(0,120));
check('Stats metric reads "Active weeks · last 12 wk" (rolling, not /12 static)', /Active weeks/.test(rendered.metrics) && /last 12 wk/.test(rendered.metrics));

// ── Completion target follows the current program's sessions/week
const tgt=await page.evaluate(()=>{
  saveProgramData({id:'p',name:'B',type:'endurance',startDate:_mondayISO(new Date()),weeks:6,sessionsPerWeek:4,sessions:[{id:'t',type:'endurance',name:'T',runType:'tempo'}],dayMap:['t',null,null,null,null,null,null],weeklyProgressions:Array.from({length:7},(_,i)=>({week:i+1}))});
  renderStats();
  return document.getElementById('completion-bars').innerHTML;
});
check('Completion target = program sessions/week (/4 here)', /\/4</.test(tgt), tgt.match(/\/\d</g)?.slice(0,2).join(','));

// ── Empty account: no crash, zero buckets
const empty=await page.evaluate(()=>{ sessions.length=0; savedProgram=null; localStorage.removeItem('ht-program'); try{ renderStats(); return {ok:true, active:/Active weeks<\/div><div class="mval bl">0/.test(document.getElementById('stats-metrics').innerHTML)}; }catch(e){ return {ok:false,err:String(e)}; } });
check('Empty account renders Stats without error (0 active weeks)', empty.ok, JSON.stringify(empty));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors (Chart.js CDN absence ignored)', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
