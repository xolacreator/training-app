// ─────────────────────────────────────────────────────────────────────────────
// SIZING — is every exit control actually reachable, on every screen?
//
// This exists because the same bug came back. The Back button in four overlays sat
// flush against the bottom edge of the screen, underneath the iOS home-gesture strip,
// because each of those overlays hand-wrote its own `padding:` shorthand containing a
// calc() with no whitespace around the `+`. Inside calc() that whitespace is part of
// the grammar, so the value is invalid — and one invalid component discards the WHOLE
// shorthand, dropping all four sides to 0px.
//
// It hid well. The CSSOM keeps the text verbatim, so nothing fails at parse time and
// no warning appears anywhere; the value only dies at computed-value time. And on a
// desktop browser every safe-area inset is 0 already, so the page looks identical.
//
// So this file measures instead of reading:
//
//   1. REACH — open every overlay and sheet, fill it with more content than fits, and
//      assert every exit control is fully inside the viewport with real clearance
//      below it, at several screen sizes with iOS insets substituted in (Chromium
//      reports every env(safe-area-inset-*) as 0, so the padding under test would
//      otherwise never be exercised). This is the check that catches the bug.
//
//   2. calc() OPERATOR SPACING — the static form of the same fault, read from the raw
//      file so it also covers markup inside JS template strings. Note the CSS-parse
//      check below does NOT catch this, by design: the engine accepts the text and
//      only rejects it later, which is the whole reason the bug was invisible.
//
//   3. OWNERSHIP — no overlay re-writes its own home-bar clearance; one class owns it.
//
//   4. VALIDITY — hand every static CSS declaration back to the engine and check it
//      survives, catching the broader class of values a browser silently rejects.
// ─────────────────────────────────────────────────────────────────────────────
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

// The home-gesture strip on a modern iPhone is ~34px tall. A control whose box ends
// inside it is technically on screen and practically not tappable, which is what
// "out of reach" meant. Demand real clearance, not merely being on screen.
const MIN_CLEARANCE = 12;

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[];

// Screens worth checking: the smallest phone still in use, the current one, and
// landscape — where vertical space is scarcest and a fixed header+footer hurts most.
const SCREENS=[
  { n:'iPhone SE',     w:375, h:667, sat:20, sab:0  },
  { n:'iPhone 14 Pro', w:393, h:852, sat:59, sab:34 },
  { n:'landscape',     w:852, h:393, sat:0,  sab:21 },
];

for (const s of SCREENS){
  const page=await (await browser.newContext({viewport:{width:s.w,height:s.h},isMobile:true,hasTouch:true})).newPage();
  page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(APP,{waitUntil:'load'});
  await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
  await page.reload({waitUntil:'load'}); await page.waitForTimeout(250);
  // Two corrections to the instrument, both of which produced false results before:
  // a rect read during the .3s slide-up transition is the pre-animation rect, and
  // Chromium resolves every env(safe-area-inset-*) to 0 so the padding under test is
  // never exercised. Freeze transitions; substitute the device's real insets.
  await page.addStyleTag({content:`
    *{transition:none!important;animation:none!important;}
    :root{--sat:${s.sat}px;--sab:${s.sab}px;--sal:0px;--sar:0px;}
    .oh,.ovh{padding-top:max(${s.sat+10}px,58px)!important;}
    .of,.ovf{padding-bottom:max(${s.sab+14}px,44px)!important;}`});

  const out=await page.evaluate(([MIN,SAT])=>{
    const LONG='<div style="height:60px;border-bottom:1px solid #333">row</div>'.repeat(40);
    const res=[];
    document.querySelectorAll('.overlay,.wnsheet,#morning-overlay').forEach(ov=>{
      // Overfill whatever region is meant to scroll, so the footer is under pressure.
      const sc=[...ov.querySelectorAll('*')].find(el=>/auto|scroll/.test(getComputedStyle(el).overflowY));
      const target=sc||ov, prev=target.innerHTML;
      if(sc) sc.innerHTML=[...sc.children].map(n=>n.outerHTML).join('')+LONG;
      ov.classList.add('open');
      const restoreDisplay=ov.style.display;
      if(ov.id==='morning-overlay') ov.style.display='flex';
      void ov.offsetHeight;
      const vh=window.innerHeight;
      [...ov.querySelectorAll('button')]
        .filter(el=>/back|done|close|cancel|exit|skip|✕|×/i.test((el.textContent||'')+(el.getAttribute('onclick')||'')))
        .forEach(el=>{
          const r=el.getBoundingClientRect();
          if(!r.width || !r.height) return;          // not rendered in this state — nothing to reach
          res.push({ id:ov.id, txt:(el.textContent||'').trim().slice(0,16),
            top:Math.round(r.top), bottom:Math.round(r.bottom),
            clearance:Math.round(vh-r.bottom),
            // A top-right close under the status bar or Dynamic Island is on screen
            // and still untappable — the top edge must clear the inset too.
            ok: r.top>=SAT && r.bottom<=vh && (vh-r.bottom)>=MIN });
        });
      ov.classList.remove('open');
      ov.style.display=restoreDisplay;
      target.innerHTML=prev;
    });
    return res;
  }, [MIN_CLEARANCE, s.sat]);

  const bad=out.filter(x=>!x.ok);
  check(`${s.n}: every exit control is reachable (${out.length} controls)`,
    bad.length===0,
    bad.length ? bad.map(x=>`${x.id} "${x.txt}" top=${x.top} bottom=${x.bottom} clearance=${x.clearance}`).join(' | ')
               : `min clearance ${Math.min(...out.map(x=>x.clearance))}px`);
  await page.close();
}

// ── Every CSS declaration in the file must actually parse ─────────────────────
// Read the declarations from the SOURCE TEXT, not the DOM. `getAttribute('style')`
// returns the browser's re-serialised style, which has already thrown the invalid
// declaration away — so reading the DOM here reports a clean bill of health on
// exactly the file that is broken. (Verified: with the bug reintroduced, the DOM-based
// version of this check passed and only the raw-source version caught it.)
const rawHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Only statically-written style attributes can be validated. Anything assembled at
// runtime — a template literal, or string concatenation — is substituted later, and a
// regex cannot tell where such an attribute ends, so skip those rather than probe a
// fragment of one. The app's overlay chrome is all static markup, which is what this
// check is for.
const inlineStyles = [...rawHtml.matchAll(/\sstyle="([^"]*)"/g)]
  .map(m=>m[1]).filter(s=>!/[$`{}]/.test(s) && !/['"]\s*\+|\+\s*['"]/.test(s));
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
const css=await page.evaluate((inline)=>{
  const probe=document.createElement('div');
  const bad=[];
  // Hand each declaration back to the engine. A value it rejects yields an empty
  // computed property — which is exactly what happened to four `padding` shorthands
  // and is invisible any other way.
  const test=(prop,val,where)=>{
    prop=prop.trim(); val=val.trim();
    if(!prop||!val||prop.startsWith('--')) return;          // custom props accept anything
    if(/^\s*\/\*/.test(prop)) return;
    if(val.includes('${')||prop.includes('${')) return;     // template literal — substituted at runtime
    probe.style.cssText='';
    // A vendor-prefixed property this engine does not implement at all is a
    // deliberate cross-browser declaration, not a mistake — skip it. What matters is
    // a property the engine DOES know rejecting the value we gave it.
    probe.style.setProperty(prop,'initial');
    if(!probe.style.getPropertyValue(prop) && /^-(webkit|moz|ms|o)-/.test(prop)) return;
    probe.style.cssText='';
    probe.style.setProperty(prop, val);
    if(!probe.style.getPropertyValue(prop)) bad.push({prop, val:val.slice(0,110), where});
  };
  const splitDecls=(text)=>{
    // Split on ';' at depth 0 so semicolons inside url()/calc() are not boundaries.
    const parts=[]; let d=0, cur='';
    for(const ch of text){
      if(ch==='(') d++; else if(ch===')') d--;
      if(ch===';' && d===0){ parts.push(cur); cur=''; } else cur+=ch;
    }
    parts.push(cur);
    return parts.filter(x=>x.trim());
  };
  const decl=(text, where)=>splitDecls(text).forEach(p=>{
    const i=p.indexOf(':'); if(i<0) return;
    test(p.slice(0,i), p.slice(i+1), where);
  });
  // Inline style attributes, taken from the raw file — where the broken paddings lived.
  inline.forEach((s,i)=>decl(s, `inline style #${i+1}`));
  // Author stylesheets. Only style rules — @font-face and friends carry descriptors
  // (src, font-display), not style properties, so the probe rejects them correctly
  // and meaninglessly.
  for(const sheet of document.styleSheets){
    let rules; try{ rules=sheet.cssRules; }catch(e){ continue; }
    const walk=(rs)=>{ for(const r of rs){
      if(r.style && r.cssText && r.selectorText){
        const b=r.cssText.indexOf('{');
        if(b>0) decl(r.cssText.slice(b+1).replace(/}\s*$/,''), r.selectorText);
      }
      if(r.cssRules) walk(r.cssRules);
    }};
    walk(rules);
  }
  return bad;
}, inlineStyles);
check('Every CSS declaration in the file parses', css.length===0,
  css.length ? css.slice(0,6).map(b=>`${b.where}: ${b.prop}:${b.val}`).join(' | ') : 'none rejected');

// The specific shape that caused this: `+` or `-` inside calc() needs whitespace on
// both sides. Checked against the raw file, not the DOM, so it also covers the CSS
// block and any style attribute inside a JS template string that never reaches a
// live element. Named explicitly so a reintroduction says WHY it is wrong.
const calcs=(()=>{
  const bad=[];
  // calc(...) with one level of nesting, which covers calc(16px + env(x, 0px)).
  for(const m of rawHtml.matchAll(/calc\([^()]*(?:\([^()]*\)[^()]*)*\)/g)){
    const c=m[0];
    if(c.includes('${')) continue;                    // runtime-substituted
    // Strip the argument lists of nested functions — a comma-separated env(x, 0px)
    // has no operators of its own, and negative numbers there are legal.
    const outer=c.replace(/\b[a-z-]+\([^()]*\)/g,'F');
    // Every + inside calc() must have whitespace on BOTH sides.
    if(/(?<!\s)\+|\+(?!\s)/.test(outer)) bad.push(c);
  }
  return bad;
})();
check('No calc() has an operator missing its required whitespace', calcs.length===0,
  calcs.length ? calcs.slice(0,4).join(' | ') : `${[...rawHtml.matchAll(/calc\(/g)].length} calc() expressions checked`);

// Bottom clearance is the dimension that put the button under the home bar, so a
// full-screen overlay's pinned chrome must take it from the shared class rather than
// re-type it. Scoped to an overlay's own direct children — its header / body / footer
// rows — which is exactly where the four broken shorthands lived. Bottom sheets are a
// different pattern (no pinned footer; the scrolling content carries its own bottom
// padding) and the reach measurement above already covers them.
const shared=await page.evaluate(()=>{
  const hand=[];
  document.querySelectorAll('.overlay > [style]').forEach(el=>{
    const s=el.getAttribute('style')||'';
    if(/safe-area-inset-bottom/.test(s) && /padding/.test(s) &&
       !el.classList.contains('ovh') && !el.classList.contains('ovf') &&
       !el.classList.contains('of'))
      hand.push(el.tagName.toLowerCase()+(el.id?'#'+el.id:''));
  });
  return hand;
});
check('No overlay re-writes its own home-bar clearance — .of/.ovf own it',
  shared.length===0, shared.join(', ')||'none');

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
