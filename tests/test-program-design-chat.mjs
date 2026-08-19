
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

check('Design API exists', await page.evaluate(()=>
  ['openProgramDesign','_designSystemPrompt','_extractProgramSpec','_validateProgramSpec','coachCreateProgram','renderDesignCTA']
    .every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── It lives at the front of the Plan screen ───────────────────────────────
const cta=await page.evaluate(()=>{
  savedProgram=null; localStorage.removeItem('ht-program');
  const race=new Date(); race.setDate(race.getDate()+12*7);
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:race.toISOString().slice(0,10)};
  localStorage.setItem('ht-race-date',race.toISOString().slice(0,10));
  nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1);
  return document.getElementById('design-cta').innerHTML;
});
check('Plan leads with designing a block', /Design your training block/.test(cta), cta.slice(0,70));
check('It routes into the coach conversation', /openProgramDesign\(\)/.test(cta));
check('It uses the race runway in the pitch', /12 weeks out/.test(cta), (cta.match(/race is[^<]*/)||[''])[0]);
check('The form remains available as a fallback', /Use the builder form instead/.test(cta));

check('With a program it becomes a quiet secondary action', await page.evaluate(()=>{
  saveProgramData({id:'p',name:'B',type:'endurance',startDate:_mondayISO(new Date()),weeks:6,sessionsPerWeek:2,
    sessions:[{id:'easy',type:'endurance',name:'Easy',runType:'easy'}],
    dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:7},(_,i)=>({week:i+1}))});
  renderPlan(1);
  const h=document.getElementById('design-cta').innerHTML;
  return /Design next block/.test(h) && !/No program yet/.test(h); }));

// ── The conversation asks only what it cannot infer ────────────────────────
const prompt=await page.evaluate(()=>{
  sessions.length=0;
  const win=_weekWindow(1);
  const x=new Date(win.start); const iso=x.toISOString().slice(0,10);
  sessions.push({gid:'a',week:'1',day:'Mon',session:'Run',dist:'10',date:iso,ts:Date.now()-3*86400000});
  programBuilderConfig.trainDays=['Mon','Wed','Sat'];
  recomputeAthleteState();
  coachMode='design';
  return buildCoachSystemPrompt();
});
check('The design prompt carries the athlete context', /THIS ATHLETE/.test(prompt));
check('It is told what it already knows', /You ALREADY KNOW/.test(prompt), (prompt.match(/You ALREADY KNOW[^\n]*/)||[''])[0]);
check('...and told not to ask about those', /Do NOT ask about these/.test(prompt));
check('It is steered to the questions data cannot answer', /injury history/.test(prompt) && /training age/.test(prompt));
check('One question at a time, not an interrogation', /ONE question at a time/.test(prompt) && /do not interrogate/.test(prompt));
check('It still carries the coaching knowledge base', /COACHING KNOWLEDGE/.test(prompt));
check('Day-to-day coaching keeps its own prompt', await page.evaluate(()=>{
  coachMode='ask'; const p=buildCoachSystemPrompt();
  return !/You ALREADY KNOW/.test(p); }));

// ── A proposed block is validated, not trusted ─────────────────────────────
const val=await page.evaluate(()=>{
  const ok={name:'Marathon Build',type:'endurance',weeks:12,sessionsPerWeek:3,why:'because',
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,null,null,null,'long',null]};
  const bad=id=>{ const c=JSON.parse(JSON.stringify(ok)); return c; };
  const ghost=bad(); ghost.dayMap=['nope',null,null,null,null,'long',null];
  const short=bad(); short.dayMap=['easy',null];
  const huge=bad(); huge.weeks=200;
  const none=bad(); none.sessions=[];
  return { ok:!!_validateProgramSpec(ok), ghost:_validateProgramSpec(ghost), short:_validateProgramSpec(short),
           huge:_validateProgramSpec(huge), none:_validateProgramSpec(none) };
});
check('A sound block validates', val.ok);
check('A dayMap referencing a non-existent session is rejected', val.ghost===null);
check('A dayMap that is not 7 days is rejected', val.short===null);
check('An absurd duration is rejected', val.huge===null);
check('A block with no sessions is rejected', val.none===null);

// ── END TO END: reply → proposal → confirm → real program ──────────────────
const e2e=await page.evaluate(()=>{
  savedProgram=null; localStorage.removeItem('ht-program');
  const reply='Given the long run is the one you keep missing, I\'ve put it on Saturday.\n\n'+
    '```program\n{"name":"Marathon Build","type":"endurance","weeks":12,"sessionsPerWeek":3,'+
    '"why":"12 weeks to your race, built around the days you actually train",'+
    '"sessions":[{"id":"easy","type":"endurance","name":"Easy Run","runType":"easy"},'+
    '{"id":"tempo","type":"endurance","name":"Tempo","runType":"tempo"},'+
    '{"id":"long","type":"endurance","name":"Long Run","runType":"long"}],'+
    '"dayMap":["easy",null,"tempo",null,null,"long",null]}\n```';
  const ex=_extractProgramSpec(reply);
  coachMessages.length=0;
  coachMessages.push({role:'user',text:'no injuries, I can do three days'});
  coachMessages.push({role:'assistant',text:ex.clean,programSpec:ex.spec});
  renderCoachMessages();
  const html=document.getElementById('coach-messages').innerHTML;
  const before=!!savedProgram;
  coachCreateProgram(1);
  return { parsed:!!ex.spec, fenceStripped:!/```program/.test(ex.clean),
           chip:/Build this block\?/.test(html), why:/12 weeks to your race/.test(html),
           beforeHadProgram:before,
           created:!!savedProgram, name:savedProgram&&savedProgram.name,
           weeks:savedProgram&&savedProgram.weeks,
           sat:(()=>{const s=_progWeekSessions(1);const x=s.find(y=>y.day==='Sat'&&y.session);return x?x.id:null;})(),
           persisted:(()=>{try{return !!JSON.parse(localStorage.getItem('ht-program'));}catch(e){return false;}})(),
           marked:!!coachMessages[1].programApplied };
});
check('E2E: the proposal parses out of the reply', e2e.parsed);
check('E2E: the fenced JSON is stripped from what the athlete reads', e2e.fenceStripped);
check('E2E: a confirm chip is shown before anything is created', e2e.chip && e2e.beforeHadProgram===false);
check('E2E: the reasoning is shown with it', e2e.why);
check('E2E: confirming creates the real program', e2e.created && e2e.name==='Marathon Build', JSON.stringify({n:e2e.name,w:e2e.weeks}));
check('E2E: the block honours the proposed week shape', e2e.sat==='long', String(e2e.sat));
check('E2E: it is persisted, not just in memory', e2e.persisted);
check('E2E: the message is marked as applied', e2e.marked);
check('E2E: a deload week is appended', await page.evaluate(()=>
  savedProgram.weeklyProgressions.length===13 && !!savedProgram.weeklyProgressions[12].deload));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
