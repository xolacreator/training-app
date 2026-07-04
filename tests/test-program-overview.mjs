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
await page.evaluate(()=>{
  saveProgramData({ id:'ov', name:'Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:8, sessionsPerWeek:4,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'easy',type:'endurance',name:'Easy',runType:'easy'}],
    dayMap:['tempo',null,'easy',null,'tempo',null,'easy'],
    weeklyProgressions:[{week:1},{week:2,setsAdd:1},{week:3,setsAdd:2},{week:4,deload:true},{week:5,setsAdd:2},{week:6,setsAdd:3},{week:7,setsAdd:3},{week:8,setsAdd:1},{week:9,deload:true}] });
});
await page.evaluate(()=>{ nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(2); });
await page.waitForTimeout(200);
const vis=await page.evaluate(()=>getComputedStyle(document.getElementById('plan-overview')).display!=='none');
check('Overview visible when a program is active', vis);
const phases=await page.evaluate(()=>_programPhases(savedProgram).map(p=>p.phase));
check('Phases: Base→Build→Peak with Deload + final Taper', phases.includes('Base')&&phases.includes('Build')&&phases.includes('Peak')&&phases.includes('Deload')&&phases[phases.length-1]==='Taper', JSON.stringify(phases));
await page.evaluate(()=>_toggleProgramOverview());
await page.waitForTimeout(150);
const txt=await page.evaluate(()=>document.getElementById('plan-overview').innerText);
check('Detail table lists week rows (W1..W8 + DL)', /W1/.test(txt)&&/W8/.test(txt)&&/DL/.test(txt));
check('Deload load bar shorter than peak (load factor)', await page.evaluate(()=>_weekLoadFactor(savedProgram,4) < _weekLoadFactor(savedProgram,7)));
// Overview hidden in the legacy (non-program) plan
await page.evaluate(()=>{ savedProgram=null; localStorage.removeItem('ht-program'); nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1); });
await page.waitForTimeout(150);
const hidden=await page.evaluate(()=>getComputedStyle(document.getElementById('plan-overview')).display==='none');
check('Overview hidden in legacy PLAN view', hidden);
const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
