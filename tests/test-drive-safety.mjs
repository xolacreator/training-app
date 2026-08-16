import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});

// Intercept the Drive upload so we can observe whether it is even attempted.
const setup=(n)=>page.evaluate((n)=>{
  window.__uploads=[];
  driveToken='fake-token';
  window.driveUpload=async(p)=>{ window.__uploads.push(p); return {}; };
  sessions=Array.from({length:n},(_,i)=>({gid:'g'+i,week:'1',day:'Mon',session:'Run',ts:Date.now()+i}));
  return sessions.length;
}, n);

await setup(0);
check('An empty session list is NEVER uploaded to Drive', await page.evaluate(async()=>{
  await syncToDrive(true); return window.__uploads.length===0; }));

await setup(0);
check('...not even on an explicit "Sync now"', await page.evaluate(async()=>{
  await syncToDrive(false); return window.__uploads.length===0; }));

await setup(25);
check('A populated list still uploads normally', await page.evaluate(async()=>{
  await syncToDrive(true);
  return window.__uploads.length===1 && window.__uploads[0].sessions.length===25; }));

check('The payload still carries custom plans and templates', await page.evaluate(()=>{
  const p=drivePayload(); return 'custom' in p && 'templates' in p && Array.isArray(p.sessions); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,2).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
