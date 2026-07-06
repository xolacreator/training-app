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
check('Ecosystem API exists', await page.evaluate(()=>
  typeof coachingContext==='function' && typeof coachingContextText==='function' && typeof addSessionToProgram==='function' && typeof coachSuggestSession==='function' && typeof coachAddSuggestedToPlan==='function'));

// ── Seed goal + program + a completed session
await page.evaluate(()=>{
  localStorage.setItem('ht-goal','Marathon'); trainGoal='Marathon';
  saveProgramData({ id:'eco', name:'Marathon Block', type:'endurance', startDate:_mondayISO(new Date()), weeks:8, sessionsPerWeek:4,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'easy',type:'endurance',name:'Easy',runType:'easy'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['tempo','easy',null,'easy','long',null,null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1})) });
  sessions.length=0;
  const mon=_mondayISO(new Date());
  sessions.push({cat:'run',session:'Tempo Run',dist:'8',pace:'4:20',hr:'160',date:mon,ts:new Date(mon+'T09:00:00').getTime(),gid:'a',progId:'eco',progWeek:1,progSid:'tempo'});
  recoveryLog.length=0; recoveryLog.push({date:todayISO(),sleepScore:70});
  saveData(); recomputeAthleteState();
});

// ── coachingContext ties the ecosystem together
const c=await page.evaluate(()=>coachingContext());
check('Context includes the REAL program (not static PLAN)', c.program && c.program.name==='Marathon Block' && c.program.type==='endurance' && Array.isArray(c.program.thisWeek), JSON.stringify(c.program&&{n:c.program.name,w:c.program.week}));
check('Context includes weekly adaptation progress', c.progress && /\/\d/.test(c.progress.objectives) && Array.isArray(c.progress.rows), JSON.stringify(c.progress&&c.progress.objectives));
check('Context includes today\'s decision + fatigue + recent results', !!c.decision && !!c.decision.adaptation && Array.isArray(c.recent) && c.recent.length>=1, JSON.stringify({dec:!!c.decision,rec:c.recent.length}));
check('Context athlete snapshot present', c.athlete && c.athlete.program && c.athlete.program.name==='Marathon Block');

// ── coachingContextText is a coherent prompt block referencing the real plan
const txt=await page.evaluate(()=>coachingContextText());
check('Context text names the current program + week', /CURRENT PROGRAM: Marathon Block/.test(txt) && /week 1/.test(txt), txt.split('\n')[0]);
check('Context text reports adaptation progress + today focus', /objectives hit/.test(txt) && /focus today/i.test(txt), JSON.stringify(txt.length));

// ── Coach system prompt now consumes the ecosystem (not the stale static plan line)
const prompt=await page.evaluate(()=>{ coachProfile=coachProfile||{}; coachProfile.name='Coach EV'; coachProfile.goal='marathon'; return buildCoachSystemPrompt(); });
check('Coach prompt embeds COACH EV ANALYSIS ecosystem block', /COACH EV ANALYSIS/.test(prompt) && /CURRENT PROGRAM: Marathon Block/.test(prompt));
check('Coach prompt no longer hardcodes "Plan week: N/12" stale ref', !/Plan week: \d+\/12/.test(prompt), prompt.match(/Plan week[^\n]*/)?.[0]||'(gone)');

// ── addSessionToProgram loads a session INTO the plan (becomes a real slot)
const added=await page.evaluate(()=>{
  const before=savedProgram.sessions.length;
  const s=addSessionToProgram({type:'endurance',name:'VO2 Intervals',runType:'intervals',focus:'vo2max'},'Wed',{silent:true});
  const di=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf('Wed');
  return { added:!!s, id:s&&s.id, onWed: savedProgram.dayMap[di]===s.id, grew: savedProgram.sessions.length===before+1, inWeek: _progWeekSessions(_progActualWeek()).some(x=>x.session&&x.session.id===s.id) };
});
check('addSessionToProgram appends the session + maps it to the day', added.added && added.grew && added.onWed, JSON.stringify(added));
check('The added session now appears in the plan week (engine sees it)', added.inWeek, JSON.stringify(added));

// ── unique ids (no collision) when adding twice
const dup=await page.evaluate(()=>{ const a=addSessionToProgram({type:'strength',name:'Lower',id:'lower'},'Sat',{silent:true}); const b=addSessionToProgram({type:'strength',name:'Lower 2',id:'lower'},'Sun',{silent:true}); return a.id!==b.id; });
check('Duplicate ids are de-duplicated', dup);

// ── coachSuggestSession → a concrete session from the decision pipeline
const sug=await page.evaluate(()=>coachSuggestSession());
check('coachSuggestSession returns a concrete session + rationale', sug && sug.session && sug.session.type && sug.adaptation && sug.reason, JSON.stringify(sug&&{t:sug.session.type,a:sug.adaptation}));
check('Suggested session carries the target adaptation as focus', !!sug.session.focus, sug.session.focus);

// ── coachAddSuggestedToPlan closes the loop: suggestion → plan slot
const loop=await page.evaluate(()=>{
  const before=savedProgram.sessions.length;
  const s=coachAddSuggestedToPlan('Fri');
  const di=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf('Fri');
  return { added:!!s, grew:savedProgram.sessions.length===before+1, onFri: savedProgram.dayMap[di]===(s&&s.id) };
});
check('coachAddSuggestedToPlan adds Coach EV\'s pick to the plan', loop.added && loop.grew && loop.onFri, JSON.stringify(loop));

// ── Decision Inspector exposes the "Add to plan" action when a program is active
const insp=await page.evaluate(()=>{ openDecisionInspector(); const html=document.getElementById('ins-content').innerHTML; return /coachAddSuggestedToPlan/.test(html) && /Add this session to today/.test(html); });
check('Decision Inspector shows "Add to plan" action', insp);

// ── No program → context degrades gracefully, addSession is a no-op (guarded)
const noProg=await page.evaluate(()=>{ savedProgram=null; localStorage.removeItem('ht-program'); const c=coachingContext(); const s=addSessionToProgram({type:'endurance',name:'x'},'Mon',{silent:true}); return { prog:c.program, added:s }; });
check('No program → context.program null + addSession no-ops safely', noProg.prog===null && noProg.added===null, JSON.stringify(noProg));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
