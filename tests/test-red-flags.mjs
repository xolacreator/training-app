
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
await page.reload({waitUntil:'load'}); await page.waitForTimeout(300);

const flags=(t)=>page.evaluate((t)=>detectRedFlags(t).map(f=>f.id), t);

check('Red-flag API exists', await page.evaluate(()=>typeof detectRedFlags==='function'));

// ── MUST fire ──────────────────────────────────────────────────────────────
const must=[
  ['I get chest pain when I run','chest_pain'],
  ['had some tightness in my chest last night','chest_pain'],
  ['felt pressure in my chest during the tempo','chest_pain'],
  ['I fainted after the session','fainting'],
  ['blacked out at the gym yesterday','fainting'],
  ['pain radiating down my left arm','referred_pain'],
  ['getting jaw pain on hard efforts','referred_pain'],
  ['heart racing while sitting at my desk','palpitations'],
  ['palpitations at rest most evenings','palpitations'],
  ['short of breath just lying in bed','breathless'],
  ['dizzy at rest all day today','dizziness'],
];
for(const [msg,id] of must){
  const got=await flags(msg);
  check(`FIRES: "${msg.slice(0,42)}"`, got.includes(id), got.join(',')||'none');
}

// ── MUST NOT fire — ordinary training talk ─────────────────────────────────
const mustNot=[
  'my legs are dead after that session',
  'chest day tomorrow, what should I do',
  'the chest press felt heavy today',
  'that workout killed me',
  'I was breathless on the last rep',
  'felt a bit dizzy after the intervals',
  'short of breath climbing the last hill',
  'passed out asleep on the couch after my long run',
  'dead legs all week',
  'leg day wrecked me',
  'my heart was pounding during the sprint',
  'I am dying to race again',
];
for(const msg of mustNot){
  const got=await flags(msg);
  check(`QUIET: "${msg.slice(0,42)}"`, got.length===0, got.join(',')||'ok');
}

// ── Exertional vs at-rest is the discriminator ─────────────────────────────
check('Breathless DURING exercise is not flagged', (await flags('breathless during the intervals')).length===0);
check('Breathless AT REST is flagged', (await flags('breathless sitting at my desk')).includes('breathless'));
check('An exclusion cannot mask a genuine symptom in the same message',
  (await flags('chest day yesterday, but I had chest pain lying in bed after')).includes('chest_pain'));

// ── The model is NEVER called ──────────────────────────────────────────────
const intercept=await page.evaluate(async()=>{
  window.__apiCalls=0;
  const realFetch=window.fetch;
  window.fetch=(...a)=>{ window.__apiCalls++; return realFetch(...a); };
  coachMessages.length=0;
  document.getElementById('coach-input').value='I get chest pain when I run';
  await sendCoachMessage();
  window.fetch=realFetch;
  const last=coachMessages[coachMessages.length-1];
  return { calls:window.__apiCalls, role:last&&last.role, flagged:!!(last&&last.redFlag),
           text:(last&&last.text)||'', n:coachMessages.length };
});
check('No network call is made on a red flag', intercept.calls===0, 'calls='+intercept.calls);
check('The athlete gets an immediate answer', intercept.role==='assistant' && intercept.n===2);
check('The reply is marked as a red flag', intercept.flagged);
check('It says to stop training', /stop training/i.test(intercept.text), intercept.text.slice(0,60));
check('It directs to medical help', /medical help|emergency|doctor/i.test(intercept.text));
check('It does not pretend to coach through it', /not going to try|can'?t coach/i.test(intercept.text));
check('It states the plan was left alone', /not changed anything/i.test(intercept.text));

// ── It fires even with no API key configured ───────────────────────────────
check('Fires without an API key (before the key gate)', await page.evaluate(async()=>{
  localStorage.removeItem('ht-ai-key'); localStorage.removeItem('ht-openai-key');
  coachMessages.length=0;
  document.getElementById('coach-input').value='I fainted after my run yesterday';
  await sendCoachMessage();
  const last=coachMessages[coachMessages.length-1];
  return !!(last && last.redFlag && last.role==='assistant'); }));

// ── Nothing disables it ────────────────────────────────────────────────────
check('No setting suppresses the check', await page.evaluate(()=>{
  const src=String(detectRedFlags)+String(sendCoachMessage);
  return !/localStorage\.getItem\([^)]*(disable|skip|suppress|optout|opt_out)/i.test(src); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
