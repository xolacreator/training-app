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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Interval session with laps → breakdown = INTERVAL LAPS with work/rest
await page.evaluate(()=>{
  const laps=[{distance:2000,moving_time:480,average_speed:4.2,average_heartrate:168},{distance:400,moving_time:160,average_speed:2.5,average_heartrate:150},{distance:2000,moving_time:470,average_speed:4.25,average_heartrate:169}];
  const splits=[{distance:1000,moving_time:250,average_speed:4.0,average_heartrate:150},{distance:1000,moving_time:255,average_speed:3.92,average_heartrate:152}];
  sessions.unshift({week:'3',day:'Tue',session:'Threshold Intervals',intensity:'hard',pace:'4:00',dist:'11.2',hr:'160',dur:'52',feel:4,ts:Date.now(),gid:'strava-x',strava_laps:laps,strava_splits:splits});
  saveData();
});
const bd=await page.evaluate(()=>{ const s=sessions[0]; return _cardBreakdown(s); });
check('Breakdown present for lap session', !!bd && bd.rows.length===3, JSON.stringify(bd&&{title:bd.title,n:bd.rows.length}));
check('Lap rows carry dist/time/pace/hr/work', !!bd && bd.rows[0].distM===2000 && bd.rows[0].secs===480 && bd.rows[0].hr===168 && bd.rows[0].work===true, JSON.stringify(bd&&bd.rows[0]));
// Layout builds + renders at t=0.5 and t=1 without throwing
const built=await page.evaluate(async()=>{ await shareSession(0); return !!_shareLayout && _shareLayout.H>0 && _shareLayout.rows.length===3; });
check('shareSession builds a layout + opens preview', built);
const drew=await page.evaluate(()=>{ try{ const cv=document.getElementById('sharecard-canvas'); const x=cv.getContext('2d'); _renderShareCard(x,0.5); _renderShareCard(x,1); return true; }catch(e){ return 'ERR:'+e.message; } });
check('Card renders mid + final frame without error', drew===true, drew);
// Export produces a PNG blob
const exported=await page.evaluate(async()=>{ const {W,H}=_shareLayout; const cv=document.createElement('canvas');cv.width=W;cv.height=H; _renderShareCard(cv.getContext('2d'),1); const b=await new Promise(r=>cv.toBlob(r,'image/png')); return b&&b.size>1000; });
check('Exports a non-trivial PNG', exported===true);

// Grouped structure: warm-up + multi-lap rep + rests + cool-down → Warm-up/Rep/Rest/Cool-down
await page.evaluate(()=>{
  const L=(d,mt,sp,hr)=>({distance:d,moving_time:mt,elapsed_time:mt,average_speed:sp,average_heartrate:hr});
  sessions.length=0;
  sessions.push({week:'3',day:'Tue',session:'Intervals',pace:'4:05',dist:'11.3',hr:'160',dur:'50',feel:4,ts:Date.now(),gid:'strava-g',
    strava_laps:[L(2000,600,3.33,130),L(1000,238,4.20,165),L(1000,240,4.17,168),L(400,160,2.5,150),L(2000,475,4.21,169),L(400,160,2.5,150),L(2000,470,4.26,170),L(1500,450,3.33,135)]});
  saveData();
});
const g=await page.evaluate(()=>_cardBreakdown(sessions[0]));
check('Lap session groups into structure', !!g && g.grouped===true, g&&g.title);
check('Groups: Warm-up · 3 reps · 2 rests · Cool-down', !!g && g.rows.map(r=>r.kind).join(',')==='warm,work,rest,work,rest,work,cool', g&&g.rows.map(r=>r.label).join('|'));
check('Rep 1 merges its 2 sub-laps into ~2km', !!g && Math.abs(g.rows[1].distM-2000)<1 && g.rows[1].laps===2, g&&JSON.stringify({d:g.rows[1].distM,laps:g.rows[1].laps}));
const rc=await page.evaluate(async()=>{ await shareSession(0); return _shareLayout.grid.find(t=>t[0]==='WORK REPS')?.[1]; });
check('WORK REPS tile reflects 3 grouped reps (not raw laps)', rc==='3', rc);

// Per-km splits session (no laps) → PER-KM/MI SPLITS
await page.evaluate(()=>{ sessions.length=0; sessions.push({week:'1',day:'Wed',session:'Tempo',pace:'4:10',dist:'8',hr:'150',dur:'34',feel:4,ts:Date.now(),gid:'file-y',strava_splits:[{distance:1000,moving_time:250,average_speed:4.0,average_heartrate:150}]}); saveData(); });
const bd2=await page.evaluate(()=>_cardBreakdown(sessions[0]));
check('Split session → PER-x SPLITS title', !!bd2 && /SPLITS/.test(bd2.title), bd2&&bd2.title);

// No splits → no breakdown, card still builds
await page.evaluate(()=>{ sessions.length=0; sessions.push({week:'1',day:'Mon',session:'Easy Run',pace:'5:30',dist:'6',dur:'33',feel:3,ts:Date.now(),gid:'m1'}); saveData(); });
const noBd=await page.evaluate(async()=>{ const b=_cardBreakdown(sessions[0]); await shareSession(0); return {bd:b, ok:!!_shareLayout&&_shareLayout.H>0}; });
check('No-splits session → no breakdown but card still builds', noBd.bd===null && noBd.ok, JSON.stringify(noBd));

// Video export pipeline runs (MediaRecorder + captureStream) without throwing
const vid=await page.evaluate(async()=>{ try{ await shareSession(0); await _shareVideo(true); return 'ok'; }catch(e){ return 'ERR:'+e.message; } });
check('Video export runs without error', vid==='ok'||/not supported/i.test(vid), vid);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
