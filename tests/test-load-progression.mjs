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

const curve=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-7);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1, deload:i===8}))});
  recomputeAthleteState();
  const out=[]; for(let w=1;w<=9;w++) out.push(+_weekLoadFactor(savedProgram,w).toFixed(3));
  return out;
});
console.log('load curve w1..w9:', curve.join('  '));

check('Not every week is 1.0 any more', new Set(curve.slice(0,7)).size>1, curve.join(','));
check('Load rises across the build', curve[6]>curve[0], `w1=${curve[0]} w7=${curve[6]}`);
check('The deload week is the lightest', curve[8]===Math.min(...curve), `deload=${curve[8]} min=${Math.min(...curve)}`);
check('Week 4 backs off relative to week 3', curve[3]<curve[2], `w3=${curve[2]} w4=${curve[3]}`);
check('The backoff survives a high setsAdd (the old clamp erased it)', await page.evaluate(()=>{
  savedProgram.weeklyProgressions.forEach(p=>p.setsAdd=3);
  const w3=_weekLoadFactor(savedProgram,3), w4=_weekLoadFactor(savedProgram,4);
  return w4<w3; }));
check('Autoregulation is reflected in the displayed load', await page.evaluate(()=>{
  savedProgram.weeklyProgressions.forEach(p=>delete p.setsAdd);
  const before=_weekLoadFactor(savedProgram,5);
  savedProgram.autoReg={5:{loadScalar:0.6}};
  const after=_weekLoadFactor(savedProgram,5);
  delete savedProgram.autoReg;
  return after<before; }));
check('An empty week reports no load', await page.evaluate(()=>{
  const p=_clonePlan(savedProgram); p.dayMap=[null,null,null,null,null,null,null];
  p.overrides={}; const save=savedProgram; savedProgram=p;
  const v=_weekLoadFactor(p,3); savedProgram=save; return v===0; }));
check('The overview renders without error', await page.evaluate(()=>{
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(2);
  const el=document.getElementById('plan-overview');
  return !!el && el.innerHTML.length>50; }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
