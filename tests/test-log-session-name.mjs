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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});
await page.evaluate(()=>{ nav('log',document.querySelectorAll('.nb')[1]); setCat('run', document.querySelector('.cat-tab.run')); });

// The field is now an editable combobox (input + datalist), preloaded with presets.
const kind=await page.evaluate(()=>{ const el=document.getElementById('f-session'); const dl=document.getElementById('f-session-list');
  return { tag:el.tagName, list:el.getAttribute('list'), opts:dl?dl.options.length:0, def:el.value }; });
check('Session name is an editable input bound to a datalist', kind.tag==='INPUT' && kind.list==='f-session-list', JSON.stringify(kind));
check('Datalist is populated with category presets + defaults to the first', kind.opts>0 && !!kind.def, JSON.stringify(kind));

// A custom, typed-over name is saved verbatim.
const custom=await page.evaluate(()=>{ sessions.length=0; document.getElementById('f-session').value='Sunrise Hill Repeats'; saveSession(); return sessions[0] && sessions[0].session; });
check('A custom session name is saved as typed', custom==='Sunrise Hill Repeats', String(custom));

// A picked preset still works.
const preset=await page.evaluate(()=>{ nav('log',document.querySelectorAll('.nb')[1]); setCat('run', document.querySelector('.cat-tab.run')); sessions.length=0; document.getElementById('f-session').value='Tempo run'; saveSession(); return sessions[0] && sessions[0].session; });
check('A chosen preset name still saves', preset==='Tempo run', String(preset));

// Empty/whitespace name falls back rather than saving blank.
const blank=await page.evaluate(()=>{ nav('log',document.querySelectorAll('.nb')[1]); setCat('run', document.querySelector('.cat-tab.run')); sessions.length=0; document.getElementById('f-session').value='   '; saveSession(); return sessions[0] && sessions[0].session; });
check('Blank name falls back to a safe default', blank==='Session', String(blank));

// Switching category refreshes presets + default (still editable).
const swap=await page.evaluate(()=>{ setCat('strength', document.querySelector('.cat-tab.strength')); const el=document.getElementById('f-session'); const dl=document.getElementById('f-session-list'); return { def:el.value, first:dl.options[0]&&dl.options[0].value }; });
check('Switching category reloads the preset list + default', swap.def===swap.first && !!swap.def, JSON.stringify(swap));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
