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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── Rename a logged session from the detail overlay ─────────────────────────
check('Rename API exists', await page.evaluate(()=>typeof _renameSession==='function'));
const renamed=await page.evaluate(async()=>{
  sessions.length=0;
  sessions.push({week:'1',day:'Mon',session:'Zone 2 run',dist:'8',pace:'5:20',feel:4,ts:Date.now(),gid:'r1'});
  openLogOverlay(0);
  _renameSession();
  const inp=document.getElementById('lo-title-input');
  const hadInput=!!inp;
  inp.value='Sunrise Hill Repeats';
  inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await new Promise(r=>setTimeout(r,60));
  return { hadInput, name:sessions[0].session, title:document.getElementById('lo-title').textContent };
});
check('Tapping ✎ swaps the title to an input', renamed.hadInput);
check('Enter commits the new name to the session', renamed.name==='Sunrise Hill Repeats', renamed.name);
check('The detail title reflects the renamed session', renamed.title==='Sunrise Hill Repeats', renamed.title);
// Escape cancels without changing the name
const cancelled=await page.evaluate(async()=>{
  openLogOverlay(0); _renameSession();
  const inp=document.getElementById('lo-title-input'); inp.value='WRONG';
  inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await new Promise(r=>setTimeout(r,60));
  return sessions[0].session;
});
check('Escape cancels the rename (name unchanged)', cancelled==='Sunrise Hill Repeats', cancelled);
// Blank rename is ignored
const blank=await page.evaluate(async()=>{
  openLogOverlay(0); _renameSession();
  const inp=document.getElementById('lo-title-input'); inp.value='   ';
  inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await new Promise(r=>setTimeout(r,60));
  return sessions[0].session;
});
check('Blank rename is ignored (keeps prior name)', blank==='Sunrise Hill Repeats', blank);

// ── Legacy Today never shows the last/Saturday session on a rest day ─────────
const rest=await page.evaluate(()=>{
  savedProgram=null; try{localStorage.removeItem('ht-program');}catch(e){}
  const todayDow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
  const pwk=PLAN[currentPlanWeek];
  const scheduled = pwk.sessions.find(s=>s.day===todayDow) || null;
  const lastSess = pwk.sessions[pwk.sessions.length-1];
  try{ renderToday(); }catch(e){ return {err:String(e)}; }
  const txt=(document.getElementById('today-session').textContent||'').trim();
  return { todayDow, scheduled:scheduled?scheduled.session:null, lastDay:lastSess.day, lastSess:lastSess.session, txt };
});
check('Legacy Today renders without error', !rest.err, JSON.stringify(rest).slice(0,120));
if (rest.scheduled===null && rest.lastDay!==rest.todayDow){
  check('Rest day → shows Rest, NOT the last (Saturday) session', /rest/i.test(rest.txt) && !rest.txt.includes(rest.lastSess), JSON.stringify(rest));
} else {
  check("Today is a scheduled day → shows today's session", rest.txt.includes(rest.scheduled||''), JSON.stringify(rest));
}

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
