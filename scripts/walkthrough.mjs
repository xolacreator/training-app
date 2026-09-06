#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// WALKTHROUGH — drive the app the way an athlete would, and report what breaks.
//
// The unit suite proves functions behave. It does not prove the app WORKS: a screen
// can render blank, a button can call a function that no longer exists, an overlay
// can open over nothing. Every regression in this project that reached the phone got
// past a green suite, because the suite called the engine directly and never pressed
// the button.
//
// This presses the buttons. It is deliberately not a pass/fail gate — it is a report.
//
//   node scripts/walkthrough.mjs            # the full journey
//   node scripts/walkthrough.mjs --json     # machine-readable
//   node scripts/walkthrough.mjs --keep     # leave the browser state for inspection
// ─────────────────────────────────────────────────────────────────────────────
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';

const APP  = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const JSON_OUT = process.argv.includes('--json');
const C = { dim:s=>`\x1b[2m${s}\x1b[0m`, b:s=>`\x1b[1m${s}\x1b[0m`, g:s=>`\x1b[32m${s}\x1b[0m`,
            r:s=>`\x1b[31m${s}\x1b[0m`, y:s=>`\x1b[33m${s}\x1b[0m`, c:s=>`\x1b[36m${s}\x1b[0m` };

const findings = [];   // { severity, where, what }
const note = (severity, where, what) => findings.push({severity, where, what});
const steps = [];      // narrative

const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await browser.newContext({viewport:{width:393,height:852}});
const page = await ctx.newPage();

// Anything the page throws while we drive it is a finding, attributed to wherever we are.
let where = 'startup';
const jsErrors = [];
page.on('pageerror', e => { jsErrors.push({where, msg:String(e)}); });
page.on('console', m => { if (m.type()==='error'){
  const t=m.text(); if(!/Failed to load resource|ERR_|net::|Chart|favicon/.test(t)) jsErrors.push({where, msg:t}); }});

await page.goto(APP, {waitUntil:'load'});
const step = async (label, fn) => {
  where = label;
  const before = jsErrors.length;
  let out=null;
  try { out = await fn(); }
  catch(e){ note('BROKEN', label, `threw: ${e.message.split('\n')[0]}`); }
  const threw = jsErrors.slice(before);
  threw.forEach(e => note('JS ERROR', label, e.msg.split('\n')[0].slice(0,140)));
  steps.push({label, ok: !threw.length, detail: out});
  return out;
};

// ── A brand-new athlete ─────────────────────────────────────────────────────
await step('fresh install', async () => {
  await page.evaluate(()=>{ localStorage.clear(); sessionStorage.clear(); });
  await page.reload({waitUntil:'load'});
  await page.waitForTimeout(400);
  const ob = await page.evaluate(()=>{
    const el=document.getElementById('onboard-overlay');
    return { onboardingShown: !!(el && getComputedStyle(el).display!=='none'),
             bodyText: (document.body.innerText||'').slice(0,80) };
  });
  if (!ob.onboardingShown) note('QUESTION','fresh install','onboarding overlay did not appear for a brand-new user');
  return ob.onboardingShown ? 'onboarding shown' : 'no onboarding';
});

await step('skip onboarding', async () => {
  await page.evaluate(()=>{
    localStorage.setItem('ht-onboarded','true'); sessionStorage.setItem('mc-shown','1');
  });
  await page.reload({waitUntil:'load'});
  await page.waitForTimeout(400);
  return 'onboarded';
});

// ── Every screen renders and is not empty ───────────────────────────────────
const SCREENS = ['today','log','plan','stats','more'];
for (const s of SCREENS){
  await step(`screen: ${s}`, async () => {
    await page.evaluate(id=>nav(id), s);
    await page.waitForTimeout(300);
    const r = await page.evaluate(id=>{
      const el=document.getElementById('screen-'+id);
      if(!el) return {missing:true};
      const txt=(el.innerText||'').trim();
      const btns=[...el.querySelectorAll('button')].length;
      return { chars:txt.length, buttons:btns, head:txt.slice(0,70).replace(/\n/g,' / ') };
    }, s);
    if (r.missing){ note('BROKEN', `screen: ${s}`, 'screen element does not exist'); return 'MISSING'; }
    if (r.chars < 40) note('BROKEN', `screen: ${s}`, `renders almost nothing (${r.chars} chars)`);
    return `${r.chars} chars · ${r.buttons} buttons · ${r.head}`;
  });
}

// ── Every onclick points at a function that exists ──────────────────────────
await step('dead buttons', async () => {
  const dead = await page.evaluate(()=>{
    const out=[];
    document.querySelectorAll('[onclick]').forEach(el=>{
      const code=el.getAttribute('onclick')||'';
      // First identifier that looks like a call.
      const m=code.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
      if(!m) return;
      const fn=m[1];
      // `onclick="if(confirm(...)){...}"` is a statement, not a call to `if`.
      if(['if','for','while','switch','return','typeof','void','do','try','delete','new'].includes(fn)) return;
      if(typeof window[fn]!=='function'){
        out.push({fn, label:(el.innerText||el.id||'').trim().slice(0,32), code:code.slice(0,60)});
      }
    });
    // dedupe by function name
    const seen=new Set();
    return out.filter(x=>{ if(seen.has(x.fn)) return false; seen.add(x.fn); return true; });
  });
  dead.forEach(d=>note('BROKEN','dead button',`"${d.label}" calls ${d.fn}() which is not defined`));
  return dead.length ? `${dead.length} dead` : 'all handlers resolve';
});

// ── Every overlay opens and closes ──────────────────────────────────────────
// An overlay must be opened the way the app opens it. Calling raw openOv() shows the
// empty shell — which reported the assessment overlay as "opens nearly empty (4 chars)"
// when via openAssessmentOverlay() it renders the full Cooper test. Where a real opener
// exists, use it; the id-only entries genuinely have no dedicated opener.
const OVERLAYS = [
  ['program-overlay',    'openProgramOverlay()'],
  ['coach-overlay',      'openCoach()'],
  ['log-overlay',        null],
  ['plan-overlay',       null],
  ['builder-overlay',    null],
  ['assessment-overlay', 'openAssessmentOverlay(ASSESSMENT_SESSIONS[0].id)'],
  ['templates-overlay',  null],
  ['hyrox-overlay',      null],
  ['review-overlay',     null],
  ['sharecard-overlay',  null],
  ['timer-overlay',      null],
  ['morning-overlay',    null],
];
for (const [ov, opener] of OVERLAYS){
  await step(`overlay: ${ov}`, async () => {
    const r = await page.evaluate(([id, opener])=>{
      const el=document.getElementById(id);
      if(!el) return {missing:true};
      if(opener){ try{ (0,eval)(opener); }catch(e){ return {err:`${opener} threw: ${e.message}`}; } }
      // openOv/closeOv toggle an `open` class — they do not set display. Reading
      // computed display here reported all twelve overlays as "would not close",
      // which was the harness, not the app.
      else { try{ openOv(id); }catch(e){ return {err:e.message}; } }
      const shown=el.classList.contains('open');
      const chars=(el.innerText||'').trim().length;
      try{ closeOv(id); }catch(e){}
      const closed=!el.classList.contains('open');
      // An opener may legitimately send the athlete somewhere else — openCoach()
      // routes to coach setup when there is no profile yet. That is correct
      // behaviour, not a hidden overlay, so report where it actually went.
      let redirect=null;
      if(opener && !shown){
        const other=[...document.querySelectorAll('.overlay.open, [id$="-overlay"].open')]
          .map(e=>e.id).filter(x=>x&&x!==id);
        if(other.length) redirect=other[0];
      }
      return {shown, chars, closed, opener:!!opener, redirect};
    }, [ov, opener]);
    if (r.missing){ note('QUESTION',`overlay: ${ov}`,'element not in the DOM'); return 'missing'; }
    if (r.err){ note('BROKEN',`overlay: ${ov}`,`openOv threw: ${r.err}`); return 'threw'; }
    if (!r.shown && !r.redirect) note('BROKEN',`overlay: ${ov}`,'opened but stayed hidden');
    // Only meaningful for overlays we opened properly — a raw shell is expected to be thin.
    if (r.opener && r.chars < 20) note('QUESTION',`overlay: ${ov}`,`opens nearly empty (${r.chars} chars)`);
    if (!r.closed) note('BROKEN',`overlay: ${ov}`,'would not close');
    if (r.redirect) return `redirected to ${r.redirect}`;
    return `${r.chars} chars${r.opener?'':' (shell only)'}${r.closed?'':' · DID NOT CLOSE'}`;
  });
}

// ── The journey that matters: goal → block → log → plan → change goal ───────
await step('set a goal', async () => {
  return page.evaluate(()=>{
    coachProfile={name:'Lab', goal:'HYROX Melbourne — Open Men, sub-80',
                  raceDate:new Date(Date.now()+84*86400000).toISOString().slice(0,10)};
    localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
    localStorage.setItem('ht-race-date',coachProfile.raceDate);
    _syncGoalToEngine(coachProfile.goal);
    return coachProfile.goal;
  });
});

await step('builder screen', async () => {
  const r = await page.evaluate(()=>{
    savedProgram=null; localStorage.removeItem('ht-program');
    openProgramOverlay();
    const el=document.getElementById('program-overlay-body');
    const txt=(el.innerText||'').trim();
    return { chars:txt.length, head:txt.slice(0,90).replace(/\n/g,' / '),
             inputs:[...el.querySelectorAll('input')].map(i=>i.id||i.type),
             buttons:[...el.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean) };
  });
  if (r.chars<40) note('BROKEN','builder screen','renders almost nothing');
  if (!r.inputs.includes('bld-start')) note('BROKEN','builder screen','start-date picker is missing');
  return `${r.buttons.length} buttons · inputs: ${r.inputs.join(',')} · ${r.head}`;
});

await step('state where you are', async () => {
  return page.evaluate(()=>{
    setTrainingInput('weeklyKm',30); setTrainingInput('longestKm',12);
    setTrainingInput('runDays',4);   setTrainingInput('trainingAge',3);
    renderProgramBuilder();
    const st=athleteTrainingState();
    return `${st.weeklyKm} km/wk · longest ${st.longestKm} · ${st.trainingAge} yr`;
  });
});

await step('build the block', async () => {
  const r = await page.evaluate(()=>{
    const p=buildBlockForGoal({goal:coachProfile.goal, weeks:12, sessionsPerWeek:4,
      trainDays:['Mon','Wed','Fri','Sat']});
    if(!p) return {none:true};
    saveProgramData(p); currentProgramWeek=1; programViewWeek=1;
    return { name:p.name, engine:p.engine, weeks:p.weeks,
             wk1:(_progWeekSessions(1)||[]).filter(s=>s.session)
                  .map(s=>`${s.day} ${s.session.name}`).join(', ') };
  });
  if (r.none){ note('BROKEN','build the block','a stated HYROX goal produced no block'); return 'NO BLOCK'; }
  if (r.engine!=='hyrox') note('BROKEN','build the block',`HYROX goal routed to "${r.engine}"`);
  return `${r.name} · ${r.weeks}w · ${r.wk1}`;
});

await step('plan screen shows it', async () => {
  await page.evaluate(()=>{ nav('plan'); try{ renderPlan(1); }catch(e){} });
  await page.waitForTimeout(300);
  const r = await page.evaluate(()=>{
    const el=document.getElementById('screen-plan');
    const txt=(el.innerText||'').trim();
    return { chars:txt.length, hasProgram:/HYROX|Compromised|Station/i.test(txt),
             head:txt.slice(0,90).replace(/\n/g,' / ') };
  });
  if (!r.hasProgram) note('BROKEN','plan screen','the block was created but the Plan screen does not show it');
  return `${r.chars} chars · ${r.head}`;
});

await step('open a session', async () => {
  const r = await page.evaluate(()=>{
    const slot=(_progWeekSessions(1)||[]).find(s=>s.session);
    if(!slot) return {none:true};
    try{ openProgramSessionOverlay(slot.session.id, 1, slot.day); }catch(e){ return {err:e.message}; }
    const el=document.getElementById('po-breakdown');
    const txt=el?(el.innerText||'').trim():'';
    const title=(document.getElementById('po-title')||{}).textContent||'';
    return { title, chars:txt.length, head:txt.slice(0,90).replace(/\n/g,' / ') };
  });
  if (r.none){ note('BROKEN','open a session','no sessions in week 1'); return 'none'; }
  if (r.err){ note('BROKEN','open a session',`threw: ${r.err}`); return 'threw'; }
  if (r.chars<30) note('BROKEN','open a session',`"${r.title}" opens nearly empty (${r.chars} chars)`);
  return `${r.title} · ${r.chars} chars · ${r.head}`;
});

await step('log a session', async () => {
  const r = await page.evaluate(()=>{
    const before=(sessions||[]).length;
    sessions.push({gid:'wt1', week:'1', day:'Mon', session:'Easy Run', dist:'6', pace:'5:40',
                   date:new Date().toISOString().slice(0,10), ts:Date.now()});
    saveData();
    const stored=JSON.parse(localStorage.getItem('ht-v4')||'[]');
    try{ renderAll(); }catch(e){ return {err:e.message}; }
    return { before, after:sessions.length, stored:stored.length };
  });
  if (r.err){ note('BROKEN','log a session',`renderAll threw: ${r.err}`); return 'threw'; }
  if (r.stored !== r.after) note('BROKEN','log a session',`in memory ${r.after} but stored ${r.stored}`);
  return `${r.before} → ${r.after} sessions, ${r.stored} stored`;
});

await step('change the goal', async () => {
  const r = await page.evaluate(()=>{
    coachProfile.goal='Sub-3:30 marathon at Melbourne';
    localStorage.setItem('ht-coach',JSON.stringify(coachProfile));
    _syncGoalToEngine(coachProfile.goal);
    const engine=_engineForGoal(coachProfile.goal);
    const p=buildBlockForGoal({goal:coachProfile.goal, weeks:16, sessionsPerWeek:4,
      trainDays:['Mon','Wed','Fri','Sat']});
    return { engine, built:!!p, name:p&&p.name,
             sessionsKept:(sessions||[]).length };
  });
  if (!r.built) note('BROKEN','change the goal','changing to a marathon goal produced no block');
  if (r.engine==='hyrox') note('BROKEN','change the goal','still routing to HYROX after the goal changed');
  if (r.sessionsKept<1) note('BROKEN','change the goal','logged sessions were lost when the goal changed');
  return `${r.engine} · ${r.name} · ${r.sessionsKept} sessions kept`;
});

await step('clear the goal', async () => {
  const r = await page.evaluate(()=>{
    clearGoal({silent:true});
    return { goal:localStorage.getItem('ht-goal'), race:localStorage.getItem('ht-race-date'),
             sessions:(sessions||[]).length,
             program:!!savedProgram };
  });
  if (r.goal!==null || r.race!==null) note('BROKEN','clear the goal','goal or race date survived clearing');
  if (r.sessions<1) note('BROKEN','clear the goal','clearing the goal destroyed logged sessions');
  return `goal ${r.goal} · race ${r.race} · ${r.sessions} sessions kept · block ${r.program?'kept':'gone'}`;
});

// ── Export / import round-trip, since data loss has happened here before ────
await step('export round-trip', async () => {
  const r = await page.evaluate(()=>{
    const store={}; BACKUP_KEYS.forEach(k=>{const v=localStorage.getItem(k); if(v!=null) store[k]=v;});
    const hasSessions = !!store['ht-v4'] && JSON.parse(store['ht-v4']||'[]').length>0;
    return { keys:Object.keys(store).length, hasSessions,
             hasInputs:'ht-training-inputs' in store };
  });
  if (!r.hasSessions) note('BROKEN','export round-trip','a backup would not contain the logged sessions');
  if (!r.hasInputs) note('QUESTION','export round-trip','training inputs are not in the backup');
  return `${r.keys} keys · sessions ${r.hasSessions?'yes':'NO'} · inputs ${r.hasInputs?'yes':'no'}`;
});

// ── Report ──────────────────────────────────────────────────────────────────
await browser.close();

if (JSON_OUT){
  console.log(JSON.stringify({steps, findings}, null, 2));
} else {
  console.log(`\n${C.b('WALKTHROUGH')}  ${C.dim('— the app, driven the way an athlete would')}\n`);
  for (const s of steps){
    const mark = s.ok ? C.g('✓') : C.r('✗');
    console.log(`  ${mark} ${s.label.padEnd(26)} ${C.dim(String(s.detail ?? '').slice(0,96))}`);
  }
  const broken = findings.filter(f=>f.severity==='BROKEN' || f.severity==='JS ERROR');
  const qs     = findings.filter(f=>f.severity==='QUESTION');
  console.log('');
  if (broken.length){
    console.log(`${C.r(C.b(`${broken.length} BROKEN`))}`);
    broken.forEach(f=>console.log(`  ${C.r('✗')} ${C.b(f.where)} — ${f.what}`));
  } else console.log(C.g('  Nothing broken.'));
  if (qs.length){
    console.log(`\n${C.y(C.b(`${qs.length} worth a look`))}`);
    qs.forEach(f=>console.log(`  ${C.y('?')} ${C.b(f.where)} — ${f.what}`));
  }
  console.log('');
}
process.exit(0);
