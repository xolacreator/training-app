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

// ── FITSTOP_KB inlined + Fitstop intelligence
const kb=await page.evaluate(()=>({v:FITSTOP_KB.version,n:FITSTOP_KB.sessions.length}));
check('FITSTOP_KB inlined (v1, 4 sessions)', kb.v===1 && kb.n===4, JSON.stringify(kb));
const lift=await page.evaluate(()=>fitstopIntel('LIFT'));
check('fitstopIntel(LIFT) → force_production primary + evidence tags', lift && lift.primary.includes('force_production') && lift.evidence.structure==='verified' && lift.evidence.load==='assumed', JSON.stringify({p:lift.primary,e:lift.evidence}));
check('LIFT has high run interference + strength contribution', lift.runInterference>=0.6 && lift.strengthContribution>=0.7, JSON.stringify({ri:lift.runInterference,sc:lift.strengthContribution}));
const perform=await page.evaluate(()=>fitstopIntel('PERFORM'));
check('fitstopIntel(PERFORM) → work_capacity primary, conditioning-biased', perform.primary.includes('work_capacity') && perform.conditioningContribution>perform.strengthContribution, JSON.stringify({p:perform.primary}));
// Phase scaling: PEAK LIFT costs more than BASE LIFT (neuro/mechanical/recovery)
const scale=await page.evaluate(()=>({base:fitstopIntel('LIFT','BASE').load, peak:fitstopIntel('LIFT','PEAK').load}));
check('LIFT load scales up BASE→PEAK (recovery + neuro)', scale.peak.recoveryHours>scale.base.recoveryHours && scale.peak.neurological>=scale.base.neurological, JSON.stringify(scale));

// ── Every session type resolves to a load vector (run / strength / fitstop; program + logged)
const vecs=await page.evaluate(()=>({
  progRun: sessionLoadVector({type:'endurance',runType:'intervals',name:'VO2'}),
  progStr: sessionLoadVector({type:'strength',name:'Lower'}),
  progFit: sessionLoadVector({type:'fitstop',name:'LIFT'}),
  logRun:  sessionLoadVector({cat:'run',session:'Threshold Intervals'}),
  logStr:  sessionLoadVector({cat:'strength',session:'Back Squat day'}),
  logFit:  sessionLoadVector({cat:'mixed',session:'PERFORM'}),
}));
const has4=v=>['mechanical','metabolic','neurological','connective','recoveryHours'].every(k=>typeof v[k]==='number');
check('Program run/strength/fitstop each resolve to a full vector', has4(vecs.progRun)&&has4(vecs.progStr)&&has4(vecs.progFit) && vecs.progRun.metabolic>0, JSON.stringify(vecs.progRun));
check('Logged run/strength/fitstop each resolve to a full vector', has4(vecs.logRun)&&has4(vecs.logStr)&&has4(vecs.logFit) && vecs.logStr.neurological>0, JSON.stringify(vecs.logStr));
check('Logged interval run maps to a hard (track) vector', vecs.logRun.metabolic>=8, JSON.stringify(vecs.logRun));

// ── Weekly fatigue budget accumulates from logged sessions
const bud=await page.evaluate(()=>{
  sessions.length=0;
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  // three hard sessions this week
  sessions.push({cat:'run',session:'VO2 Intervals',date:iso(1),ts:Date.now()-1*86400000,gid:'a'});
  sessions.push({cat:'strength',session:'Heavy Lower',date:iso(2),ts:Date.now()-2*86400000,gid:'b'});
  sessions.push({cat:'run',session:'Threshold Tempo',date:iso(3),ts:Date.now()-3*86400000,gid:'c'});
  // one OLD session outside the 7-day window — must be excluded
  sessions.push({cat:'run',session:'Old Long Run',date:iso(20),ts:Date.now()-20*86400000,gid:'old'});
  saveData();
  return weeklyFatigueBudget();
});
check('Budget has used/budget/remaining/pct per axis', bud && bud.used.metabolic>0 && bud.budget.mechanical>0 && ['mechanical','metabolic','neurological','connective'].every(a=>typeof bud.pct[a]==='number'), JSON.stringify(bud.used));
check('Budget excludes sessions older than 7 days', await page.evaluate(()=>{ const withOld=weeklyFatigueUsed().metabolic; return withOld; })>0 && bud.used.metabolic < 40, bud.used.metabolic);
check('worstAxis + overBudget flag present', typeof bud.worstAxis==='string' && typeof bud.overBudget==='boolean', JSON.stringify({w:bud.worstAxis,o:bud.overBudget}));

// ── Over-budget week pushes recovery up + discounts spent-axis adaptations (opt-in)
const gated=await page.evaluate(()=>{
  sessions.length=0;
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  // Blow the budget: 6 hard interval/strength days
  for(let i=0;i<6;i++) sessions.push({cat:i%2?'strength':'run',session:i%2?'Heavy Lower':'VO2 Intervals',date:iso(i),ts:Date.now()-i*86400000,gid:'g'+i});
  saveData();
  const b=weeklyFatigueBudget();
  const noBudget=rankAdaptationsByValue(requiredAdaptationsFor('endurance'),{useBudget:false,readiness:80});
  const withBudget=rankAdaptationsByValue(requiredAdaptationsFor('endurance'),{useBudget:true,readiness:80});
  const recNo=noBudget.ranked.find(r=>r.id==='recovery').value;
  const recYes=withBudget.ranked.find(r=>r.id==='recovery').value;
  return {over:b.overBudget, recNo, recYes, topNo:noBudget.priority.id, topYes:withBudget.priority.id};
});
check('Heavy week registers as over budget', gated.over===true, JSON.stringify(gated));
check('Budget gate raises recovery value vs no-budget', gated.recYes>gated.recNo, JSON.stringify({no:gated.recNo,yes:gated.recYes}));

// ── Ranker is unchanged by default (generation path): useBudget off → identical to before
const unchanged=await page.evaluate(()=>{
  const a=rankAdaptationsByValue(requiredAdaptationsFor('endurance'),{readiness:70});          // default (no budget)
  const b=rankAdaptationsByValue(requiredAdaptationsFor('endurance'),{readiness:70,useBudget:false});
  return JSON.stringify(a.ranked.map(r=>[r.id,r.value]))===JSON.stringify(b.ranked.map(r=>[r.id,r.value]));
});
check('Default ranker (no useBudget) unaffected by budget — generation safe', unchanged);

// ── planTodayAdaptation surfaces the budget; AthleteState carries it
const plan=await page.evaluate(()=>planTodayAdaptation({type:'endurance',goal:'marathon',readiness:70}));
check('planTodayAdaptation includes fatigueBudget snapshot', plan && plan.fatigueBudget && plan.fatigueBudget.budget && typeof plan.fatigueBudget.worstAxis==='string', JSON.stringify(plan&&!!plan.fatigueBudget));
const as=await page.evaluate(()=>{ recomputeAthleteState(); return athleteState().fatigue; });
check('AthleteState.fatigue carries the vector budget (+ keeps acute/chronic/acwr)', as && as.budget && as.budget.used && typeof as.acwr!=='undefined', JSON.stringify({acwr:as.acwr,hasBudget:!!as.budget}));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
