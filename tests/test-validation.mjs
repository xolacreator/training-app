import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
await page.reload({waitUntil:'load'});
await page.waitForTimeout(500);

const validate = (prog,ctx={}) => page.evaluate(({p,c})=>validateProgram(p,c), {p:prog,c:ctx});

// Helper builders
const run=(id,rt)=>({id,type:'endurance',name:id,runType:rt, ...(rt==='long'?{distance:'18km'}:{}), ...( !['easy','recovery','long'].includes(rt)?{intervals:'x'}:{})});
const lift=(id)=>({id,type:'strength',name:id,exercises:[{name:'Back Squat',sets:4,reps:'5'}]});

// 1) A sound endurance week → ok, high score, no errors
let r = await validate({type:'endurance',weeks:6,sessionsPerWeek:5,
  sessions:[run('easy','easy'),run('tempo','tempo'),run('int','intervals'),run('long','long')],
  dayMap:['easy','tempo',null,'easy','int',null,'long'],
  weeklyProgressions:[{week:1},{week:2},{week:3},{week:4},{week:5},{week:6,deload:true}]});
check('Sound endurance week: ok + score ≥ 84', r.ok && r.score>=84, `score=${r.score}, warns=${r.warnings.length}`);

// 2) Missing rest day + too much quality → recovery + intensity warnings
r = await validate({type:'endurance',weeks:4,sessionsPerWeek:7,
  sessions:[run('easy','easy'),run('tempo','tempo'),run('int','intervals'),run('long','long')],
  dayMap:['tempo','int','tempo','int','tempo','long','easy'], // no rest, mostly hard
  weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}]});
check('No rest day flagged', r.warnings.some(w=>w.rule==='recovery'&&/rest day/i.test(w.message)), JSON.stringify(r.warnings.map(w=>w.rule)));
check('Low easy ratio flagged (intensity)', r.warnings.some(w=>w.rule==='intensity'), '');
check('Consecutive hard days flagged', r.warnings.some(w=>w.rule==='recovery'&&/in a row/i.test(w.message)), '');

// 3) Concurrent interference: hard run adjacent to a strength day
r = await validate({type:'hybrid',weeks:4,sessionsPerWeek:4,
  sessions:[lift('lift'),run('int','intervals'),run('easy','easy')],
  dayMap:['lift','int',null,'easy',null,'easy',null], // Mon lift, Tue hard intervals (adjacent!)
  weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}]});
check('Interference flagged (hard run next to strength)', r.warnings.some(w=>w.rule==='interference'), JSON.stringify(r.warnings.filter(w=>w.rule==='interference').map(w=>w.message)));

// 4) Endurance without a long run → goal warning
r = await validate({type:'endurance',weeks:4,sessionsPerWeek:3,
  sessions:[run('easy','easy'),run('tempo','tempo')],
  dayMap:['easy','tempo',null,'easy',null,null,null],
  weeklyProgressions:[{week:1},{week:2},{week:3},{week:4}]});
check('Endurance w/o long run → goal warning', r.warnings.some(w=>w.rule==='goal'&&/long run/i.test(w.message)), '');

// 5) 6-week non-fitstop block without deload → progression warning
r = await validate({type:'strength',weeks:6,sessionsPerWeek:3,
  sessions:[lift('a'),lift('b'),lift('c')],
  dayMap:['a',null,'b',null,'c',null,null],
  weeklyProgressions:Array.from({length:6},(_,i)=>({week:i+1}))}); // no deload
check('Missing deload in 6-wk block → progression warning', r.warnings.some(w=>w.rule==='progression'&&/deload/i.test(w.message)), '');

// 6) Structural error: bad dayMap
r = await validate({type:'strength',weeks:4,sessions:[lift('a')],dayMap:['a','ghost',null,null,null,null,null],weeklyProgressions:[{week:1}]});
check('Unknown session id → structural error', r.errors.some(e=>e.rule==='structure'), JSON.stringify(r.errors.map(e=>e.rule)));
check('Has errors → not ok', r.ok===false);

// 7) Time availability
r = await validate({type:'hybrid',weeks:4,sessionsPerWeek:6,sessions:[lift('a')],dayMap:['a','a','a','a','a','a',null],weeklyProgressions:[{week:1}]}, {availability:3});
check('Exceeds availability → time warning', r.warnings.some(w=>w.rule==='time'), '');

// 8) Loaded Fitstop BLOCK C validates without errors (fitstop exempt from deload rule)
await page.evaluate(()=>{ openProgramOverlay(); loadFitstopBlockC(); });
await page.waitForTimeout(200);
r = await page.evaluate(()=>validateProgram(savedProgram,{}));
check('Fitstop BLOCK C: no errors, no false deload warning', r.ok && !r.warnings.some(w=>/deload/i.test(w.message)), `score=${r.score}, warns=${JSON.stringify(r.warnings.map(w=>w.rule))}`);

// 9) Hybrid build surfaces interference flags as info
await page.evaluate(()=>{ buildFitstopHybrid(['Tue','Fri'],'sub-45 10K'); });
await page.waitForTimeout(200);
r = await page.evaluate(()=>validateProgram(savedProgram,{}));
check('Hybrid: interference flags surfaced (info or warn)', r.all.some(v=>v.rule==='interference'), JSON.stringify(r.all.filter(v=>v.rule==='interference').map(v=>v.severity)));

// 10) Validation card renders in saved-program view
const cardHtml = await page.evaluate(()=>renderValidationCard(savedProgram));
check('Validation card renders with score', /Coaching check/.test(cardHtml)&&/\/100/.test(cardHtml), '');

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
