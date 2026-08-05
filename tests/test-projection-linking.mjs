import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');localStorage.removeItem('ht-program');localStorage.removeItem('ht-hyrox');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Projection + linking API exists', await page.evaluate(()=>['hyroxProject','hyroxApplyProjection','openLinkSession','linkSessionToPlanned','unlinkSession','_linkableSessions'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

const mkRun=`(name,kms,startSecs,fadePerKm)=>{
  const sp=[]; for(let i=0;i<kms;i++){ const t=Math.round(startSecs*(1+fadePerKm*i));
    sp.push({distance:1000,moving_time:t,average_speed:1000/t}); }
  const tot=sp.reduce((a,x)=>a+x.moving_time,0);
  return {session:name,dist:String(kms),dur:String(Math.round(tot/60)),
    pace:Math.floor(tot/kms/60)+':'+String(Math.round(tot/kms%60)).padStart(2,'0'),
    intensity:'hard',ts:Date.now(),gid:name+Math.random(),strava_splits:sp}; }`;

// ── Projection always hits the GOAL (it's a projection, not a record) ───────
const noData=await page.evaluate(()=>{ sessions.length=0;
  hyroxPlan={goalSecs:4500,cat:{div:'open',gen:'men'},splits:{...HYROX_BASES.open_men}};
  const p=hyroxProject();
  const tot=HYROX_SEGMENTS.reduce((a,s)=>a+(p.splits[s.id]||0),0);
  return { tot, goal:p.goal, src:p.shapeSrc, notes:p.notes }; });
check('With no evidence, splits still total the goal exactly', noData.tot===4500 && noData.goal===4500, JSON.stringify({tot:noData.tot}));
check('…and it says it used the reference shape', noData.src==='category' && noData.notes.some(n=>/reference shape/.test(n)), JSON.stringify(noData.notes[0]));

// ── With evidence, the run SHAPE changes but the goal is still met ──────────
const withData=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  sessions.push(make('Tempo run',8,270,0.03)); sessions.push(make('Tempo run',8,272,0.03)); sessions.push(make('Long run',10,280,0.03));
  hyroxPlan={goalSecs:4500,cat:{div:'open',gen:'men'},splits:{...HYROX_BASES.open_men}};
  const p=hyroxProject();
  const tot=HYROX_SEGMENTS.reduce((a,s)=>a+(p.splits[s.id]||0),0);
  return { tot, src:p.shapeSrc, r1:p.splits.run1, r8:p.splits.run8, measured:p.measured, notes:p.notes }; }, mkRun);
check('With evidence the goal is still met exactly', withData.tot===4500, String(withData.tot));
check('Run shape is now measured, not the reference', withData.src==='measured' && withData.measured.generalFade, JSON.stringify(withData.measured));
check('A fading athlete gets rising run targets', withData.r8>withData.r1, JSON.stringify({r1:withData.r1,r8:withData.r8}));
check('Provenance names the evidence used', withData.notes.some(n=>/fade .*%\/km across \d+ split-logged runs/.test(n)), JSON.stringify(withData.notes[0]));

// A flat athlete gets flat targets (no imposed attrition), still hitting the goal
const flat=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  for(let i=0;i<3;i++) sessions.push(make('Tempo run',8,270,0));
  hyroxPlan={goalSecs:4500,cat:{div:'open',gen:'men'},splits:{...HYROX_BASES.open_men}};
  const p=hyroxProject();
  return { r1:p.splits.run1, r8:p.splits.run8, tot:HYROX_SEGMENTS.reduce((a,s)=>a+(p.splits[s.id]||0),0) }; }, mkRun);
check('A non-fading athlete gets even run targets', Math.abs(flat.r8-flat.r1)<=5 && flat.tot===4500, JSON.stringify(flat));

// Changing the goal rescales the targets
const faster=await page.evaluate((mk)=>{ const make=eval(mk); sessions.length=0;
  sessions.push(make('Tempo run',8,270,0.03)); sessions.push(make('Tempo run',8,272,0.03));
  hyroxPlan={goalSecs:3600,cat:{div:'open',gen:'men'},splits:{}};
  const p=hyroxProject();
  return { tot:HYROX_SEGMENTS.reduce((a,s)=>a+(p.splits[s.id]||0),0), r1:p.splits.run1 }; }, mkRun);
check('A faster goal produces faster targets, summing to the new goal', faster.tot===3600 && faster.r1<withData.r1, JSON.stringify(faster));

// ── Linking an imported session to a planned one (any day) ─────────────────
const setup=await page.evaluate(()=>{
  saveProgramData({id:'p',name:'Block',type:'endurance',startDate:_mondayISO(new Date()),weeks:8,sessionsPerWeek:3,
    sessions:[{id:'tempo',type:'endurance',name:'Tempo',runType:'tempo'},{id:'long',type:'endurance',name:'Long Run',runType:'long'}],
    dayMap:[null,null,'tempo',null,null,'long',null],
    weeklyProgressions:Array.from({length:9},(_,i)=>({week:i+1}))});
  recomputeAthleteState();
  // A tempo actually done on THURSDAY, though the plan says Wednesday → never auto-links
  const th=new Date(); const wk=_progActualWeek();
  sessions.length=0;
  sessions.push({session:'Tempo Intervals',dist:'10',pace:'4:20',intensity:'hard',date:todayISO(),ts:Date.now(),gid:'strava-1'});
  return { wk, linkedBefore:!!sessions[0].progSid };
});
check('An imported session starts unlinked', setup.linkedBefore===false);
check('It appears as a link candidate', await page.evaluate((wk)=>_linkableSessions(wk).length>=1, setup.wk));
const linked=await page.evaluate((wk)=>{ linkSessionToPlanned(0,'tempo',wk);
  return { sid:sessions[0].progSid, pw:sessions[0].progWeek, pid:sessions[0].progId }; }, setup.wk);
check('Linking attaches it to the planned session (any weekday)', linked.sid==='tempo' && String(linked.pw)===String(setup.wk) && !!linked.pid, JSON.stringify(linked));
check('A linked session is no longer offered as a candidate', await page.evaluate((wk)=>_linkableSessions(wk).every(c=>c.idx!==0), setup.wk));
check('Unlinking clears it', await page.evaluate(()=>{ unlinkSession(0); return !sessions[0].progSid && !sessions[0].progWeek; }));
// The overlay exposes the control
const ui=await page.evaluate((wk)=>{ openProgramSessionOverlay('tempo',wk,'Wed');
  const h=document.getElementById('po-breakdown').innerHTML;
  return { btn:/Link a logged session/.test(h), fn:/openLinkSession/.test(h) }; }, setup.wk);
check('Planned-session overlay offers "Link a logged session"', ui.btn && ui.fn, JSON.stringify(ui));
const uiLinked=await page.evaluate((wk)=>{ linkSessionToPlanned(0,'tempo',wk); openProgramSessionOverlay('tempo',wk,'Wed');
  const h=document.getElementById('po-breakdown').innerHTML; return /Linked to/.test(h)&&/unlinkSession/.test(h); }, setup.wk);
check('Once linked the overlay shows it + offers Unlink', uiLinked);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
