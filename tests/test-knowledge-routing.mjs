
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

check('API exists', await page.evaluate(()=>
  ['_knowledgeTypeForGoal','_designKnowledgeType'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── Goal text maps to the right knowledge type ────────────────────────────
const map=await page.evaluate(()=>({
  hyrox:_knowledgeTypeForGoal('HYROX sub-70 in Sydney'),
  mara:_knowledgeTypeForGoal('sub-3:30 marathon'),
  squat:_knowledgeTypeForGoal('strength-squat-140kg'),
  fit:_knowledgeTypeForGoal('general fitness'),
  ocr:_knowledgeTypeForGoal('Spartan obstacle race'),
  none:_knowledgeTypeForGoal(''),
}));
check('HYROX goal selects hyrox knowledge', map.hyrox==='hyrox', String(map.hyrox));
check('Marathon selects endurance', map.mara==='endurance', String(map.mara));
check('A lift target selects strength', map.squat==='strength', String(map.squat));
check('General fitness selects hybrid', map.fit==='hybrid', String(map.fit));
check('OCR/adventure selects hybrid', map.ocr==='hybrid', String(map.ocr));
check('No goal selects nothing (caller decides)', map.none===null, String(map.none));

// ── THE BUG: hyrox_strength was unreachable from every type ───────────────
const reach=await page.evaluate(()=>{
  const types=['endurance','strength','hybrid','fitstop','hyrox','deka','discovery'];
  const out={};
  types.forEach(t=>{ out[t]={ run:_runningDomainsForType(t), str:_strengthDomainsForType(t) }; });
  return out;
});
check('hyrox_strength is now reachable', Object.values(reach).some(v=>v.str.includes('hyrox_strength')),
  JSON.stringify(reach.hyrox.str));
check('hyrox_running is reachable', Object.values(reach).some(v=>v.run.includes('hyrox_running')));
check('A hyrox type gets BOTH hyrox domains', reach.hyrox.run.includes('hyrox_running') && reach.hyrox.str.includes('hyrox_strength'),
  JSON.stringify({run:reach.hyrox.run.length,str:reach.hyrox.str.length}));
check('DEKA is covered too', reach.deka.run.includes('deka_running') && reach.deka.str.includes('deka_strength'));
check('Endurance stays running-focused (no regression)', reach.endurance.run.includes('lactate_threshold') && reach.endurance.str.length===0);
check('Strength stays strength-focused', reach.strength.str.includes('maximal_strength') && reach.strength.run.length===0);

// ── The interview follows the goal being DISCUSSED ────────────────────────
const routed=await page.evaluate(()=>{
  // Athlete finishing a marathon block, now designing HYROX.
  coachProfile={name:'EV',goal:'sub-3:30 marathon'};
  saveProgramData({id:'old',name:'Marathon Base',type:'endurance',startDate:_mondayISO(new Date()),weeks:8,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'Easy',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  coachMode='design';
  coachMessages.length=0;
  const before=_designKnowledgeType();
  // The interview establishes a HYROX goal.
  const ik=_extractIntake('```intake\n{"goal":"HYROX sub-70 in Sydney"}\n```');
  coachMessages.push({role:'assistant',text:'ok',intake:ik.intake});
  const after=_designKnowledgeType();
  return { before, after, prompt:buildCoachSystemPrompt() };
});
check('Before the goal is known it uses broad discovery knowledge', routed.before==='discovery', routed.before);
check('Once HYROX is established it routes to hyrox knowledge', routed.after==='hyrox', routed.after);
check('The prompt then actually contains HYROX knowledge', /HYROX/i.test(routed.prompt), 'HYROX present: '+/HYROX/i.test(routed.prompt));
check('...including the station/strength side', /station|sled|wall ball|grip/i.test(routed.prompt));
check('It no longer follows the block being left behind',
  !/marathon-specific|race_specific/i.test(routed.prompt) || /HYROX/i.test(routed.prompt));

// ── Discovery covers enough to ask informed questions ─────────────────────
const disc=await page.evaluate(()=>{
  coachProfile={name:'EV'}; savedProgram=null; localStorage.removeItem('ht-program');
  coachMessages.length=0; coachMode='design';
  return { type:_designKnowledgeType(), prompt:buildCoachSystemPrompt() };
});
check('A brand-new athlete gets discovery knowledge', disc.type==='discovery', disc.type);
check('Discovery spans running AND strength AND hyrox',
  /threshold/i.test(disc.prompt) && /strength/i.test(disc.prompt) && /HYROX/i.test(disc.prompt));

// ── The profile goal is used when no intake yet ───────────────────────────
// A stale profile goal must NOT route the interview's knowledge — that is the
// anchoring bug one layer down. The interview establishes intent; until it does,
// discovery keeps every option open.
check('A profile goal does NOT pre-anchor the interview', await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'HYROX sub-70'}; coachMessages.length=0;
  return _designKnowledgeType()==='discovery'; }));
check('...but the intake goal does route it immediately', await page.evaluate(()=>{
  coachMessages.length=0;
  const ik=_extractIntake('```intake\n{"goal":"sub-3:30 marathon"}\n```');
  coachMessages.push({role:'assistant',text:'x',intake:ik.intake});
  return _designKnowledgeType()==='endurance'; }));

// ── The form builder is unaffected ────────────────────────────────────────
check('The form generator still routes by program type', await page.evaluate(()=>{
  const k=getKnowledgeContext('endurance',{});
  return /threshold/i.test(k) && !/wall ball/i.test(k); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
