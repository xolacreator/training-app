// The goal decides the engine — one door in, the matching programming out.
//
// The defect this locks down: the builder had six create buttons across four
// engines, and which engine you got depended on which button you pressed. The goal
// was never consulted, so a HYROX athlete pressing "Build my plan around these days"
// got Zone-2 runs and a generic strength day, while the HYROX engine — which knows
// the sled is 152 kg — sat behind no button at all.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});

// ── The decision ────────────────────────────────────────────────────────────
const route=await page.evaluate(()=>{
  const g=t=>_engineForGoal(t);
  return { hyrox:g('HYROX Tampa — Open Men, sub-80'), hyroxCase:g('hyrox melbourne'),
           marathon:g('Sub-3:30 marathon at Melbourne'), squat:g('Add 20kg to my back squat'),
           fitstop:g('Fitstop 3x a week plus running'), fitness:g('general fitness'),
           empty:g(''), junk:g('asdfgh qwerty') };
});
check('A HYROX goal routes to the HYROX engine', route.hyrox==='hyrox', route.hyrox);
check('...regardless of how it is capitalised', route.hyroxCase==='hyrox', route.hyroxCase);
check('A race goal routes to the scheduler', route.marathon==='adaptive', route.marathon);
check('A strength goal routes to the scheduler', route.squat==='adaptive', route.squat);
check('Fitstop routes to the Fitstop block when named', route.fitstop==='fitstop', route.fitstop);
check('A general goal still routes somewhere', route.fitness==='adaptive', route.fitness);
check('No goal produces no engine (it does not guess)', route.empty===null, String(route.empty));
check('An unclassifiable goal produces no engine', route.junk===null, String(route.junk));

// ── The build ───────────────────────────────────────────────────────────────
const built=await page.evaluate(()=>{
  const days=['Mon','Tue','Wed','Fri','Sat'];
  const mk=goal=>{
    const p=buildBlockForGoal({goal, weeks:12, sessionsPerWeek:5, trainDays:days});
    if(!p) return null;
    const prev=savedProgram; saveProgramData(p);
    const wk=(_progWeekSessions(1)||[]).filter(s=>s.session)
      .map(s=>({day:s.day, name:s.session.name, sum:_sessSummary(s.session,1)||''}));
    saveProgramData(prev);
    return { name:p.name, engine:p.engine, builtFor:p.builtFor, hyrox:!!p.hyrox,
             weeks:p.weeks, spw:p.sessionsPerWeek, wk };
  };
  return { hx:mk('HYROX Tampa — Open Men, sub-80'), mar:mk('Sub-3:30 marathon at Melbourne'),
           str:mk('Add 20kg to my back squat'), fs:mk('Fitstop 3x a week plus running'),
           junk:mk('asdfgh qwerty'), savedAfter:savedProgram };
});
check('A HYROX goal builds a HYROX block', built.hx && built.hx.hyrox, built.hx && built.hx.name);
check('...with compromised running in week 1',
  built.hx.wk.some(s=>/Compromised Run/.test(s.name)), built.hx.wk.map(s=>s.name).join(', '));
check('...carrying the real race load, not a generic weight',
  built.hx.wk.some(s=>/\d+(\.\d+)?\s*kg/.test(s.sum)), built.hx.wk.map(s=>s.sum).find(x=>/kg/.test(x))||'(none)');
check('...and station work resolved to named stations',
  built.hx.wk.some(s=>/Sled|Ski|Row|Wall|Farmer|Sandbag|Burpee/.test(s.sum)),
  built.hx.wk.map(s=>s.sum).find(x=>/Sled|Ski/.test(x))||'(none)');
check('A marathon goal does NOT get HYROX programming',
  built.mar && !built.mar.hyrox && !built.mar.wk.some(s=>/Compromised|Station Work/.test(s.name)),
  built.mar && built.mar.wk.map(s=>s.name).join(', '));
check('...and gets real run types', built.mar.wk.some(s=>/Tempo|Interval|Long/.test(s.name)),
  built.mar.wk.map(s=>s.name).join(', '));
check('A Fitstop goal gets the real Fitstop block',
  built.fs && /Fitstop/.test(built.fs.name) && built.fs.wk.some(s=>/LIFT|PERFORM|CONDITION|SWEAT/.test(s.name)),
  built.fs && built.fs.wk.map(s=>s.name).join(', '));
check('Every block records the goal it was built for',
  built.hx.builtFor && built.mar.builtFor && built.fs.builtFor);
check('An unclassifiable goal builds nothing rather than something generic',
  built.junk===null, JSON.stringify(built.junk||'').slice(0,60));
check('Building a preview does not commit it', built.savedAfter===null, String(built.savedAfter));

// ── The week is as long as the athlete trains ───────────────────────────────
// A goal whose adaptations collapsed to two distinct scheduler objectives used to
// produce a two-session week however many days were available.
check('A strength goal fills more than two days', built.str && built.str.wk.length>=4,
  built.str && `${built.str.wk.length}: ${built.str.wk.map(s=>s.day).join(',')}`);
check('...and includes actual strength work',
  built.str.wk.some(s=>/Strength|LIFT/i.test(s.name)), built.str.wk.map(s=>s.name).join(', '));

// ── The conversation reaches the same dispatcher ────────────────────────────
const conv=await page.evaluate(()=>{
  const intake={goal:'HYROX Tampa — Open Men, sub-80', timeline:'12 weeks out, entered and paid',
                history:'Raced once, blew up on the sled push'};
  coachMessages=[{role:'assistant', intake}];
  const auto=_validateProgramSpec({engine:'auto', name:'Block', weeks:12, sessionsPerWeek:5,
    trainDays:['Mon','Tue','Wed','Fri','Sat'], goal:intake.goal});
  coachMessages=[{role:'assistant', intake:{goal:'Sub-3:30 marathon', timeline:'16 weeks', history:'Ran 3:41 last year'}}];
  const mar=_validateProgramSpec({engine:'auto', weeks:16, sessionsPerWeek:5, goal:'Sub-3:30 marathon',
    trainDays:['Mon','Tue','Wed','Fri','Sat']});
  coachMessages=[{role:'assistant', intake}];
  const bad=_validateProgramSpec({engine:'teleport', weeks:12, sessionsPerWeek:5, goal:intake.goal});
  const prompt=(()=>{ try{ return _designEnginePrompt(); }catch(e){ return ''; } })();
  return { auto, marHasSessions:!!(mar&&mar.sessions&&mar.sessions.length), marIsHyrox:!!(mar&&mar.hyrox),
           bad, prompt };
});
check('"engine":"auto" from the coach builds through the same dispatcher',
  conv.auto && !conv.auto.blocked && conv.auto.hyrox && conv.auto.sessions.length>0,
  JSON.stringify(conv.auto||'').slice(0,70));
check('...and a marathon goal through it is not a HYROX block',
  conv.marHasSessions && !conv.marIsHyrox);
check('An engine name the app does not have is refused, not guessed at', conv.bad===null);
check('The design prompt tells the coach not to author sessions',
  /do NOT author the sessions/i.test(conv.prompt) && /engine.{0,4}:.{0,4}auto/i.test(conv.prompt));
check('...and to say so when the goal is outside the knowledge base',
  /outside what the knowledge base covers/i.test(conv.prompt));

// ── The builder screen is one door ──────────────────────────────────────────
const ui=await page.evaluate(()=>{
  savedProgram=null;
  coachProfile={goal:'HYROX Tampa — Open Men, sub-80'};
  localStorage.setItem('ht-goal','HYROX Tampa — Open Men, sub-80');
  renderProgramBuilder();
  const el=document.getElementById('program-overlay-body');
  const html=el.innerHTML, text=el.innerText;
  const buttons=[...el.querySelectorAll('button')].map(b=>b.getAttribute('onclick')||'');
  return { text, buttons,
    creates:buttons.filter(o=>/buildAdaptiveWeek|buildFromSchedule|buildFitstopHybrid|buildConcurrent|generateProgram/.test(o)),
    hasDesign:buttons.some(o=>/openProgramDesign/.test(o)),
    hasClear:buttons.some(o=>/clearGoal/.test(o)),
    hasTypeDropdown:/programBuilderConfig\.type=/.test(html) };
});
check('The builder no longer offers competing create buttons',
  ui.creates.length===0, ui.creates.join(' | '));
check('It offers the goal-first design conversation', ui.hasDesign);
check('It shows what the goal is being built as', /WILL BE BUILT AS/i.test(ui.text), ui.text.slice(0,60));
check('It offers a way to stop training for a goal', ui.hasClear);
check('The type dropdown that could contradict the goal is gone', !ui.hasTypeDropdown);

const noGoal=await page.evaluate(()=>{
  clearGoal({silent:true}); coachProfile={}; savedProgram=null;
  renderProgramBuilder();
  return document.getElementById('program-overlay-body').innerText;
});
check('With no goal it asks for one rather than offering a generic block',
  /No goal set/i.test(noGoal) && !/WILL BE BUILT AS/i.test(noGoal), noGoal.slice(0,70).replace(/\n/g,' / '));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
