// Fitstop session detail — the app ships block STRUCTURE as knowledge, but the
// verbatim session text now comes from the athlete (pasted per session) rather than
// a dated block hardcoded into the bundle. See tests/test-fitstop-paste.mjs for the
// paste/store/clear behaviour; this file covers rendering the detail once present.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-fitstop-detail');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// ── Block STRUCTURE is knowledge and stays in the bundle ────────────────────
const struct=await page.evaluate(()=>({
  phases:(FITSTOP_BLOCK_C.phases||[]).map(p=>p.name),
  weeks:(FITSTOP_BLOCK_C.plan||[]).length,
  wk1Formats:(FITSTOP_BLOCK_C.plan||[])[0]?.[1],
  phaseOf7:_fitstopPhase(7)?.name,
}));
check('Block phases retained (BASE→BUILD→PERFORMANCE→PEAK)', struct.phases.join(',')==='BASE,BUILD,PERFORMANCE,PEAK', struct.phases.join(','));
check('12-week format grid retained', struct.weeks===12 && Array.isArray(struct.wk1Formats) && struct.wk1Formats.length===6, JSON.stringify(struct.wk1Formats));
check('Phase lookup still works (week 7 = PERFORMANCE)', struct.phaseOf7==='PERFORMANCE', struct.phaseOf7);
check('No dated verbatim programming ships in the bundle', await page.evaluate(()=>typeof FITSTOP_BLOCK_C_DETAIL==='undefined'));

// ── Attach a Fitstop program ───────────────────────────────────────────────
await page.evaluate(()=>{
  saveProgramData({id:'p',name:'Fitstop Block',type:'fitstop',startDate:_mondayISO(new Date()),weeks:12,sessionsPerWeek:5,
    sessions:[{id:'perform',type:'fitstop',name:'PERFORM',focus:'engine'},{id:'lift',type:'strength',name:'LIFT',focus:'main lifts',exercises:[{name:'Back Squat',sets:'4',reps:'5'}]}],
    dayMap:['perform','lift',null,null,null,null,null],
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1})),
    fitstopBlock:FITSTOP_BLOCK_C});
  recomputeAthleteState();
});

// ── Without pasted detail the session still renders (graceful, no stale text) ──
const bare=await page.evaluate(()=>{ openProgramSessionOverlay('perform',1,'Mon');
  const h=document.getElementById('po-breakdown').innerHTML; return { len:h.length, offers:/Paste this session/.test(h) }; });
check('Session renders without pasted detail', bare.len>200);
check('…and invites the athlete to paste the real programming', bare.offers);

// ── Once pasted, the verbatim text is rendered ─────────────────────────────
const PERFORM='R-EMOM + FINISHER\nINDIVIDUAL // MAX 6 PER STATION\n24 MIN R-EMOM\n1) DB RENEGADE ROW\n2) BURPEE BOX JUMP\n3) HANG POWER CLEAN';
const LIFT='4 x 9 MIN\nTEAMS OF 3\n1) 3-4 ROUNDS\nA. 8-5-4-3 BACK SQUAT RIR 1-3\nB. 8-12 TRX FACE PULL';
const rendered=await page.evaluate(([p,l])=>{
  saveFitstopDetail(1,'Mon',p); saveFitstopDetail(1,'Tue',l);
  openProgramSessionOverlay('perform',1,'Mon'); const mon=document.getElementById('po-breakdown').innerHTML;
  openProgramSessionOverlay('lift',1,'Tue');    const tue=document.getElementById('po-breakdown').innerHTML;
  return { mon, tue };
}, [PERFORM, LIFT]);
check('PERFORM detail renders verbatim', /RENEGADE ROW/i.test(rendered.mon) && /R-EMOM/.test(rendered.mon), rendered.mon.replace(/<[^>]*>/g,' ').slice(0,60).trim());
check('LIFT detail renders verbatim', /BACK SQUAT/i.test(rendered.tue) && /RIR/.test(rendered.tue));
check('Structured formatting is applied (station/movement lines)', /1\)/.test(rendered.mon) && /A\./.test(rendered.tue));
check('Pasted detail replaces the generated body, not appended twice', (rendered.mon.match(/RENEGADE ROW/gi)||[]).length===1);

// ── Detail is per week/day ─────────────────────────────────────────────────
check('A different week has no detail until pasted', await page.evaluate(()=>_fitstopDetail(12,'Mon')===''));
check('Editing swaps the stored text', await page.evaluate(()=>{ saveFitstopDetail(1,'Mon','2 x 18 MIN\nNEW FORMAT'); return /NEW FORMAT/.test(_fitstopDetail(1,'Mon')) && !/RENEGADE/.test(_fitstopDetail(1,'Mon')); }));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
