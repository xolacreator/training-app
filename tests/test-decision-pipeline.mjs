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

// ── API exists
check('Pipeline API exists', await page.evaluate(()=>
  typeof runDecisionPipeline==='function' && typeof decisionQuestions==='function' && typeof validateDecision==='function' && typeof openDecisionInspector==='function'));

// ── Seed an athlete: goal + program + some history + readiness
await page.evaluate(()=>{
  localStorage.setItem('ht-goal','Sub-3 marathon'); trainGoal='Sub-3 marathon';
  saveProgramData({ id:'pp', name:'Marathon Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:12, sessionsPerWeek:5,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'}], dayMap:['tempo',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1})) });
  sessions.length=0;
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  sessions.push({cat:'run',session:'Easy Run',date:iso(1),ts:Date.now()-1*86400000,gid:'a'});
  recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:72});
  saveData(); recomputeAthleteState();
});

// ── Pipeline produces a populated DecisionRecord
const rec=await page.evaluate(()=>runDecisionPipeline());
check('Pipeline returns a DecisionRecord (v1, id, asOf)', rec && rec.v===1 && !!rec.id && !!rec.asOf, JSON.stringify({v:rec&&rec.v,id:!!(rec&&rec.id)}));
check('Record carries objective/adaptation/prescription', rec.objective && rec.adaptation && rec.adaptation.id && rec.prescription && rec.prescription.id, JSON.stringify({obj:!!rec.objective,ad:rec.adaptation&&rec.adaptation.id,rx:rec.prescription&&rec.prescription.id}));
check('Record carries constraints + alternatives + validation + confidence', Array.isArray(rec.constraints)&&rec.constraints.length>0 && Array.isArray(rec.alternatives) && rec.validation && typeof rec.confidence==='number', JSON.stringify({c:rec.constraints.length,a:rec.alternatives.length,conf:rec.confidence}));
check('Record snapshots athlete state + adaptation stock + budget', rec.state && rec.state.program && Array.isArray(rec.adaptationStock) && rec.fatigueBudget, JSON.stringify({st:!!rec.state,stock:rec.adaptationStock.length,bud:!!rec.fatigueBudget}));

// ── Alternatives are real runners-up with a why-not
check('Alternatives are other adaptations w/ value + whyNot', rec.alternatives.every(a=>a.id&&a.id!==rec.adaptation.id&&typeof a.value==='number'&&a.whyNot), JSON.stringify(rec.alternatives[0]));

// ── The seven coaching questions are all answered
const qs=await page.evaluate(()=>decisionQuestions(runDecisionPipeline()));
check('decisionQuestions returns exactly 7 Q&A', qs.length===7, qs.length);
check('All seven questions have non-empty answers', qs.every(x=>x.q&&x.a&&x.a.length>3), JSON.stringify(qs.map(x=>x.a.length)));
const qtext=qs.map(x=>x.q.toLowerCase()).join(' | ');
check('Covers who/achieved-remaining/fatigue/highest-value/prescription/alternatives/why',
  /who is this athlete/.test(qtext)&&/achieved vs/.test(qtext)&&/fatigue exists/.test(qtext)&&/highest-value/.test(qtext)&&/which prescription/.test(qtext)&&/alternatives/.test(qtext)&&/best decision/.test(qtext), qtext);
const whoA=qs[0].a, whyA=qs[6].a;
check('Q1 (who) reflects the real goal + program week', /Sub-3 marathon/.test(whoA)&&/week/i.test(whoA), whoA);
check('Q7 (why) includes validation + confidence', /confidence/i.test(whyA)&&/%/.test(whyA), whyA);

// ── DECISION_LOG accumulates records
const logGrew=await page.evaluate(()=>{ const b=DECISION_LOG.length; runDecisionPipeline(); return DECISION_LOG.length>b; });
check('runDecisionPipeline appends to DECISION_LOG', logGrew);

// ── Validation flags an inappropriate decision: over-budget week → recovery, warns if not
const val=await page.evaluate(()=>{
  // blow the budget with hard days
  sessions.length=0;
  const iso=off=>{const d=new Date();d.setDate(d.getDate()-off);return d.toISOString().slice(0,10);};
  for(let i=0;i<6;i++) sessions.push({cat:i%2?'strength':'run',session:i%2?'Heavy Lower':'VO2 Intervals',date:iso(i),ts:Date.now()-i*86400000,gid:'g'+i});
  recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:30}); // low readiness
  saveData(); recomputeAthleteState();
  const r=runDecisionPipeline();
  return { chosen:r.adaptation.id, ok:r.validation.ok, warns:r.validation.warnings, conf:r.confidence };
});
check('Over-budget + low readiness → recovery prioritised', val.chosen==='recovery', JSON.stringify(val));
check('Validation passes when recovery is correctly chosen under stress', val.ok===true, JSON.stringify(val.warns));

// ── validateDecision independently flags a non-recovery pick under stress
const flag=await page.evaluate(()=>validateDecision({adaptation:{id:'vo2max'},readiness:30,budget:{overBudget:true}}));
check('validateDecision warns on hard adaptation at low readiness + over budget', flag.ok===false && flag.warnings.length>=2, JSON.stringify(flag.warnings));

// ── Confidence is bounded 0.2–0.95
const confRange=await page.evaluate(()=>{ const r=runDecisionPipeline(); return r.confidence>=0.2&&r.confidence<=0.95; });
check('Confidence stays within [0.2, 0.95]', confRange);

// ── Inspector opens the sheet with the decision + all 7 numbered answers
const ui=await page.evaluate(()=>{
  // restore a healthy athlete so a training adaptation is chosen
  sessions.length=0; recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:75}); saveData(); recomputeAthleteState();
  openDecisionInspector();
  const html=document.getElementById('ins-content').innerHTML;
  const open=document.getElementById('ins-sheet').classList.contains('open');
  return { open, title:/Why this session/.test(html), conf:/% confident/.test(html), seven:(html.match(/border-bottom:\.5px solid var\(--border\)/g)||[]).length };
});
check('openDecisionInspector opens sheet titled "Why this session?"', ui.open && ui.title, JSON.stringify(ui));
check('Inspector shows confidence bar + 7 answer rows', ui.conf && ui.seven>=7, JSON.stringify(ui));

// ── Today priority card is now tappable into the inspector
await page.evaluate(()=>{ try{ nav('today', document.querySelectorAll('.nb')[0]); _renderAdaptationPriority(); }catch(e){} });
await page.waitForTimeout(150);
const card=await page.evaluate(()=>{ const el=document.getElementById('adaptation-priority'); return el?{html:el.innerHTML.includes('openDecisionInspector'),why:/Why\? ›/.test(el.innerHTML)}:{html:false,why:false}; });
check('Today priority card links to the inspector (Why? ›)', card.html && card.why, JSON.stringify(card));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
