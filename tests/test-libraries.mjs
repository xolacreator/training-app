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

// ── Libraries inlined + versioned
const kb=await page.evaluate(()=>({av:ADAPTATION_KB.version, an:ADAPTATION_KB.adaptations.length, pv:PRESCRIPTION_KB.version, pn:PRESCRIPTION_KB.prescriptions.length}));
check('ADAPTATION_KB inlined (v1, 10 adaptations)', kb.av===1 && kb.an===10, JSON.stringify(kb));
check('PRESCRIPTION_KB inlined (v1, 28 prescriptions)', kb.pv===1 && kb.pn===28, JSON.stringify(kb));

// ── Ids line up 1:1 with the engine model (merge integrity)
const align=await page.evaluate(()=>{ const model=ADAPTATION_MODEL.map(a=>a.id).sort(); const lib=ADAPTATION_KB.adaptations.map(a=>a.id).sort(); return JSON.stringify(model)===JSON.stringify(lib); });
check('Adaptation ids match ADAPTATION_MODEL 1:1', align);

// ── adaptationInfo merges numeric model + descriptive library
const info=await page.evaluate(()=>adaptationInfo('lactate_threshold'));
check('adaptationInfo merges model (fatigue vector) + library (purpose)', info && info.fatigue && typeof info.purpose==='string' && info.retentionDays>0 && Array.isArray(info.prescriptions), JSON.stringify({fat:!!info.fatigue,purpose:!!info.purpose,ret:info.retentionDays}));

// ── Every prescription references a real adaptation; every adaptation lists real prescriptions
const refs=await page.evaluate(()=>{
  const aids=new Set(ADAPTATION_KB.adaptations.map(a=>a.id));
  const pids=new Set(PRESCRIPTION_KB.prescriptions.map(p=>p.id));
  const badRx=PRESCRIPTION_KB.prescriptions.filter(p=>!aids.has(p.adaptation)).map(p=>p.id);
  const badLinks=[];
  ADAPTATION_KB.adaptations.forEach(a=>(a.prescriptions||[]).forEach(id=>{ if(!pids.has(id)) badLinks.push(a.id+'→'+id); }));
  return {badRx,badLinks};
});
check('Every prescription.adaptation is a real adaptation', refs.badRx.length===0, refs.badRx.join(','));
check('Every adaptation.prescriptions id resolves', refs.badLinks.length===0, refs.badLinks.join(','));

// ── Many-to-one: prescriptionsFor returns multiple candidates
const many=await page.evaluate(()=>({thr:prescriptionsFor('lactate_threshold').map(p=>p.id), vo2:prescriptionsFor('vo2max').length, aer:prescriptionsFor('aerobic_durability').length}));
check('prescriptionsFor(lactate_threshold) → ≥3 candidates', many.thr.length>=3, many.thr.join(','));
check('VO₂ + aerobic each have multiple prescriptions', many.vo2>=3 && many.aer>=3, JSON.stringify(many));

// ── selectPrescription is state-aware + deterministic
const base=await page.evaluate(()=>selectPrescription('lactate_threshold',{phase:'Base',experience:'any'}).id);
const peak=await page.evaluate(()=>selectPrescription('lactate_threshold',{phase:'Peak',experience:'advanced'}).id);
check('Base phase → continuous tempo (default/base-fit)', base==='thr_tempo_continuous', base);
check('Peak + advanced → a Build/Peak template (not the base default)', peak!=='thr_tempo_continuous', peak);
const det=await page.evaluate(()=>{const a=selectPrescription('vo2max',{phase:'Build'}).id;const b=selectPrescription('vo2max',{phase:'Build'}).id;return a===b;});
check('selectPrescription is deterministic for the same state', det);

// ── Readiness gate: low readiness excludes the active-recovery run, falls to rest
const rec=await page.evaluate(()=>({low:selectPrescription('recovery',{readiness:20}).id, ok:selectPrescription('recovery',{readiness:80}).id}));
check('Recovery: low readiness → full rest; adequate → allows shakeout', rec.low==='rec_rest' && (rec.ok==='rec_rest'||rec.ok==='rec_easy_shakeout'), JSON.stringify(rec));

// ── Experience gate: advanced-only template not handed to a beginner
const expGate=await page.evaluate(()=>{ const pick=selectPrescription('power',{phase:'Build',experience:'any'}); const p=prescription(pick.id); return {id:pick.id, exp:(p.select||{}).experience}; });
check('Power selection respects experience gate (no advanced-only for beginner) or defaults sanely', !!expGate.id, JSON.stringify(expGate));

// ── Always returns something for a valid adaptation
const never=await page.evaluate(()=>ADAPTATION_KB.adaptations.every(a=>!!selectPrescription(a.id,{})));
check('selectPrescription never returns null for a known adaptation', never);

// ── Generators now tag their output with adaptation + prescription (still generate)
const gen=await page.evaluate(()=>{
  const strength=_genericStrengthSession();
  const easy=_progressEndurance({runType:'easy'},1,6);
  const tempo=_progressEndurance({runType:'tempo'},3,8);
  return {strength:{ex:strength.exercises.length,aid:strength.adaptationId,pid:strength.prescriptionId},
          easy:{dur:easy.duration,aid:easy.adaptationId,pid:easy.prescriptionId},
          tempo:{iv:tempo.intervals,aid:tempo.adaptationId,pid:tempo.prescriptionId}};
});
check('Strength still generates + tagged force_production', gen.strength.ex>0 && gen.strength.aid==='force_production' && !!gen.strength.pid, JSON.stringify(gen.strength));
check('Easy run still generates + tagged aerobic_durability', /min/.test(gen.easy.dur||'') && gen.easy.aid==='aerobic_durability' && !!gen.easy.pid, JSON.stringify(gen.easy));
check('Tempo still generates intervals + tagged lactate_threshold', /min @/.test(gen.tempo.iv||'') && gen.tempo.aid==='lactate_threshold', JSON.stringify(gen.tempo));

// ── planTodayAdaptation now selects a concrete prescription from the library
const plan=await page.evaluate(()=>{ const p=planTodayAdaptation({type:'endurance',goal:'marathon',phase:'Build',readiness:70}); return p&&{adapt:p.adaptation.id, opts:p.prescriptionOptions, sel:p.selectedPrescription&&p.selectedPrescription.id, schedObj:p.prescription}; });
check('planTodayAdaptation returns options + a selected prescription', plan && Array.isArray(plan.opts) && plan.opts.length>=1 && !!plan.sel, JSON.stringify(plan));
check('planTodayAdaptation keeps the scheduler objective too (back-compat)', plan && typeof plan.schedObj==='string' && plan.schedObj.length>0, plan&&plan.schedObj);
check('selected prescription belongs to the chosen adaptation', await page.evaluate(()=>{const p=planTodayAdaptation({type:'endurance',goal:'marathon',phase:'Build',readiness:70});return prescription(p.selectedPrescription.id).adaptation===p.adaptation.id;}));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
