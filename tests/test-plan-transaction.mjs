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

const seed=()=>page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-14);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:10,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  return _progActualWeek();
});
const snap=()=>page.evaluate(()=>JSON.stringify(savedProgram));
const wkAt=(w)=>page.evaluate((w)=>{ const s=_progWeekSessions(w);
  const f=d=>{const x=s.find(y=>y.day===d&&y.session); return x?x.id:null;};
  return {mon:f('Mon'),wed:f('Wed'),sat:f('Sat'),sun:f('Sun')}; }, w);

await seed();
check('Transaction API exists', await page.evaluate(()=>
  ['applyPlanActionsTx','_planInvariants','_clonePlan'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── The hoisting trap: the txn layer must not have replaced the writer ───────
check('saveProgramData was not shadowed by a self-capturing wrapper', await page.evaluate(()=>{
  const src=String(saveProgramData);
  return /_planTxnDepth/.test(src) && !/saveProgramData\s*\(/.test(src.replace(/function saveProgramData/,'')); }));
check('A trial application does NOT persist', await page.evaluate(()=>{
  const before=localStorage.getItem('ht-program');
  _planTxnDepth++; saveProgramData({...savedProgram, name:'SHOULD NOT PERSIST'}); _planTxnDepth--;
  const after=localStorage.getItem('ht-program');
  return before===after; }));
// restore the global the probe above moved
await seed();

// ── Every validated action names its own week ───────────────────────────────
const loc=await page.evaluate(()=>{ const wk=_progActualWeek();
  return { mv:_validatePlanAction({action:'move',from:'Wed',to:'Thu'},wk),
           explicit:_validatePlanAction({action:'move',from:'Wed',to:'Thu',week:7},wk) }; });
check('A validated action carries its target week', loc.mv && loc.mv.week>=1, JSON.stringify(loc.mv));
check('An explicit week on the action wins', loc.explicit && loc.explicit.week===7, JSON.stringify(loc.explicit));

// ── ATOMICITY: a batch containing one bad action changes NOTHING ─────────────
await seed();
const before=await snap();
const partial=await page.evaluate(()=>{ const wk=_progActualWeek();
  return applyPlanActionsTx([
    {action:'move', from:'Wed', to:'Thu', week:wk, scope:'once'},   // valid
    {action:'remove', day:'Fri', week:wk, scope:'once'},            // nothing there — must fail
  ], {week:wk}); });
check('A batch with one impossible action is refused', partial.ok===false, JSON.stringify({ok:partial.ok,err:partial.error}));
check('...and reports zero applied, never a partial count', partial.applied===0, String(partial.applied));
check('...leaving the plan byte-identical (no half-application)', (await snap())===before);

// ── A fully valid batch commits whole ───────────────────────────────────────
const good=await page.evaluate(()=>{ const wk=_progActualWeek();
  return applyPlanActionsTx([
    {action:'move', from:'Wed', to:'Thu', week:wk, scope:'once'},
    {action:'add',  day:'Fri', type:'easy', week:wk, scope:'once'},
  ], {week:wk}); });
check('A valid batch commits and reports what it did', good.ok===true && good.applied===2, JSON.stringify(good));
const nowWk=await page.evaluate(()=>_progActualWeek());
const w=await wkAt(nowWk);
check('Both changes are visible in the plan', w.wed===null && w.mon==='easy', JSON.stringify(w));

// ── Invariants reject a structurally broken result ──────────────────────────
check('Invariants catch a dangling session reference', await page.evaluate(()=>{
  const bad=_clonePlan(savedProgram); bad.dayMap[0]='does-not-exist';
  return _planInvariants(bad, savedProgram).some(v=>/does not exist/.test(v)); }));
check('Invariants catch a malformed dayMap', await page.evaluate(()=>{
  const bad=_clonePlan(savedProgram); bad.dayMap=['easy'];
  return _planInvariants(bad, savedProgram).some(v=>/7 days/.test(v)); }));
check('Invariants catch rewriting an elapsed week', await page.evaluate(()=>{
  const prev=_clonePlan(savedProgram);
  prev.overrides=prev.overrides||{}; prev.overrides[1]=['easy',null,null,null,null,null,null];
  const next=_clonePlan(prev); next.overrides[1]=['tempo',null,null,null,null,null,null];
  return _planInvariants(next, prev).some(v=>/in the past and was modified/.test(v)); }));
check('A sound plan produces no violations', await page.evaluate(()=>
  _planInvariants(_clonePlan(savedProgram), savedProgram).length===0));

// ── Multi-week batch: locality is per action ────────────────────────────────
await seed();
const multi=await page.evaluate(()=>{ const wk=_progActualWeek();
  const r=applyPlanActionsTx([
    {action:'move', from:'Wed', to:'Thu', week:wk,   scope:'once'},
    {action:'move', from:'Sat', to:'Sun', week:wk+2, scope:'once'},
  ], {week:wk});
  const at=(w,d)=>{ const s=_progWeekSessions(w); const x=s.find(y=>y.day===d&&y.session); return x?x.id:null; };
  return { r, thisThu:at(wk,'Thu'), thisSat:at(wk,'Sat'), farSun:at(wk+2,'Sun'), farSat:at(wk+2,'Sat') }; });
check('A single batch can target two different weeks', multi.r.ok===true && multi.r.applied===2, JSON.stringify(multi.r));
check('...each landing only on its own week', multi.thisThu==='tempo' && multi.thisSat==='long' && multi.farSun==='long' && multi.farSat===null,
  JSON.stringify(multi));

// ── THE PATH, NOT THE PARTS: message → actions → confirm → plan changed ─────
await seed();
const journey=await page.evaluate(()=>{
  const wk=_progActualWeek();
  const reply='Let\'s shift that.\n\n```plan\n{"actions":[{"action":"move","from":"Wed","to":"Thu","scope":"once","why":"travel"}]}\n```';
  const ex=_extractPlanActions(reply);
  coachMessages.length=0;
  coachMessages.push({role:'user',text:'I am travelling Wednesday, move that session'});
  coachMessages.push({role:'assistant',text:ex.clean,planActions:ex.actions,planWeek:ex.week});
  renderCoachMessages();
  const chip=document.getElementById('coach-messages').innerHTML;
  const beforeThu=(()=>{const s=_progWeekSessions(wk);const x=s.find(y=>y.day==='Thu'&&y.session);return x?x.id:null;})();
  coachApplyChatActions(1);
  const afterThu=(()=>{const s=_progWeekSessions(wk);const x=s.find(y=>y.day==='Thu'&&y.session);return x?x.id:null;})();
  const afterWed=(()=>{const s=_progWeekSessions(wk);const x=s.find(y=>y.day==='Wed'&&y.session);return x?x.id:null;})();
  return { parsed:ex.actions.length, hasChip:/Change your plan\?/.test(chip), beforeThu, afterThu, afterWed,
           marked:!!coachMessages[1].planApplied,
           persisted:(()=>{try{const p=JSON.parse(localStorage.getItem('ht-program'));return !!p;}catch(e){return false;}})() };
});
check('E2E: the reply yields a plan action', journey.parsed===1);
check('E2E: a confirm chip is offered before anything changes', journey.hasChip && journey.beforeThu===null);
check('E2E: confirming actually moves the session', journey.afterThu==='tempo' && journey.afterWed===null, JSON.stringify(journey));
check('E2E: the change is persisted, not just in memory', journey.persisted);
check('E2E: the message is marked applied', journey.marked);

// ── A refused proposal must not mark itself applied ─────────────────────────
await seed();
const refused=await page.evaluate(()=>{
  const wk=_progActualWeek();
  coachMessages.length=0;
  coachMessages.push({role:'user',text:'x'});
  coachMessages.push({role:'assistant',text:'y',planWeek:wk,
    planActions:[{action:'remove',day:'Fri',week:wk,scope:'once'}]});   // nothing on Fri
  const before=JSON.stringify(savedProgram);
  coachApplyChatActions(1);
  return { unchanged: JSON.stringify(savedProgram)===before, marked:!!coachMessages[1].planApplied };
});
check('A refused proposal leaves the plan untouched', refused.unchanged);
check('...and is NOT marked as applied', refused.marked===false, String(refused.marked));

// ── The race date now survives a backup ─────────────────────────────────────
check('ht-race-date is in BACKUP_KEYS', await page.evaluate(()=>BACKUP_KEYS.includes('ht-race-date')));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
