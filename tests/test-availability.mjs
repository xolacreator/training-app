import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-availability');});
await page.reload({waitUntil:'load'});
await page.waitForTimeout(500);

// Categories + model present
const cats = await page.evaluate(()=>TRAINING_CATEGORIES.map(c=>c.id));
check('17 training categories defined, extensible', cats.length>=17 && cats.includes('fitstop') && cats.includes('long-run') && cats.includes('deka'), `${cats.length} cats`);

// Set statuses via the API (mirrors grid taps)
await page.evaluate(()=>{
  setDayStatus('Tue','fitstop','locked');
  setDayStatus('Thu','strength','preferred');
  setDayStatus('Thu','hybrid','available');
  setDayStatus('Sat','long-run','locked');
  setDayStatus('Sun','workout-run','avoid');
});
let read = await page.evaluate(()=>({
  tue:availabilityForDay('Tue'), thu:availabilityForDay('Thu'), sat:availabilityForDay('Sat'), sun:availabilityForDay('Sun'),
  any:hasAnyAvailability(),
}));
check('Locked Tue Fitstop', read.tue.locked.includes('fitstop'), JSON.stringify(read.tue));
check('Thu: strength Preferred + hybrid Available (multi-select)', read.thu.preferred.includes('strength')&&read.thu.available.includes('hybrid'), JSON.stringify(read.thu));
check('Sat long-run Locked, Sun workout-run Avoid', read.sat.locked.includes('long-run')&&read.sun.avoid.includes('workout-run'), JSON.stringify([read.sat,read.sun]));
check('hasAnyAvailability true after setting', read.any===true);

// Persistence across reload
await page.reload({waitUntil:'load'});
await page.waitForTimeout(500);
const persisted = await page.evaluate(()=>({ tue:getDayStatus('Tue','fitstop'), thu:getDayStatus('Thu','strength'), raw:localStorage.getItem('ht-availability') }));
check('Preferences persist across reload', persisted.tue==='locked'&&persisted.thu==='preferred', JSON.stringify({tue:persisted.tue,thu:persisted.thu}));
check('Stored under ht-availability', !!persisted.raw && /fitstop/.test(persisted.raw));

// Status cycle: none→preferred→available→avoid→locked→none
const cyc = await page.evaluate(()=>{ const seq=[]; for(let i=0;i<6;i++) seq.push(cycleDayStatus('Wed','track')); return seq; });
check('Cycle order correct', JSON.stringify(cyc)===JSON.stringify(['preferred','available','avoid','locked','none','preferred']), JSON.stringify(cyc));

// UI: grid renders in the More screen with cells
await page.evaluate(()=>{ nav('more',document.querySelectorAll('.nb')[4]); renderTrainingPreferences(); });
await page.waitForTimeout(300);
const gridCells = await page.locator('#training-prefs-card button[data-day]').count();
check('Grid renders all day×category cells', gridCells===17*7, `got ${gridCells} (expect ${17*7})`);
// Tapping a cell updates it + persists
const before = await page.evaluate(()=>getDayStatus('Mon','easy-run'));
await page.locator('#training-prefs-card button[data-day="Mon"][data-cat="easy-run"]').click();
await page.waitForTimeout(150);
const after = await page.evaluate(()=>getDayStatus('Mon','easy-run'));
check('Tapping a grid cell changes + saves status', before==='none'&&after==='preferred', `${before}→${after}`);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await page.screenshot({path:'/tmp/claude-0/-home-user-training-app/777ac370-f45b-5543-b339-e256f135b1ab/scratchpad/availability-grid.png'});
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
