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

// The log form now has a date input, not a hardcoded week dropdown
const hasDate = await page.evaluate(()=>!!document.getElementById('f-date') && !document.getElementById('f-week'));
check('Log form has a date picker (no hardcoded week dropdown)', hasDate);

// Date defaults to today, day auto-syncs
const dflt = await page.evaluate(()=>({date:document.getElementById('f-date').value, day:document.getElementById('f-day').value}));
check('Date defaults to today', !!dflt.date && /^\d{4}-\d{2}-\d{2}$/.test(dflt.date), dflt.date);

// Pick an ARBITRARY date (not in any plan) → day derives, session attaches to that date
const arbitrary='2027-03-17'; // a Wednesday
await page.evaluate((d)=>{ nav('log',document.querySelectorAll('.nb')[1]); document.getElementById('f-date').value=d; _syncLogDay(); setCat('run',document.querySelector('.cat-tab.run')); document.getElementById('f-session').innerHTML='<option>Easy Run</option>'; feel=4; }, arbitrary);
const dayShown = await page.evaluate(()=>document.getElementById('f-day').value);
check('Day auto-derives from chosen date (2027-03-17 = Wednesday)', dayShown==='Wednesday', dayShown);
await page.evaluate(()=>saveSession());
await page.waitForTimeout(200);
const saved = await page.evaluate(()=>sessions[0]);
check('Saved session carries the chosen date', saved.date==='2027-03-17', JSON.stringify(saved.date));
check('Saved ts matches the chosen date (not now)', new Date(saved.ts).toISOString().slice(0,10)==='2027-03-17', new Date(saved.ts).toISOString().slice(0,10));
check('Saved day = Wednesday', saved.day==='Wednesday', saved.day);

// A second arbitrary past date works too (free-form, any date)
await page.evaluate(()=>{ nav('log',document.querySelectorAll('.nb')[1]); document.getElementById('f-date').value='2025-12-25'; _syncLogDay(); setCat('run',document.querySelector('.cat-tab.run')); document.getElementById('f-session').innerHTML='<option>Long Run</option>'; feel=4; saveSession(); });
await page.waitForTimeout(150);
const saved2 = await page.evaluate(()=>sessions[0]);
check('Can log to any date incl. past (2025-12-25 = Thursday)', saved2.date==='2025-12-25'&&saved2.day==='Thursday', JSON.stringify({d:saved2.date,day:saved2.day}));

// With an active program, the week derives from the date (program week mapping)
await page.evaluate(()=>{ openProgramOverlay(); loadFitstopBlockC(); closeOv('program-overlay'); });
await page.waitForTimeout(200);
const progWeekForDate = await page.evaluate(()=>{ document.getElementById('f-date').value='2026-06-22'; _syncLogDay(); setCat('run',document.querySelector('.cat-tab.run')); document.getElementById('f-session').innerHTML='<option>Easy</option>'; feel=4; saveSession(); return sessions[0].week; });
check('With program active, week derives from date (22 Jun = block week 1)', progWeekForDate==='1', `got ${progWeekForDate}`);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
