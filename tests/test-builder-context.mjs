
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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(300);

check('API exists', await page.evaluate(()=>
  ['_builderAthleteContext','weeksToRace'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// An athlete with a race, a history, and patchy adherence.
const ctx=await page.evaluate(()=>{
  const race=new Date(); race.setDate(race.getDate()+ 14*7 );
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:race.toISOString().slice(0,10)};
  localStorage.setItem('ht-race-date', race.toISOString().slice(0,10));
  const d=new Date(); d.setDate(d.getDate()-21);
  saveProgramData({id:'p',name:'Base Block',type:'endurance',startDate:_mondayISO(d),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy Run',runType:'easy'},
              {id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},
              {id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:['easy',null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  sessions.length=0;
  // Three weeks logged, long run skipped every time.
  [1,2,3].forEach(wk=>{ const win=_weekWindow(wk);
    [['Mon',0],['Wed',2]].forEach(([dy,off])=>{
      const x=new Date(win.start); x.setDate(x.getDate()+off); const iso=x.toISOString().slice(0,10);
      sessions.push({gid:'g'+wk+dy,week:String(wk),day:dy,session:'Run',dist:'10',date:iso,ts:new Date(iso+'T09:00:00').getTime()});
    }); });
  programBuilderConfig.trainDays=['Mon','Wed','Sat'];
  programBuilderConfig.longRunDay='Sat';
  recomputeAthleteState();
  return _builderAthleteContext();
});

check('The designer is told about the race and its timing', /RACE:/.test(ctx) && /weeks\)/.test(ctx), ctx.split('\n')[1]||'');
check('...and told to size the block to it', /Size the block to land on race week/.test(ctx));
check('The designer is told what the athlete ACTUALLY completes', /ADHERENCE/.test(ctx) && /% of prescribed sessions/.test(ctx),
  (ctx.match(/ADHERENCE[^\n]*/)||[''])[0]);
check('Patchy adherence is called out explicitly', /do NOT complete a full week as prescribed/.test(ctx));
check('The repeatedly missed session is named', /Most often missed: Long Run/.test(ctx), (ctx.match(/Most often missed[^\n]*/)||[''])[0]);
check('Recent training volume is stated', /RECENT VOLUME: \d+ sessions in 28 days/.test(ctx), (ctx.match(/RECENT VOLUME[^\n]*/)||[''])[0]);
check('...with an instruction not to jump beyond it', /Do not prescribe a week that jumps far beyond this/.test(ctx));
check('Available days are passed as a constraint', /AVAILABLE DAYS: Mon, Wed, Sat/.test(ctx), (ctx.match(/AVAILABLE DAYS[^\n]*/)||[''])[0]);
check('The current block is named so the new one follows on', /CURRENT BLOCK/.test(ctx) && /not repeat it/.test(ctx));

// ── Block length derives from the goal ─────────────────────────────────────
check('weeksToRace derives the block length from the race date', await page.evaluate(()=>weeksToRace()===14), String(await page.evaluate(()=>weeksToRace())));
check('No race → no derived length (does not invent one)', await page.evaluate(()=>{
  coachProfile={name:'EV',goal:'general fitness'}; localStorage.removeItem('ht-race-date');
  return weeksToRace()===null; }));
check('A past race date yields no block length', await page.evaluate(()=>{
  localStorage.setItem('ht-race-date','2020-01-01'); coachProfile={name:'EV',raceDate:'2020-01-01'};
  const w=weeksToRace(); localStorage.removeItem('ht-race-date'); return w===null; }));

// ── A cold-start athlete gets honesty, not invention ───────────────────────
check('No logged history is stated as unknown, not guessed', await page.evaluate(()=>{
  sessions.length=0; localStorage.removeItem('ht-program'); savedProgram=null;
  coachProfile={name:'EV',goal:'get fitter'};
  recomputeAthleteState();
  const c=_builderAthleteContext();
  return /no sessions logged in the last 28 days/.test(c) && /begin conservatively/.test(c); }));

// ── The context actually reaches the design prompt ─────────────────────────
// Assert the WIRING via a name that survives minification. `mangle.toplevel:false`
// keeps top-level function names, but local variables are renamed, so asserting on
// a local like `athCtx` passes on source and fails on the shipped artifact.
check('The builder calls the athlete-context builder', await page.evaluate(()=>
  /_builderAthleteContext/.test(String(generateProgram))));
check('...and that context is non-empty for a real athlete', await page.evaluate(()=>{
  const race=new Date(); race.setDate(race.getDate()+70);
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:race.toISOString().slice(0,10)};
  localStorage.setItem('ht-race-date',race.toISOString().slice(0,10));
  recomputeAthleteState();
  const c=_builderAthleteContext();
  return c.length>40 && /THIS ATHLETE/.test(c); }));

// ── Block length now comes from the race, not from duration pills ──────────
// The builder used to offer 4/6/8/12/16-week pills plus a typed override, and the
// athlete picked a number that had nothing to do with their race. The goal-first
// builder derives it instead — a 14-week race gives a block that ends on race week.
const dur=await page.evaluate(()=>{
  const race=new Date(); race.setDate(race.getDate()+ 14*7 );
  const iso=race.toISOString().slice(0,10);
  coachProfile={name:'EV',goal:'sub-3:30 marathon',raceDate:iso};
  localStorage.setItem('ht-race-date', iso);
  localStorage.setItem('ht-goal','sub-3:30 marathon');
  savedProgram=null;
  try{ renderProgramBuilder(); }catch(e){}
  const html=document.getElementById('program-overlay-body').innerHTML;
  const blk=buildBlockForGoal({goal:'sub-3:30 marathon', trainDays:['Mon','Tue','Wed','Fri','Sat']});
  return { html, weeksToRace:weeksToRace(), blockWeeks:blk&&blk.weeks, anchored:!!(blk&&blk.race),
           pills:/programBuilderConfig\.weeks=/.test(html) };
});
check('The duration pills that ignored the race are gone', !dur.pills);
check('The block is sized from the race instead', dur.blockWeeks>=12 && dur.blockWeeks<=15,
  `race in ${dur.weeksToRace} wks → ${dur.blockWeeks}-week block`);
check('...and ends anchored on race week', dur.anchored, String(dur.anchored));
check('The start date is still the athlete\'s to choose', /id="bld-start"/.test(dur.html));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
