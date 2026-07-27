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

check('Bridge API exists', await page.evaluate(()=>['_coachTemporalContext','_extractPlanActions','coachApplyChatActions'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

await page.evaluate(()=>{
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
});

// ── Temporal grounding ──────────────────────────────────────────────────────
const t=await page.evaluate(()=>_coachTemporalContext());
const todayName=new Date().toLocaleDateString('en-US',{weekday:'long'});
check('Coach is told TODAY (real weekday + date)', /^TODAY: /m.test(t) && t.includes(todayName), t.split('\n')[0]);
check('Each plan day carries its real calendar date', /Mon [A-Z][a-z]{2} \d+: /.test(t) && /Sat [A-Z][a-z]{2} \d+: /.test(t), (t.match(/Mon [^\n]*/)||[''])[0]);
check('Today is marked inside the week', /<-- TODAY/.test(t));
check('Program end + countdown included', /Program ends .* \(\d+ days away\)/.test(t), (t.match(/Program ends[^\n]*/)||[''])[0]);
check('Coach told to name weekdays for changes', /name the WEEKDAY/.test(t));
check('Temporal block is injected into the coach prompt', await page.evaluate(()=>{ try{ coachProfile=coachProfile||{name:'Coach',goal:'marathon'}; const p=buildCoachSystemPrompt(); return /TODAY: /.test(p)&&/CURRENT PLAN WEEK/.test(p); }catch(e){ return 'ERR:'+e.message; } }));

// ── Chat → plan actions: parse + validate ───────────────────────────────────
const ex=await page.evaluate(()=>{
  const reply='Let\'s shift things.\n\n```plan\n{"actions":[{"action":"move","from":"Wed","to":"Thu","why":"travel"},{"action":"add","day":"Tue","type":"easy","why":"volume"},{"action":"move","from":"Fri","to":"Sun","why":"invalid - Fri is rest"}]}\n```';
  return _extractPlanActions(reply);
});
check('Fenced plan block is stripped from the visible reply', !/```plan/.test(ex.clean) && /Let's shift things/.test(ex.clean), ex.clean);
check('Valid actions parsed; invalid ones dropped', ex.actions.length===2 && ex.actions[0].action==='move' && ex.actions[1].action==='add', JSON.stringify(ex.actions));
check('Reply with no plan block is untouched', await page.evaluate(()=>{ const r=_extractPlanActions('Just some advice.'); return r.clean==='Just some advice.' && r.actions.length===0; }));
check('Malformed JSON degrades gracefully', await page.evaluate(()=>{ const r=_extractPlanActions('hi\n```plan\n{not json}\n```'); return r.actions.length===0 && !/```plan/.test(r.clean); }));

// ── Chips render, and applying mutates the plan ─────────────────────────────
const ui=await page.evaluate(()=>{
  coachMessages.length=0;
  coachMessages.push({role:'user',text:'move my tempo, travelling Wed'});
  coachMessages.push({role:'assistant',text:'Sure - here is the change.',planActions:[{action:'move',from:'Wed',to:'Thu',why:'travel'}],planWeek:_progActualWeek()});
  renderCoachMessages();
  const h=document.getElementById('coach-messages').innerHTML;
  return { chip:/Change your plan\?/.test(h), btn:/coachApplyChatActions\(1\)/.test(h), desc:/Move Wed's session to Thu/.test(h) };
});
check('Coach reply renders plan-change confirm chips', ui.chip && ui.btn && ui.desc, JSON.stringify(ui));
const applied=await page.evaluate(()=>{ coachApplyChatActions(1); const dm=savedProgram.dayMap;
  return { thu:dm[3], wed:dm[2], marked:!!coachMessages[1].planApplied, h:/Applied to your plan/.test(document.getElementById('coach-messages').innerHTML) }; });
check('Applying from chat moves the session in the real plan', applied.thu==='tempo' && applied.wed==null, JSON.stringify(applied));
check('Chat message shows it was applied', applied.marked && applied.h);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
