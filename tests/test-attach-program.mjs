import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
function mondayISO(dt){const d=new Date(dt);d.setHours(0,0,0,0);const dow=d.getDay();d.setDate(d.getDate()+(dow===0?-6:1-dow));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const START=mondayISO(new Date());
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});
// Program with a Monday run
await page.evaluate((START)=>{
  saveProgramData({ id:'p1', name:'Block', type:'endurance', startDate:START, weeks:4, sessionsPerWeek:3,
    sessions:[{id:'long',type:'endurance',name:'Long Run',runType:'long'},{id:'tempo',type:'endurance',name:'Tempo Run',runType:'tempo'},{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'}],
    dayMap:['tempo',null,'easy',null,'long',null,null],
    weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}] });
},START);
// An imported (unlinked) session on the program's Monday (week 1)
await page.evaluate((START)=>{
  sessions.unshift({ week:'1', day:'Mon', session:'Zone 2 Run', intensity:'easy', pace:'5:20', dist:'8.00', hr:'150', dur:'42', feel:'', notes:'File: Indoor run', ts:new Date(START+'T09:00:00').getTime(), gid:'file-abc' });
  saveData();
},START);
// Before: Monday tempo not done
const before=await page.evaluate(()=>_progSessionDone(1,'tempo'));
check('Monday session not done before attaching', before===false);
// Open the imported session's detail
await page.evaluate(()=>{ const i=sessions.findIndex(s=>s.gid==='file-abc'); openLogOverlay(i); });
await page.waitForTimeout(200);
const attachTxt=await page.evaluate(()=>document.getElementById('lo-attach').innerText);
check('Attach control shows program-tracking picker', /program tracking/i.test(attachTxt) && /attach/i.test(attachTxt), attachTxt.slice(0,60));
check('Monday slot flagged as matching (★)', /★/.test(attachTxt));
// Attach to Monday's tempo
await page.evaluate(()=>{ const i=sessions.findIndex(s=>s.gid==='file-abc'); attachLogToProgram(i,1,'tempo'); });
await page.waitForTimeout(200);
const s=await page.evaluate(()=>sessions.find(s=>s.gid==='file-abc'));
check('Session stamped with progId/progWeek/progSid', s.progId==='p1'&&String(s.progWeek)==='1'&&s.progSid==='tempo', JSON.stringify({id:s.progId,wk:s.progWeek,sid:s.progSid}));
check('Monday tempo now counts as done', await page.evaluate(()=>_progSessionDone(1,'tempo'))===true);
// Overlay now shows linked state with Unlink
const linkedTxt=await page.evaluate(()=>document.getElementById('lo-attach').innerText);
check('Linked state shows "Counts toward" + Unlink', /counts toward/i.test(linkedTxt)&&/unlink/i.test(linkedTxt), linkedTxt.slice(0,60));
// Unlink
await page.evaluate(()=>{ const i=sessions.findIndex(s=>s.gid==='file-abc'); unlinkLogFromProgram(i); });
await page.waitForTimeout(150);
check('Unlink clears completion', await page.evaluate(()=>_progSessionDone(1,'tempo'))===false);
check('Unlink removes stamps', await page.evaluate(()=>{const s=sessions.find(s=>s.gid==='file-abc');return !s.progSid&&!s.progId;}));
const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
