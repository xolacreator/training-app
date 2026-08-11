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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet,.wnsheet,.wnbackdrop{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

check('Race API exists', await page.evaluate(()=>['_parseRaceDate','athleteRaceDate','_raceWeekCount'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── Free-text date parsing (the field is free text by design) ───────────────
const parsed=await page.evaluate(()=>{
  const f=s=>{ const d=_parseRaceDate(s); return d?d.toISOString().slice(0,10):null; };
  return { iso:f('2026-06-20'), monDay:f('Jun 20 2026'), dayMon:f('20 June 2026'),
           withOrdinal:f('June 20th, 2026'), vague:f('HYROX Sydney Nov 2026'), junk:f('sometime soon'), empty:f('') };
});
check('Parses ISO dates', parsed.iso==='2026-06-20', String(parsed.iso));
check('Parses "Jun 20 2026" and "20 June 2026"', parsed.monDay==='2026-06-20' && parsed.dayMon==='2026-06-20', JSON.stringify([parsed.monDay,parsed.dayMon]));
check('Parses ordinals ("June 20th, 2026")', parsed.withOrdinal==='2026-06-20', String(parsed.withOrdinal));
check('Falls back to month+year for vague entries', parsed.vague==='2026-11-01', String(parsed.vague));
check('Unparseable text returns null (no bogus date)', parsed.junk===null && parsed.empty===null, JSON.stringify([parsed.junk,parsed.empty]));
check('Past races are ignored', await page.evaluate(()=>{ coachProfile={raceDate:'Jan 1 2020'}; return athleteRaceDate()===null; }));

// ── Building a program with a race 8 weeks out ─────────────────────────────
const built=await page.evaluate(()=>{
  const d=new Date(); d.setDate(d.getDate()+ (8*7) );              // ~8 weeks away
  const iso=d.toISOString().slice(0,10);
  coachProfile={name:'C',goal:'marathon',raceDate:iso};
  localStorage.setItem('ht-race-date', iso);
  programBuilderConfig={type:'endurance'};
  const p=buildAdaptiveWeek('endurance',6,{goal:'marathon'});      // asked for 6 — race should win
  return { weeks:p.weeks, race:p.race, name:p.name,
           raceSession:!!(p.sessions||[]).find(s=>s.id==='race-day'),
           wantedISO:iso };
});
check('Block length is driven by the race, not the requested 6 weeks', built.weeks>=8 && built.weeks<=9, 'weeks='+built.weeks);
check('A RACE DAY session is created', built.raceSession);
check('Race metadata is stored on the program', !!built.race && built.race.dateISO===built.wantedISO && !!built.race.day, JSON.stringify(built.race));
check('Program is named as a race block', /Race Block/.test(built.name||''), built.name);

// ── Race week: race placed on the right weekday, taper before it ────────────
const wk=await page.evaluate(()=>{
  const p=savedProgram, rw=p.race.week;
  const week=_progWeekSessions(rw);
  const raceSlot=week.find(s=>s.session&&s.session.race);
  const prog=p.weeklyProgressions;
  return { rw, onDay:raceSlot?raceSlot.day:null, expected:p.race.day,
           raceFlag:!!prog[rw-1].race, taperFlag:!!(prog[rw-2]&&prog[rw-2].taper),
           othersRest:week.filter(s=>s.session).length };
});
check('Race day lands on the correct weekday', wk.onDay===wk.expected, JSON.stringify({on:wk.onDay,expected:wk.expected}));
check('Race week is flagged, and the week before is a taper', wk.raceFlag && wk.taperFlag, JSON.stringify(wk));
check('Race week is mostly rest (race + at most one opener)', wk.othersRest<=2, 'sessions in race week='+wk.othersRest);

// ── The plan header surfaces the race ───────────────────────────────────────
const ui=await page.evaluate(()=>{
  const rw=savedProgram.race.week;
  nav('plan',document.querySelectorAll('.nb')[2]);
  renderPlan(rw);          const raceHdr=document.getElementById('plan-vol').textContent;
  renderPlan(rw-1);        const taperHdr=document.getElementById('plan-vol').textContent;
  renderPlan(1);           const earlyHdr=document.getElementById('plan-vol').textContent;
  return { raceHdr, taperHdr, earlyHdr };
});
check('Race week header says RACE WEEK', /RACE WEEK/.test(ui.raceHdr), ui.raceHdr.slice(0,80));
check('The week before says Taper with a countdown', /Taper/.test(ui.taperHdr) && /race in \d+ days/i.test(ui.taperHdr), ui.taperHdr.slice(0,80));
check('Earlier weeks show the race date + countdown', /Race [A-Z][a-z]{2} \d+ \(\d+ days\)/.test(ui.earlyHdr), ui.earlyHdr.slice(0,80));

// ── No race set → behaves exactly as before ────────────────────────────────
const noRace=await page.evaluate(()=>{
  coachProfile={name:'C',goal:'fitness'}; localStorage.removeItem('ht-race-date');
  const p=buildAdaptiveWeek('endurance',6,{goal:'fitness'});
  return { weeks:p.weeks, race:p.race||null, hasRaceSess:!!(p.sessions||[]).find(s=>s.id==='race-day') };
});
check('With no race, the requested block length is honoured', noRace.weeks===6 && noRace.race===null && !noRace.hasRaceSess, JSON.stringify(noRace));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
