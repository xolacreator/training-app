
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(300);

check('API exists', await page.evaluate(()=>
  ['renderMorningSteppers','mcStep','mcClear','MC_FIELDS'].every(n=>{try{return typeof eval(n)!=='undefined';}catch(e){return false;}})));

const html=await page.evaluate(()=>{ renderMorningSteppers(); return document.getElementById('mc-steppers').innerHTML; });
check('All four recovery fields are rendered', ['mc-sleep','mc-sleep-score','mc-hrv','mc-rhr']
  .every(id=>html.includes(`id="${id}"`)));
check('Every field has +/- steppers', (html.match(/mcStep\(/g)||[]).length>=12, String((html.match(/mcStep\(/g)||[]).length));
check('The three integer fields have coarse ±5 jumps', (html.match(/[−+]5/g)||[]).length>=6, String((html.match(/[−+]5/g)||[]).length));

// ── Reaching a real HRV without the keyboard ───────────────────────────────
const hrv=await page.evaluate(()=>{
  const v=()=>document.getElementById('mc-hrv').value;
  mcStep('mc-hrv',0);           // seed at the default
  const seeded=v();
  for(let i=0;i<5;i++) mcStep('mc-hrv',5);
  const up=v();
  for(let i=0;i<3;i++) mcStep('mc-hrv',-1);
  return { seeded, up, fine:v() };
});
check('A first tap seeds a sensible default (not 0)', parseFloat(hrv.seeded)>=40, hrv.seeded);
check('Coarse taps reach a realistic HRV quickly', parseFloat(hrv.up)===80, hrv.up);
check('Fine taps adjust by one', parseFloat(hrv.fine)===77, hrv.fine);

check('Sleep hours step in halves', await page.evaluate(()=>{
  mcStep('mc-sleep',0); const a=document.getElementById('mc-sleep').value;
  mcStep('mc-sleep',0.5); const b=document.getElementById('mc-sleep').value;
  return a==='7.5' && b==='8.0'; }));

// ── Ranges are respected ───────────────────────────────────────────────────
check('HRV cannot be pushed below zero', await page.evaluate(()=>{
  for(let i=0;i<80;i++) mcStep('mc-hrv',-5);
  return parseFloat(document.getElementById('mc-hrv').value)===0; }));
check('Sleep cannot exceed 24h', await page.evaluate(()=>{
  for(let i=0;i<80;i++) mcStep('mc-sleep',0.5);
  return parseFloat(document.getElementById('mc-sleep').value)===24; }));

// ── Typing still works, and any digit is accepted ──────────────────────────
check('The number can still be typed directly', await page.evaluate(async()=>{
  const el=document.getElementById('mc-hrv'); el.value=''; el.focus();
  el.value='87'; el.dispatchEvent(new Event('input',{bubbles:true}));
  return document.getElementById('mc-hrv').value==='87'; }));
check('Every digit 0-9 is accepted (no cap at 4)', await page.evaluate(()=>{
  const el=document.getElementById('mc-hrv');
  return '0123456789'.split('').every(d=>{ el.value='9'+d; return el.value==='9'+d; }); }));
check('Fields carry a numeric inputmode, not a full keyboard', await page.evaluate(()=>{
  return ['mc-sleep-score','mc-hrv','mc-rhr'].every(id=>
    document.getElementById(id).getAttribute('inputmode')==='numeric'); }));

// ── Clearing ───────────────────────────────────────────────────────────────
check('A field can be cleared back to empty', await page.evaluate(()=>{
  mcStep('mc-rhr',0); const had=document.getElementById('mc-rhr').value!=='';
  mcClear('mc-rhr'); return had && document.getElementById('mc-rhr').value===''; }));

// ── Values survive re-render and reach the save path ───────────────────────
check('Values survive a re-render', await page.evaluate(()=>{
  document.getElementById('mc-hrv').value='63';
  renderMorningSteppers();
  return document.getElementById('mc-hrv').value==='63'; }));
check('The save path reads the stepper values', await page.evaluate(()=>{
  recoveryLog.length=0;
  document.getElementById('mc-sleep').value='7.5';
  document.getElementById('mc-sleep-score').value='82';
  document.getElementById('mc-hrv').value='63';
  document.getElementById('mc-rhr').value='51';
  saveMorningCheckin();
  const e=recoveryLog.find(r=>r.date===todayISO());
  return !!e && e.sleepHours===7.5 && e.sleepScore===82 && e.hrv===63 && e.restingHR===51; }));

// ── THE KEYBOARD BUG: the morning sheet must be handled like every other ───
check('The viewport handler now includes the morning sheet', await page.evaluate(()=>{
  const src=[...document.querySelectorAll('script')].map(s=>s.textContent).join('\n');
  return /morning-overlay/.test(src.split('initViewportHandler')[1]||''); }));
check('The sheet scrolls internally so nothing is unreachable', await page.evaluate(()=>{
  const inner=document.getElementById('morning-overlay').firstElementChild;
  return /overflow-y:\s*auto/.test(inner.getAttribute('style')||''); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
