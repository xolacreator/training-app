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

check('Coach-adjust API exists', await page.evaluate(()=>['coachAdjustWeek','_validatePlanAction','applyCoachPlanProposal','_coachPlanFallback','openCoachAdjust'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

await page.evaluate(()=>{
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],   // Mon easy · Wed tempo · Sat long
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recomputeAthleteState(); nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1);
});

// ── Guardrails: only valid actions on real days/sessions survive ─────────────
const v=await page.evaluate(()=>{
  const wk=_progActualWeek();
  const V=a=>_validatePlanAction(a,wk);
  return {
    goodMove:  !!V({action:'move',from:'Wed',to:'Thu',why:'travel'}),
    moveEmpty: V({action:'move',from:'Tue',to:'Thu'}),          // Tue is a rest day → invalid
    badDay:    V({action:'move',from:'Funday',to:'Thu'}),        // nonsense day
    sameDay:   V({action:'move',from:'Wed',to:'Wed'}),
    goodAdd:   !!V({action:'add',day:'Tue',type:'easy'}),
    badType:   V({action:'add',day:'Tue',type:'yoga'}),          // not in the allowed set
    goodRemove:!!V({action:'remove',day:'Sat'}),
    removeRest:V({action:'remove',day:'Fri'}),                   // nothing scheduled → invalid
    goodRename:!!V({action:'rename',day:'Mon',name:'Shakeout'}),
    junk:      V({action:'nuke_everything',day:'Mon'}),
  };
});
check('Valid move/add/remove/rename are accepted', v.goodMove && v.goodAdd && v.goodRemove && v.goodRename, JSON.stringify(v));
check('Move from a rest day is rejected', v.moveEmpty===null);
check('Unknown day is rejected', v.badDay===null);
check('Same-day move is rejected', v.sameDay===null);
check('Unknown session type is rejected', v.badType===null);
check('Removing an empty day is rejected', v.removeRest===null);
check('Unknown action verb is rejected', v.junk===null);

// ── Applying a proposal mutates the plan (and only the current week forward) ──
const applied=await page.evaluate(()=>{
  const wk=_progActualWeek();
  _coachPlanProposal={ week:wk, summary:'Test', actions:[
    {action:'move',from:'Wed',to:'Thu',why:'travel Wednesday'},
    {action:'add',day:'Tue',type:'easy',why:'aerobic volume'},
  ]};
  const n=applyCoachPlanProposal();
  const dm=savedProgram.dayMap;
  return { n, thu:dm[3], wed:dm[2], tue:dm[1], cleared:_coachPlanProposal===null };
});
check('Applying the proposal performs each action', applied.n===2 && applied.thu==='tempo' && applied.wed==null && applied.tue!=null, JSON.stringify(applied));
check('Proposal is cleared after applying', applied.cleared);

// ── No AI key → deterministic engine fallback, never a dead end ──────────────
const fb=await page.evaluate(async()=>{
  try{ localStorage.removeItem('ht-ai-key'); localStorage.removeItem('ht-strava-worker'); stravaWorker=''; }catch(e){}
  const r=await coachAdjustWeek('shuffle my week');
  const h=document.getElementById('ins-content').innerHTML;
  return { returned:r, fellBack:/this week|engine proposal|Not enough data/i.test(h) };
});
check('No AI key → falls back to the engine view (no crash)', fb.returned===null && fb.fellBack, JSON.stringify(fb));

// ── The editor exposes the coach entry point ────────────────────────────────
const ui=await page.evaluate(()=>{ togglePlanEdit(); const h=document.getElementById('plan-days').innerHTML; togglePlanEdit();
  return /Ask coach to adjust this week/.test(h) && /openCoachAdjust/.test(h); });
check('Edit mode shows "Ask coach to adjust this week"', ui);
check('CoachEV exposes adjustWeek + applyProposal + editSession', await page.evaluate(()=>['adjustWeek','applyProposal','editSession'].every(k=>typeof CoachEV.programming[k]==='function')));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
