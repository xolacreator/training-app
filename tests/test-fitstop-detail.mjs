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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(500);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Data integrity: 12 weeks × 6 days; every cell has content (one is a faithful "TBC")
const dims = await page.evaluate(()=>{
  const cells=FITSTOP_BLOCK_C_DETAIL.flat();
  const short=cells.filter(c=>!c||c.length<=20);
  return { weeks:FITSTOP_BLOCK_C_DETAIL.length, allSix:FITSTOP_BLOCK_C_DETAIL.every(w=>w.length===6),
    detailed:cells.filter(c=>c&&c.length>40).length, shortAreTBC:short.every(c=>/TBC/i.test(c)), shortCount:short.length };
});
check('12 weeks × 6 days; ≥71 detailed; the only short cell is the source TBC',
  dims.weeks===12 && dims.allSix && dims.detailed>=70 && dims.shortAreTBC && dims.shortCount<=1, JSON.stringify(dims));

// Spot-check known real content from the PDF
const spot = await page.evaluate(()=>({
  w1monPerform:_fitstopDetail(1,'Mon'),     // R-EMOM renegade row etc
  w10wedCond:_fitstopDetail(10,'Wed'),      // FITSTOP SEVENS
  w7tueLift:_fitstopDetail(7,'Tue'),        // 8-5-4-3 BACK SQUAT
}));
check('W1 Mon PERFORM = real R-EMOM content', /R-EMOM/.test(spot.w1monPerform) && /RENEGADE ROW/i.test(spot.w1monPerform), spot.w1monPerform.slice(0,50));
check('W10 Wed CONDITION = FITSTOP SEVENS', /SEVENS/i.test(spot.w10wedCond), spot.w10wedCond.slice(0,40));
check('W7 Tue LIFT = real squat progression', /BACK SQUAT/i.test(spot.w7tueLift), spot.w7tueLift.slice(0,60));

// Load BLOCK C and verify the session overlay shows the REAL detail (not generic)
await page.evaluate(()=>{ openProgramOverlay(); loadFitstopBlockC(); closeOv('program-overlay'); });
await page.waitForTimeout(300);
// Week 1 Monday PERFORM
await page.evaluate(()=>{ nav('plan',document.querySelectorAll('.nb')[2]); renderPlan(1); openProgramSessionOverlay('perform',1,'Mon'); });
await page.waitForTimeout(300);
const detMon = await page.locator('#po-breakdown').innerText();
check('Overlay shows real PERFORM detail (not generic placeholder)', /RENEGADE ROW|HANG POWER CLEAN|R-EMOM/i.test(detMon) && !/Class session/i.test(detMon), JSON.stringify(detMon.slice(0,90)));

// Week 10 Tuesday LIFT shows the real PEAK lift content (not Squat/Bench/Row generic)
await page.evaluate(()=>{ closeOv('plan-overlay'); renderPlan(10); openProgramSessionOverlay('lift',10,'Tue'); });
await page.waitForTimeout(300);
const detLift = await page.locator('#po-breakdown').innerText();
check('LIFT overlay shows real BLOCK C lift detail', /ROUNDS|RIR|BARBELL|SQUAT|CLEAN/i.test(detLift), JSON.stringify(detLift.slice(0,80)));
check('LIFT no longer shows the generic see-phase placeholder', !/see phase/i.test(detLift));

// Different weeks show different content (real per-week programming)
const w1 = await page.evaluate(()=>_fitstopDetail(1,'Sat'));
const w12 = await page.evaluate(()=>_fitstopDetail(12,'Sat'));
check('Different weeks have different sessions', w1!==w12);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await page.screenshot({path:'/tmp/claude-0/-home-user-training-app/777ac370-f45b-5543-b339-e256f135b1ab/scratchpad/fitstop-real-detail.png'});
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
