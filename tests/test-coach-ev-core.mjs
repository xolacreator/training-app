import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-decision-log');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── The Core facade exists with every service ────────────────────────────────
check('CoachEV namespace exists + versioned', await page.evaluate(()=>typeof CoachEV==='object' && CoachEV.version==='1.0'));
check('All Core services present', await page.evaluate(()=>['athlete','knowledge','decision','programming','performance','explain','learning','feedback'].every(s=>typeof CoachEV[s]==='object')));
check('window.CoachEV exposed for devtools', await page.evaluate(()=>window.CoachEV===CoachEV));

// Seed a real program + a little history so the engines have something to reason over
await page.evaluate(()=>{
  const mon=(()=>{const d=new Date();const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day-7);return d.toISOString().slice(0,10);})();
  localStorage.setItem('ht-goal','Marathon');
  saveProgramData({id:'p',name:'Marathon Block',type:'endurance',startDate:mon,weeks:9,sessionsPerWeek:4,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['tempo',null,null,null,null,'long',null],weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  sessions.length=0;
  for(let i=2;i<26;i+=5) sessions.push({week:'2',day:'Wed',session:'Tempo',dist:'10',pace:'4:30',feel:4,date:iso(i),ts:Date.now()-i*86400000,gid:'r'+i});
  try{recomputeAthleteState();}catch(e){}
});

// ── Delegation: facade returns what the underlying engine returns ────────────
check('athlete.state() delegates to athleteState()', await page.evaluate(()=>{ const a=CoachEV.athlete.state(); return a && a.v>=1 && !!a.identity; }));
check('decision.today() delegates to planTodayAdaptation()', await page.evaluate(()=>{ const p=CoachEV.decision.today({type:'endurance',goal:'marathon'}); return p && !!p.adaptation; }));
check('knowledge.adaptations() returns the model', await page.evaluate(()=>Array.isArray(CoachEV.knowledge.adaptations()) && CoachEV.knowledge.adaptations().length>=10));
check('performance.trends() delegates to _progressTrends()', await page.evaluate(()=>Array.isArray(CoachEV.performance.trends())));
check('Facade never throws on a bad call (guarded)', await page.evaluate(()=>{ try { CoachEV.knowledge.adaptation('nope'); CoachEV.performance.sessionFatigue(null); return true; } catch(e){ return false; } }));

// ── Explainability Engine: the full decision trace ───────────────────────────
const ex=await page.evaluate(()=>CoachEV.explain.today({type:'endurance',goal:'marathon'}));
check('explain.today() is available + carries a recommendation', ex && ex.available===true && ex.recommendation && !!ex.recommendation.adaptation, JSON.stringify(ex&&ex.recommendation));
check('Trace has confidence (0–1)', ex && typeof ex.confidence==='number' && ex.confidence>0 && ex.confidence<=1, String(ex&&ex.confidence));
check('Trace lists which rules fired', ex && Array.isArray(ex.rulesFired) && ex.rulesFired.length>=1 && ex.rulesFired.every(r=>r.rule&&typeof r.passed==='boolean'), JSON.stringify(ex&&ex.rulesFired&&ex.rulesFired.slice(0,2)));
check('Trace ranks adaptations with a single chosen winner', ex && Array.isArray(ex.adaptationsRanked) && ex.adaptationsRanked.filter(a=>a.chosen).length===1, JSON.stringify(ex&&ex.adaptationsRanked&&ex.adaptationsRanked.map(a=>a.name+(a.chosen?'*':''))));
check('Ranked list is ordered high→low by value', ex && ex.adaptationsRanked.every((a,i,arr)=>i===0||(arr[i-1].value||0)>=(a.value||0)));
check('Trace surfaces alternatives with why-not', ex && Array.isArray(ex.alternatives) && ex.alternatives.every(a=>a.name&&a.whyNot));
check('Trace exposes the inputs that influenced it', ex && ex.inputs && 'readiness' in ex.inputs && 'fatigueBudget' in ex.inputs && Array.isArray(ex.inputs.required));
check('Trace carries provenance (decisionId + athleteStateAt)', ex && !!ex.decisionId && ('athleteStateAt' in ex));

// ── Missing-data: no readiness logged → flagged high-impact ──────────────────
const md=await page.evaluate(()=>CoachEV.explain.missingData());
check('missingData() flags absent readiness as high impact', Array.isArray(md) && md.some(g=>/readiness/i.test(g.gap)&&g.impact==='high'), JSON.stringify(md.map(g=>g.gap)));
check('Every gap has a concrete fix', md.every(g=>g.gap&&g.impact&&g.fix));

// ── Diagnostics (developer transparency) ─────────────────────────────────────
const dg=await page.evaluate(()=>CoachEV.diagnostics());
check('diagnostics() reports version + services + knowledge counts', dg && dg.version==='1.0' && dg.services.length>=8 && dg.knowledge.adaptations>=10, JSON.stringify({v:dg.version,adapt:dg.knowledge.adaptations}));
check('diagnostics() reports the last decision', dg && dg.decisions>=1 && dg.lastDecision && !!dg.lastDecision.adaptation, JSON.stringify(dg&&dg.lastDecision));

// ── Learning + Feedback engines are declared stubs (knowledge-first) ─────────
check('learning + feedback are inert stubs awaiting spec', await page.evaluate(()=>CoachEV.learning._status==='stub' && CoachEV.feedback._status==='stub' && CoachEV.learning.observe()===null));

// ── explain.trace reshapes an existing record (no second pipeline pass) ──────
check('explain.trace(record) explains an existing decision', await page.evaluate(()=>{ const rec=CoachEV.decision.pipeline({type:'endurance',goal:'marathon'}); const t=CoachEV.explain.trace(rec); return !!(t&&t.available&&t.decisionId===rec.id&&t.adaptationsRanked.length); }));

// ── The Decision Inspector surfaces the trace in the UI (Cycle 2) ────────────
check('Decision Inspector renders value-ranking + missing-data sections', await page.evaluate(()=>{ openDecisionInspector(); const h=document.getElementById('ins-content').innerHTML; return /Why this one/.test(h)&&/sharpen this call/.test(h); }));

// ── DURABILITY: the decision memory survives a reload ────────────────────────
const beforeReload=await page.evaluate(()=>{ CoachEV.decision.pipeline({type:'endurance',goal:'marathon'}); return { stored: !!localStorage.getItem('ht-decision-log'), n: JSON.parse(localStorage.getItem('ht-decision-log')||'[]').length }; });
check('A decision persists to localStorage', beforeReload.stored && beforeReload.n>=1, JSON.stringify(beforeReload));
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});
const afterReload=await page.evaluate(()=>CoachEV.decision.log().length);
check('Decision log is rehydrated after reload (memory survived)', afterReload>=1, 'log length='+afterReload);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
