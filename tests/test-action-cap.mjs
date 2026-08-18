
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(350);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// A full week so there is something on every day to move around.
const seed=()=>page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()-7);
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(d),weeks:10,sessionsPerWeek:5,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy','tempo',null,'easy',null,'long',null],
    weeklyProgressions:Array.from({length:11},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  return _progActualWeek();
});
await seed();

check('Cap constant is raised above 3', await page.evaluate(()=>typeof MAX_PLAN_ACTIONS==='number' && MAX_PLAN_ACTIONS>3),
  await page.evaluate(()=>String(typeof MAX_PLAN_ACTIONS!=='undefined'?MAX_PLAN_ACTIONS:'undef')));

// ── More than three actions now survive parsing ────────────────────────────
const six=await page.evaluate(()=>{
  const wk=_progActualWeek();
  const acts=[
    {action:'move',from:'Mon',to:'Wed',scope:'once'},
    {action:'move',from:'Tue',to:'Fri',scope:'once'},
    {action:'add',day:'Sun',type:'easy',scope:'once'},
    {action:'rename',day:'Sat',name:'Race Sim',scope:'once'},
    {action:'move',from:'Thu',to:'Mon',scope:'once'},
    {action:'remove',day:'Sat',scope:'once'},
  ];
  const reply='Bigger reshuffle.\n\n```plan\n'+JSON.stringify({actions:acts})+'\n```';
  const ex=_extractPlanActions(reply);
  return { n:ex.actions.length, droppedCap:ex.droppedCap, droppedInvalid:ex.droppedInvalid };
});
check('Six valid actions all survive (was capped at 3)', six.n===6, JSON.stringify(six));
check('Nothing is reported as dropped when nothing was', six.droppedCap===0, JSON.stringify(six));

// ── Over the cap: truncation is REPORTED, not silent ───────────────────────
const over=await page.evaluate(()=>{
  const wk=_progActualWeek();
  const acts=Array.from({length:MAX_PLAN_ACTIONS+4},(_,i)=>({action:'add',day:['Wed','Fri','Sun'][i%3],type:'easy',scope:'once',week:wk+i}));
  const ex=_extractPlanActions('x\n```plan\n'+JSON.stringify({actions:acts})+'\n```');
  return { n:ex.actions.length, droppedCap:ex.droppedCap };
});
check('The cap bounds the batch', over.n<=await page.evaluate(()=>MAX_PLAN_ACTIONS), String(over.n));
check('The overflow is counted, not silently discarded', over.droppedCap>0, JSON.stringify(over));

// ── Invalid suggestions are counted separately from capped ones ────────────
const bad=await page.evaluate(()=>{
  const ex=_extractPlanActions('x\n```plan\n'+JSON.stringify({actions:[
    {action:'move',from:'Mon',to:'Wed',scope:'once'},
    {action:'move',from:'Funday',to:'Wed'},
    {action:'teleport',day:'Mon'},
  ]})+'\n```');
  return { n:ex.actions.length, droppedInvalid:ex.droppedInvalid, droppedCap:ex.droppedCap };
});
check('Invalid actions are dropped', bad.n===1, JSON.stringify(bad));
check('...and reported as invalid, not as capped', bad.droppedInvalid===2 && bad.droppedCap===0, JSON.stringify(bad));

// ── The athlete is told, on the chip ───────────────────────────────────────
const chip=await page.evaluate(()=>{
  coachMessages.length=0;
  coachMessages.push({role:'user',text:'reshuffle everything'});
  coachMessages.push({role:'assistant',text:'Here you go.',planWeek:_progActualWeek(),
    planActions:[{action:'move',from:'Mon',to:'Wed',scope:'once',week:_progActualWeek()}],
    droppedCap:2, droppedInvalid:1});
  renderCoachMessages();
  return document.getElementById('coach-messages').innerHTML;
});
check('The chip says further changes were not shown', /further change/i.test(chip), chip.slice(chip.indexOf('further')-20,chip.indexOf('further')+60));
check('The chip says invalid suggestions were discarded', /didn'?t fit your plan/i.test(chip));

// ── A large batch still applies ATOMICALLY ─────────────────────────────────
await seed();
const big=await page.evaluate(()=>{
  const wk=_progActualWeek();
  const before=JSON.stringify(savedProgram);
  const r=applyPlanActionsTx([
    {action:'move',from:'Mon',to:'Wed',week:wk,scope:'once'},
    {action:'move',from:'Tue',to:'Fri',week:wk,scope:'once'},
    {action:'add', day:'Sun',type:'easy',week:wk,scope:'once'},
    {action:'remove',day:'Thu',week:wk,scope:'once'},
    {action:'remove',day:'Mon',week:wk,scope:'once'},   // Mon now empty — must fail
  ], {week:wk});
  return { ok:r.ok, applied:r.applied, unchanged: JSON.stringify(savedProgram)===before };
});
check('A 5-action batch with one impossible action is refused whole', big.ok===false && big.applied===0, JSON.stringify(big));
check('...leaving the plan untouched', big.unchanged);

await seed();
const bigOk=await page.evaluate(()=>{
  const wk=_progActualWeek();
  const r=applyPlanActionsTx([
    {action:'move',from:'Mon',to:'Wed',week:wk,scope:'once'},
    {action:'move',from:'Tue',to:'Fri',week:wk,scope:'once'},
    {action:'add', day:'Sun',type:'easy',week:wk,scope:'once'},
    {action:'remove',day:'Thu',week:wk,scope:'once'},
  ], {week:wk});
  const at=d=>{ const s=_progWeekSessions(wk); const x=s.find(y=>y.day===d&&y.session); return x?x.id:null; };
  return { ok:r.ok, applied:r.applied, wed:at('Wed'), fri:at('Fri'), sun:at('Sun'), thu:at('Thu') };
});
check('A 4-action valid batch commits all four', bigOk.ok===true && bigOk.applied===4, JSON.stringify(bigOk));
check('...and every one landed', bigOk.wed==='easy' && bigOk.fri==='tempo' && !!bigOk.sun && bigOk.thu===null, JSON.stringify(bigOk));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
