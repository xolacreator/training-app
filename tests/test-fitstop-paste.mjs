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

check('Paste API exists', await page.evaluate(()=>['_fitstopDetail','saveFitstopDetail','openFitstopPaste','_fitstopStore'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));
check('The 40KB verbatim block is gone from the bundle', await page.evaluate(()=>typeof FITSTOP_BLOCK_C_DETAIL==='undefined'));

// The FORMAT knowledge is retained
const fmt=await page.evaluate(()=>({
  phases:(FITSTOP_BLOCK_C.phases||[]).map(p=>p.name),
  weeks:(FITSTOP_BLOCK_C.plan||[]).length,
  wk1:(FITSTOP_BLOCK_C.plan||[])[0],
  kb:(typeof FITSTOP_KB!=='undefined')
}));
check('Block STRUCTURE knowledge retained (phases + weekly format grid)', fmt.phases.join(',')==='BASE,BUILD,PERFORMANCE,PEAK' && fmt.weeks===12 && Array.isArray(fmt.wk1[1]), JSON.stringify({phases:fmt.phases,weeks:fmt.weeks}));
check('Session-archetype KB (the learning layer) still present', fmt.kb);

// Attach a fitstop-style program
await page.evaluate(()=>{
  saveProgramData({id:'p',name:'Fitstop Block',type:'fitstop',startDate:_mondayISO(new Date()),weeks:12,sessionsPerWeek:5,
    sessions:[{id:'perform',type:'fitstop',name:'PERFORM',focus:'engine'}],
    dayMap:['perform',null,null,null,null,null,null],
    weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1})),
    fitstopBlock:FITSTOP_BLOCK_C});
  recomputeAthleteState();
});

// ── With nothing pasted, detail is empty and the app degrades gracefully ────
check('No pasted session → detail is empty (no stale data)', await page.evaluate(()=>_fitstopDetail(1,'Mon')===''));
const fallback=await page.evaluate(()=>{ openProgramSessionOverlay('perform',1,'Mon');
  const h=document.getElementById('po-breakdown').innerHTML;
  return { renders:h.length>200, offersPaste:/Paste this session/.test(h), noCrash:true }; });
check('Overlay still renders a session without pasted detail', fallback.renders && fallback.noCrash);
check('…and offers to paste the real programming', fallback.offersPaste);

// ── Paste, retrieve, render ────────────────────────────────────────────────
const TXT='4 x 9 MIN\nTEAMS OF 3 // MAX 9 PER STATION\n1) 3-4 ROUNDS\nA. 12 DB CYCLIST SQUAT\nB. 8-12 LATERAL RAISE';
const saved=await page.evaluate((t)=>{ saveFitstopDetail(1,'Mon',t); return _fitstopDetail(1,'Mon'); }, TXT);
check('Pasted session is stored and retrieved verbatim', saved===TXT, JSON.stringify(saved.slice(0,30)));
const shown=await page.evaluate(()=>{ openProgramSessionOverlay('perform',1,'Mon');
  const h=document.getElementById('po-breakdown').innerHTML;
  return { text:/DB CYCLIST SQUAT/.test(h), edit:/Edit pasted session/.test(h) }; });
check('The overlay renders the pasted session', shown.text, JSON.stringify(shown));
check('…and switches to "Edit pasted session"', shown.edit);

// ── Scoped per week/day and per block; clearing works ──────────────────────
check('Other days are unaffected', await page.evaluate(()=>_fitstopDetail(1,'Tue')==='' && _fitstopDetail(2,'Mon')===''));
check('A different block gets its own store', await page.evaluate(()=>{
  const before=_fitstopDetail(1,'Mon');
  savedProgram.fitstopBlock={...FITSTOP_BLOCK_C, id:'other-block'};
  const other=_fitstopDetail(1,'Mon');
  savedProgram.fitstopBlock=FITSTOP_BLOCK_C;
  return before.length>0 && other===''; }));
check('Clearing removes it', await page.evaluate(()=>{ saveFitstopDetail(1,'Mon',''); return _fitstopDetail(1,'Mon')===''; }));
check('It persists across a reload (stored on device)', await (async()=>{
  await page.evaluate((t)=>saveFitstopDetail(1,'Wed',t), TXT);
  await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
  return await page.evaluate(()=>{ try{dismissDigest();}catch(e){}
    saveProgramData({id:'p',name:'Fitstop Block',type:'fitstop',startDate:_mondayISO(new Date()),weeks:12,sessionsPerWeek:5,
      sessions:[{id:'perform',type:'fitstop',name:'PERFORM'}],dayMap:['perform',null,null,null,null,null,null],
      weeklyProgressions:Array.from({length:13},(_,i)=>({week:i+1})),fitstopBlock:FITSTOP_BLOCK_C});
    return _fitstopDetail(1,'Wed').includes('DB CYCLIST SQUAT'); });
})());

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
