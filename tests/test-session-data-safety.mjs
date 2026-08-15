import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});

// A realistic history: months of logged sessions.
const REAL = JSON.stringify(Array.from({length:120},(_,i)=>({
  gid:'g'+i, week:String(1+(i%12)), day:'Mon', session:'Run', dist:'10', pace:'5:00',
  date:'2026-0'+(1+(i%9))+'-1'+(i%9), ts: 1750000000000 + i*86400000 })));

check('The sessions key is in BACKUP_KEYS now', await page.evaluate(()=>BACKUP_KEYS.includes('ht-v4')));
check('Rescue + corrupt keys ride along', await page.evaluate(()=>
  BACKUP_KEYS.includes('ht-v4-rescue') && BACKUP_KEYS.includes('ht-v4-corrupt')));

// ── A backup captures history as RAW storage, not just the in-memory array ──
const backup=await page.evaluate((REAL)=>{
  localStorage.setItem('ht-v4', REAL);
  const storage={}; BACKUP_KEYS.forEach(k=>{const v=localStorage.getItem(k); if(v!=null) storage[k]=v;});
  const parsed=JSON.parse(storage['ht-v4']||'[]');
  return { hasKey:!!storage['ht-v4'], n:parsed.length };
}, REAL);
check('A backup now contains the raw session history', backup.hasKey && backup.n===120, JSON.stringify(backup));

// ── The exact failure that lost the history: empty memory + populated store ──
const guard=await page.evaluate((REAL)=>{
  localStorage.setItem('ht-v4', REAL);
  sessions = [];                       // what a failed load leaves behind
  saveData();                          // previously: wrote [] over 120 sessions
  const after=JSON.parse(localStorage.getItem('ht-v4')||'[]');
  return { kept:after.length, rescued:!!localStorage.getItem('ht-v4-rescue') };
}, REAL);
check('An empty array can no longer overwrite stored history', guard.kept===120, JSON.stringify(guard));
check('...and the store is snapshotted to a rescue key', guard.rescued);

// ── Seed data must not overwrite real history either ─────────────────────────
const seedGuard=await page.evaluate((REAL)=>{
  localStorage.setItem('ht-v4', REAL);
  localStorage.removeItem('ht-v4-rescue');
  sessions = [];
  saveData();
  return JSON.parse(localStorage.getItem('ht-v4')||'[]').length;
}, REAL);
check('Repeated empty saves never erode the store', seedGuard===120, String(seedGuard));

// ── A deliberate wipe is still possible, explicitly ──────────────────────────
check('An explicit force:true wipe still works', await page.evaluate((REAL)=>{
  localStorage.setItem('ht-v4', REAL);
  sessions=[]; saveData({force:true});
  return JSON.parse(localStorage.getItem('ht-v4')||'[]').length===0; }, REAL));

// ── Normal saves are unaffected ─────────────────────────────────────────────
check('A normal save with real sessions still writes', await page.evaluate(()=>{
  sessions=[{gid:'x',week:'1',day:'Mon',session:'Run',ts:Date.now()}];
  saveData();
  return JSON.parse(localStorage.getItem('ht-v4')||'[]').length===1; }));

// ── Corrupt stored data is preserved, not replaced with SEED ────────────────
const corrupt=await page.evaluate(()=>{
  localStorage.setItem('ht-v4','{"truncated":');     // unparseable
  localStorage.removeItem('ht-v4-corrupt');
  try{ load(); }catch(e){}
  return { raw:localStorage.getItem('ht-v4'),
           stash:localStorage.getItem('ht-v4-corrupt'),
           flagged:(typeof _sessionsLoadFailed!=='undefined')&&_sessionsLoadFailed };
});
check('Unparseable history is NOT replaced with seed data', corrupt.raw==='{"truncated":', String(corrupt.raw));
check('...it is copied to a recovery key', corrupt.stash==='{"truncated":');
check('...and the failure is flagged rather than swallowed', corrupt.flagged===true);
check('A later save cannot clobber the unreadable original', await page.evaluate(()=>{
  sessions=[]; saveData();
  return localStorage.getItem('ht-v4')==='{"truncated":'; }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart|truncated/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
