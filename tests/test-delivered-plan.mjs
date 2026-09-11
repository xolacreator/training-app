// A plan that arrived already computed must be stored and served back VERBATIM.
//
// The plan states its own rules, and they are the test:
//   1. Do not generate a program from it. Store it, serve it back.
//   2. Do not round, rescale or tidy any number.
//   3. Dates are authoritative — NOT a repeating weekly pattern.
//   4. Never invent a pace.
//   5. Show the caution and assumption text.
//
// The strongest assertion here is byte-identity: every line the app shows must be
// findable, character for character, in the source document.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const MD  = readFileSync(new URL('./fixtures/delivered-plan.md', import.meta.url), 'utf8');
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});

const plan = await page.evaluate((md)=>{ const p=parseDeliveredPlan(md,'Anaheim handoff');
  if(!p.error) saveDeliveredPlan(p); return p; }, MD);

// ── 1. Stored, complete, nothing dropped ───────────────────────────────────
check('All 89 sessions are stored', plan.count===89, String(plan.count));
check('Nothing was dropped as unparseable', plan.unparsed.length===0, JSON.stringify(plan.unparsed));
check('The date range is the block, not a guess',
  plan.start==='2026-09-07' && plan.end==='2026-12-04', `${plan.start} → ${plan.end}`);
check('The whole document is kept, not just the sessions', plan.raw===MD);

// ── 2. VERBATIM — the assertion that matters most ──────────────────────────
const src = MD.split('\n');
check('Every session line exists byte-for-byte in the source',
  plan.sessions.every(s=>src.includes(s.raw)),
  String(plan.sessions.filter(s=>!src.includes(s.raw)).length)+' altered');
check('Prescriptions keep their internal double spaces',
  plan.sessions.some(s=>/\s{2}/.test(s.prescription)));
check('No number was rounded — the odd wall-ball counts survive', await page.evaluate(()=>{
  const s=deliveredSessionOn('2026-11-17');
  return /23 wall balls/.test(s.prescription) && /60 wall balls/.test(s.prescription); }),
  await page.evaluate(()=>deliveredSessionOn('2026-11-17').prescription.slice(0,60)));
check('...and so do the awkward ones elsewhere', await page.evaluate(()=>{
  const a=deliveredSessionOn('2026-11-24'), b=deliveredSessionOn('2026-12-01');
  return /2 x 9 wall balls/.test(a.prescription) && /2 x 6 wall balls/.test(b.prescription); }));
check('Paces are served as written, never recomputed', await page.evaluate(()=>{
  const s=deliveredSessionOn('2026-09-08');
  return /3:57\/km/.test(s.prescription); }),
  await page.evaluate(()=>deliveredSessionOn('2026-09-08').prescription));

// ── 3. Dates are authoritative, not a weekly pattern ───────────────────────
const pattern = await page.evaluate(()=>{
  const p=loadDeliveredPlan();
  const byWeekday={};
  p.sessions.forEach(s=>{ (byWeekday[s.title]=byWeekday[s.title]||new Set()).add(s.weekday); });
  const moving=Object.entries(byWeekday).filter(([,set])=>set.size>1).length;
  const w6=deliveredWeekOf('2026-10-12'), w7=deliveredWeekOf('2026-10-19');
  return { moving,
    w6:w6.days.filter(d=>d.session).map(d=>d.weekday+':'+d.session.title),
    w7:w7.days.filter(d=>d.session).map(d=>d.weekday+':'+d.session.title) };
});
check('Sessions genuinely move between weekdays', pattern.moving>=3, String(pattern.moving)+' titles move');
check('Week 6 and week 7 differ — it is not a repeating template',
  JSON.stringify(pattern.w6)!==JSON.stringify(pattern.w7),
  pattern.w6.join(' | '));
check('A specific date returns its own session, not a weekday lookup', await page.evaluate(()=>{
  const a=deliveredSessionOn('2026-10-07'), b=deliveredSessionOn('2026-10-14');
  return a && b && a.prescription!==b.prescription; }));
check('A date outside the block returns nothing rather than inventing one',
  await page.evaluate(()=>deliveredSessionOn('2027-01-01')===null));

// ── 4. NOTHING regenerates it ──────────────────────────────────────────────
check('The delivered plan does NOT go through the session prescriber', await page.evaluate(()=>{
  const s=deliveredSessionOn('2026-09-08');
  // _progressEndurance would return an object with distance/duration keys. A
  // delivered session is a flat record of strings and nothing more.
  return typeof s.prescription==='string' && !('distance' in s) && !('duration' in s)
         && !('volumeScaled' in s) && !('phase' in s); }));
check('...and the volume scaler never touches it', await page.evaluate(()=>{
  const before=deliveredSessionOn('2026-10-17').prescription;
  setTrainingInput('weeklyKm', 90);              // would move any generated dose
  const after=deliveredSessionOn('2026-10-17').prescription;
  setTrainingInput('weeklyKm','');
  return before===after; }));
check('...nor does changing the goal', await page.evaluate(()=>{
  const before=deliveredSessionOn('2026-10-17').prescription;
  coachProfile={goal:'HYROX sub-60 elite'}; localStorage.setItem('ht-goal','HYROX sub-60 elite');
  const after=deliveredSessionOn('2026-10-17').prescription;
  return before===after; }));

// ── 5. It outranks a generated block, and shows the caution text ───────────
const ui = await page.evaluate(()=>{
  coachProfile={goal:'HYROX Pro sub-70', raceDate:'2026-12-04'};
  localStorage.setItem('ht-race-date','2026-12-04'); localStorage.setItem('ht-goal','HYROX Pro sub-70');
  saveProgramData(buildHyroxBlock({division:'pro_men', sessionsPerWeek:5}));   // engine block too
  openProgramOverlay();
  const t=document.getElementById('program-overlay-body').innerText;
  return { text:t, hasGenerated:/Compromised Run/.test(t) };
});
check('A delivered plan outranks a generated block', !ui.hasGenerated,
  ui.text.slice(0,60).replace(/\n/g,' / '));
check('It says plainly that it was delivered, not generated',
  /delivered, not generated/i.test(ui.text));
check('The caution and assumption text is shown, not dropped',
  /STORE THIS, DO NOT REGENERATE/i.test(ui.text) && /Never invent a pace/i.test(ui.text));
check('...including what the athlete must be told about ATHX',
  /ATHX Long Beach is on 2026-11-07/.test(ui.text));
check('...and the constraint it could not satisfy', /back to back/i.test(ui.text),
  'the 4-of-13-weeks caution');
check('Real session text reaches the screen verbatim',
  ui.text.includes('5 x (800 m at 4:10/km + 23 wall balls), short recovery'));

// ── Removal and survival ───────────────────────────────────────────────────
check('It survives a backup', await page.evaluate(()=>BACKUP_KEYS.includes('ht-delivered-plan')));
check('Removing it falls back to the generated block', await page.evaluate(()=>{
  clearDeliveredPlan(); renderProgramBody();
  return /HYROX Block|Compromised Run/.test(document.getElementById('program-overlay-body').innerText); }));
check('A malformed file is refused with a reason', await page.evaluate(()=>{
  const r=parseDeliveredPlan('# Just a heading\n\nNo sessions here.','x');
  return !!r.error && /no dated sessions/i.test(r.error); }));
check('An empty file is refused', await page.evaluate(()=>!!parseDeliveredPlan('','x').error));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
