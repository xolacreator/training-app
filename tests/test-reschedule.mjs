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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(500);

// Seed a program: Mon=Tempo(hard), Wed=Easy, Fri=Easy, rest others.
await page.evaluate(()=>{
  saveProgramData({ id:'rx-test', name:'Rx Test', type:'endurance', startDate:_mondayISO(new Date()), weeks:4, sessionsPerWeek:3,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo Run',runType:'tempo',intervals:'x'},{id:'easy',type:'endurance',name:'Zone 2 Run',runType:'easy'}],
    dayMap:['tempo',null,'easy',null,'easy',null,null],
    weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}] });
});

// 1) Low readiness on a hard day → proposes moving it
let s = await page.evaluate(()=>suggestReschedule({week:1, day:'Mon', readiness:40}));
check('Low readiness on hard day proposes a move', s && s.fromDay==='Mon' && s.sessionName==='Tempo Run', JSON.stringify(s));
check('Target is a non-hard day forward (Wed)', s && s.toDay==='Wed', JSON.stringify(s&&s.toDay));

// 2) Good readiness → no suggestion
let s2 = await page.evaluate(()=>suggestReschedule({week:1, day:'Mon', readiness:75}));
check('Good readiness → no reschedule', s2===null);

// 3) On an easy/rest day → no suggestion (nothing hard to move)
let s3 = await page.evaluate(()=>suggestReschedule({week:1, day:'Wed', readiness:40}));
check('Easy/rest day → no reschedule', s3===null);

// 4) Apply → that week's dayMap swaps; Mon becomes easy, Wed becomes the hard session
await page.evaluate(()=>applyReschedule(1,'Mon','Wed'));
const wk1 = await page.evaluate(()=>_progWeekSessions(1).map(x=>({day:x.day,id:x.id})));
const w1 = Object.fromEntries(wk1.map(x=>[x.day,x.id]));
check('After apply: Mon=easy, Wed=tempo (swapped) in week 1', w1.Mon==='easy' && w1.Wed==='tempo', JSON.stringify(w1));

// 5) Other weeks unaffected (per-week override only)
const wk2 = await page.evaluate(()=>_progWeekSessions(2).map(x=>({day:x.day,id:x.id})));
const w2 = Object.fromEntries(wk2.map(x=>[x.day,x.id]));
check('Week 2 unchanged (Mon=tempo)', w2.Mon==='tempo' && w2.Wed==='easy', JSON.stringify(w2));

// 6) Override persisted on the program
const hasOv = await page.evaluate(()=>!!(savedProgram.overrides && savedProgram.overrides[1]));
check('Per-week override persisted', hasOv);

// 7) _readinessToday reads today's recovery entry (correct function name)
const readReads = await page.evaluate(()=>{ recoveryLog.unshift({date:todayISO(), sleepHours:4, sleepScore:38, restingHR:0}); return _readinessToday(); });
check('_readinessToday reads today recovery (38)', readReads===38, `got ${readReads}`);

// 8) Banner renders when readiness is low + today is hard + a target exists
await page.evaluate(()=>{
  const order=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const i=(new Date().getDay()+6)%7;              // today, Mon-based
  const map=[null,null,null,null,null,null,null]; map[i]='tempo'; map[(i+3)%7]='easy';
  saveProgramData({ id:'rx2', name:'Rx2', type:'endurance', startDate:_mondayISO(new Date()), weeks:4, sessionsPerWeek:2,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo Run',runType:'tempo',intervals:'x'},{id:'easy',type:'endurance',name:'Easy',runType:'easy'}],
    dayMap:map, weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}] });
  sessionStorage.removeItem('ht-resched-dismissed');
  nav('today',document.querySelectorAll('.nb')[0]); renderToday();
});
await page.waitForTimeout(300);
const bannerText = await page.locator('#reschedule-banner').innerText().catch(()=>'');
check('Reschedule banner shows on low readiness', /reschedule|Move to|readiness is low/i.test(bannerText), JSON.stringify(bannerText.slice(0,90)));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
