import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { readFileSync } from 'node:fs';
const SRC = new URL('../index.html', import.meta.url).pathname;
const HTML = readFileSync(SRC,'utf8');
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});

// Serve the SAME file under different hostnames so the guard is exercised for real
// rather than by stubbing location.hostname.
const ctx=await browser.newContext({viewport:{width:393,height:852}});
const errs=[];
await ctx.route('**/*', route=>{
  const u=route.request().url();
  if(/\/(index\.html)?$/.test(new URL(u).pathname) || new URL(u).pathname==='/training-app/')
    return route.fulfill({status:200, contentType:'text/html', body:HTML});
  return route.fulfill({status:200, contentType:'text/plain', body:''});
});
const page=await ctx.newPage();
page.on('pageerror',e=>errs.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

const load=async(url)=>{
  await page.goto(url,{waitUntil:'load'});
  await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
  await page.waitForTimeout(250);
  return page.evaluate(()=>{ try{ renderStaleOriginBanner(); }catch(e){}
    return { host:location.hostname,
             stale:(typeof isStaleOrigin==='function')?isStaleOrigin():'NOFN',
             html:document.getElementById('stale-origin-banner').innerHTML,
             appPad:(document.getElementById('app')||{style:{}}).style.paddingTop||'' }; });
};

// ── The dead origin announces itself ────────────────────────────────────────
const dead=await load('https://bruces6.github.io/training-app/');
check('Guard API exists', dead.stale!=='NOFN');
check('The old origin is recognised as stale', dead.stale===true, dead.host);
check('It shows a banner instead of silently serving an old build', /no longer updated/i.test(dead.html), dead.html.slice(0,70));
check('It names the new host', /xolacreator\.github\.io/.test(dead.html));
check('It warns that data does NOT come with you', /does not move with you/i.test(dead.html));
check('Export is offered FIRST (data is stranded on this origin)',
  dead.html.indexOf('Export my data') < dead.html.indexOf('Open the new app'), 'order');
check('Export button calls the real export path', /onclick="exportData\(\)"/.test(dead.html));
check('The link points at the live app URL', /https:\/\/xolacreator\.github\.io\/training-app\//.test(dead.html));
check('The banner does not cover the app header', /^\d+px$/.test(dead.appPad), dead.appPad);

// ── The live origin says nothing ────────────────────────────────────────────
const live=await load('https://xolacreator.github.io/training-app/');
check('The live origin is not flagged', live.stale===false, live.host);
check('No banner on the live origin (no false alarm)', live.html.trim()==='', JSON.stringify(live.html.slice(0,40)));

// ── Local/dev and unrelated hosts are not flagged ───────────────────────────
const other=await load('https://example.com/training-app/');
check('An unrelated host is not flagged', other.stale===false && other.html.trim()==='', other.host);

// The stubbed router serves an empty sw.js, so service-worker registration fails
// here. That is an artifact of this harness, not of the app.
check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart|fetching the script/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
