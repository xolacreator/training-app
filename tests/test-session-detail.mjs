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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── Endurance: a generated tempo session shows purpose + warm-up/main/cool-down + cue
await page.evaluate(()=>{
  saveProgramData({ id:'end-test', name:'Threshold Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:6, sessionsPerWeek:4,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo Run',runType:'tempo',focus:'Lactate threshold'},
              {id:'easy',type:'endurance',name:'Easy Run',runType:'easy',focus:'Aerobic base'}],
    dayMap:['tempo',null,'easy',null,'tempo',null,'easy'],
    weeklyProgressions:[{week:1},{week:2},{week:3},{week:4},{week:5},{week:6}] });
});
await page.evaluate(()=>openProgramSessionOverlay('tempo',3,'Mon'));
await page.waitForTimeout(250);
const eTxt=await page.locator('#po-breakdown').innerText();
check('Endurance: Purpose section present', /purpose/i.test(eTxt));
check('Endurance: Purpose is KB-driven (lactate threshold)', /lactate|threshold/i.test(eTxt));
check('Endurance: Warm-up section present', /warm-?up/i.test(eTxt), eTxt.slice(0,40));
check('Endurance: Main set section present', /main set/i.test(eTxt));
check('Endurance: Cool-down section present', /cool-?down/i.test(eTxt));
check('Endurance: execution cue present (comfortably hard)', /comfortably hard/i.test(eTxt));

// The KB-driven coaching helper returns the matching domain's adaptation + cue
const ec=await page.evaluate(()=>_enduranceCoaching('tempo'));
check('_enduranceCoaching(tempo) → Lactate Threshold adaptation', /lactate threshold/i.test(ec.adaptation), ec.adaptation);
check('_enduranceCoaching has warmup/cooldown/cue/purpose', !!(ec.warmup&&ec.cooldown&&ec.cue&&ec.purpose));
const ecEasy=await page.evaluate(()=>_enduranceCoaching('easy'));
check('_enduranceCoaching(easy) cue differs from tempo', ecEasy.cue!==ec.cue);

// ── Strength: a generated strength session shows purpose + warm-up/cool-down
await page.evaluate(()=>{
  localStorage.removeItem('ht-program'); savedProgram=null;
  saveProgramData({ id:'str-test', name:'Strength Block', type:'strength', startDate:_mondayISO(new Date()), weeks:4, sessionsPerWeek:3,
    sessions:[{id:'lower',type:'strength',name:'Lower A',focus:'Maximal strength',exercises:[
      {name:'Back Squat',sets:4,reps:'5',load:'80% 1RM',rest:'3 min',cue:'brace, knees track toes'},
      {name:'Romanian Deadlift',sets:3,reps:'8',load:'RPE 8'}]}],
    dayMap:['lower',null,null,null,'lower',null,null],
    weeklyProgressions:[{week:1},{week:2,setsAdd:1},{week:3},{week:4}] });
});
await page.evaluate(()=>openProgramSessionOverlay('lower',2,'Mon'));
await page.waitForTimeout(250);
const sTxt=await page.locator('#po-breakdown').innerText();
check('Strength: Purpose section present', /purpose/i.test(sTxt));
check('Strength: Purpose is KB-driven (maximal strength)', /maximal strength|force production/i.test(sTxt));
check('Strength: Warm-up section present', /warm-?up/i.test(sTxt));
check('Strength: Cool-down section present', /cool-?down/i.test(sTxt));
check('Strength: week-2 set bump applied (5×5)', /5×5|5 ×5|5x5/i.test(sTxt), sTxt.match(/\d+×\d+/g)?.join(',')||'');
check('Strength: exercise cue still shown', /brace, knees track toes/i.test(sTxt));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
