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
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'long',null,null,null,null],
    weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  return _progActualWeek();
});
await seed();

check('Scope helper exists', await page.evaluate(()=>typeof _actionScope==='function'));

// ── The prompt now REQUIRES scope and explains both meanings ─────────────────
const prompt=await page.evaluate(()=>{ try{ coachProfile=coachProfile||{name:'C',goal:'marathon'};
  return buildCoachSystemPrompt(); }catch(e){ return 'ERR'; } });
check('Coach is told scope is mandatory', /MUST carry "scope"/.test(prompt));
check('"from now on" is taught as forward', /from now on/.test(prompt) && /forward/.test(prompt));
check('Ambiguity resolves to the reversible option', /ambiguous/i.test(prompt) && /"once"/.test(prompt));

// ── Validation carries scope through ────────────────────────────────────────
const v=await page.evaluate(()=>{ const wk=_progActualWeek();
  return { fwd:_validatePlanAction({action:'move',from:'Wed',to:'Sun',scope:'forward'},wk),
           once:_validatePlanAction({action:'move',from:'Wed',to:'Sun',scope:'once'},wk),
           none:_validatePlanAction({action:'move',from:'Wed',to:'Sun'},wk),
           junk:_validatePlanAction({action:'move',from:'Wed',to:'Sun',scope:'everything'},wk),
           add:_validatePlanAction({action:'add',day:'Fri',type:'easy',scope:'forward'},wk),
           rm:_validatePlanAction({action:'remove',day:'Mon',scope:'forward'},wk) }; });
check('scope:forward survives validation', v.fwd && v.fwd.scope==='forward', JSON.stringify(v.fwd));
check('scope:once survives validation', v.once && v.once.scope==='once');
check('A missing scope defaults to the safe one', v.none && v.none.scope==='once', JSON.stringify(v.none));
check('An unrecognised scope is not trusted as forward', v.junk && v.junk.scope==='once', JSON.stringify(v.junk));
check('add and remove carry scope too', v.add.scope==='forward' && v.rm.scope==='forward');

// ── The confirm chip states which promise is being made ─────────────────────
const desc=await page.evaluate(()=>({
  f:_describePlanAction({action:'move',from:'Wed',to:'Sun',scope:'forward'}),
  o:_describePlanAction({action:'move',from:'Wed',to:'Sun',scope:'once'}),
  a:_describePlanAction({action:'add',day:'Fri',type:'easy',scope:'forward'}),
}));
check('A forward edit says "every week from now on"', /every week from now on/.test(desc.f), desc.f);
check('A one-off says "just this week"', /just this week/.test(desc.o), desc.o);
check('Adds state their scope as well', /every week from now on/.test(desc.a), desc.a);

// ── "from now on" actually changes future weeks ─────────────────────────────
const fwd=await page.evaluate(()=>{ const wk=_progActualWeek();
  _coachPlanProposal={week:wk,summary:'x',actions:[{action:'move',from:'Wed',to:'Sun',scope:'forward',why:'ongoing'}]};
  const n=applyCoachPlanProposal();
  const at=w=>{ const s=_progWeekSessions(w); const f=d=>{const x=s.find(y=>y.day===d&&y.session); return x?x.id:null;};
                return {wed:f('Wed'), sun:f('Sun')}; };
  return { n, now:at(wk), next:at(wk+1), later:at(wk+3), past:at(1) }; });
check('"From now on" moves THIS week', fwd.now.sun==='long' && fwd.now.wed==null, JSON.stringify(fwd.now));
check('...and next week', fwd.next.sun==='long' && fwd.next.wed==null, JSON.stringify(fwd.next));
check('...and weeks beyond that', fwd.later.sun==='long' && fwd.later.wed==null, JSON.stringify(fwd.later));
check('...without rewriting history', fwd.past.wed==='long' && fwd.past.sun==null, JSON.stringify(fwd.past));

// ── "this week" still stays put ─────────────────────────────────────────────
await seed();
const once=await page.evaluate(()=>{ const wk=_progActualWeek();
  _coachPlanProposal={week:wk,summary:'x',actions:[{action:'move',from:'Wed',to:'Sun',scope:'once',why:'travelling'}]};
  applyCoachPlanProposal();
  const at=w=>{ const s=_progWeekSessions(w); const f=d=>{const x=s.find(y=>y.day===d&&y.session); return x?x.id:null;};
                return {wed:f('Wed'), sun:f('Sun')}; };
  return { now:at(wk), next:at(wk+1) }; });
check('A one-off moves only this week', once.now.sun==='long' && once.now.wed==null, JSON.stringify(once.now));
check('...and leaves next week alone', once.next.wed==='long' && once.next.sun==null, JSON.stringify(once.next));

// ── End to end from a chat reply ────────────────────────────────────────────
await seed();
const chat=await page.evaluate(()=>{
  const reply='Makes sense.\n\n```plan\n{"actions":[{"action":"move","from":"Wed","to":"Sun","scope":"forward","why":"work nights"}]}\n```';
  const ex=_extractPlanActions(reply);
  coachMessages.length=0;
  coachMessages.push({role:'user',text:'move my long run to Sunday from now on'});
  coachMessages.push({role:'assistant',text:ex.clean,planActions:ex.actions,planWeek:ex.week});
  renderCoachMessages();
  const html=document.getElementById('coach-messages').innerHTML;
  coachApplyChatActions(1);
  const at=w=>{ const s=_progWeekSessions(w); const x=s.find(y=>y.day==='Sun'&&y.session); return x?x.id:null; };
  return { parsedScope:ex.actions[0]&&ex.actions[0].scope, chipSaysForward:/every week from now on/.test(html),
           now:at(_progActualWeek()), next:at(_progActualWeek()+1) }; });
check('A fenced plan block preserves scope', chat.parsedScope==='forward', String(chat.parsedScope));
check('The chip warns it is an ongoing change before you tap', chat.chipSaysForward);
check('Applying from chat carries it forward for real', chat.now==='long' && chat.next==='long', JSON.stringify(chat));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
