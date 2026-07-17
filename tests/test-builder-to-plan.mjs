import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-custom');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Builder→plan API exists', await page.evaluate(()=>typeof bldSavePlan==='function' && typeof _builderSessionToProgramDef==='function' && typeof _renderBuiltSession==='function'));

// Active custom program
await page.evaluate(()=>{
  localStorage.setItem('ht-goal','Marathon');
  saveProgramData({id:'p',name:'Marathon Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:9,sessionsPerWeek:3,
    sessions:[{id:'easy',type:'endurance',name:'Easy',runType:'easy'}],dayMap:['easy',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:10},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
});

// ── Build a session in the Builder and Save to plan while a program is active ─
const saved=await page.evaluate(()=>{
  openBuilder(null,'Tuesday',null);
  bldOptions=[{label:'Custom',blocks:[{type:'main',title:'Main set',items:[{name:'6×800m',detail:'@ 5K pace',cue:'float the recoveries'}]}]}];
  bldActiveOpt=0;
  document.getElementById('bld-name').value='VO2 Track Session';
  document.getElementById('bld-day').value='Tuesday';
  document.getElementById('bld-week').value='2';
  bldSavePlan();
  const di=1; // Tue
  const id=savedProgram.dayMap[di];
  const s=savedProgram.sessions.find(x=>x.id===id);
  const legacy = (typeof LIB!=='undefined' && LIB['2'] && LIB['2']['Tue']) ? true : false;
  return { onTue:!!id, name:s&&s.name, built:!!(s&&s._built), blocks:s&&(s.builtBlocks||[]).length, type:s&&s.type, runType:s&&s.runType, wroteLegacy:legacy };
});
check('Build lands in the ACTIVE program on the chosen day', saved.onTue && saved.name==='VO2 Track Session', JSON.stringify(saved));
check('Built session carries its authored blocks', saved.built && saved.blocks>=1, JSON.stringify(saved));
check('Type inferred from content (track reps → intervals)', saved.type==='endurance' && saved.runType==='intervals', JSON.stringify({t:saved.type,rt:saved.runType}));
check('Does NOT write to the legacy LIB when a program is active', saved.wroteLegacy===false);

// ── It renders in the program session overlay with its real content ──────────
const overlay=await page.evaluate(()=>{
  const id=savedProgram.dayMap[1];
  openProgramSessionOverlay(id, 2, 'Tue');
  const h=document.getElementById('po-breakdown').innerHTML;
  return { custom:/Custom build/.test(h), rep:/6×800m/.test(h), cue:/float the recoveries/.test(h) };
});
check('Program overlay renders the built content (blocks + cue)', overlay.custom && overlay.rep && overlay.cue, JSON.stringify(overlay));

// ── It appears in this week's plan sessions ──────────────────────────────────
const inWeek=await page.evaluate(()=>{
  const wk=_progActualWeek();
  return _progWeekSessions(wk).some(s=>s.session && s.day==='Tue' && s.session.name==='VO2 Track Session');
});
check('The build shows up in the plan week (Tue)', inWeek);

// ── Backward compatibility: with NO program, it still saves to the legacy LIB ─
const legacy=await page.evaluate(()=>{
  savedProgram=null; localStorage.removeItem('ht-program');
  openBuilder(null,'Wednesday',null);
  bldOptions=[{label:'Custom',blocks:[{type:'main',title:'Main',items:[{name:'Easy 8km',detail:'Zone 2',cue:''}]}]}];
  bldActiveOpt=0;
  document.getElementById('bld-name').value='Legacy Easy';
  document.getElementById('bld-day').value='Wednesday';
  document.getElementById('bld-week').value='3';
  bldSavePlan();
  return !!(LIB['3'] && LIB['3']['Wed'] && LIB['3']['Wed']._name==='Legacy Easy');
});
check('No-program fallback still writes to the legacy plan (backward compatible)', legacy);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
