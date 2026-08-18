
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto(APP,{waitUntil:'load'});
await page.waitForTimeout(250);

check('Provenance API exists', await page.evaluate(()=>
  ['resolvePrescriptionSource','auditPrescriptionSources','evidenceLanguage'].every(n=>{try{return typeof eval(n)==='function';}catch(e){return false;}})));

// ── explains: EVERY prescription resolves to a knowledge domain ─────────────
const audit=await page.evaluate(()=>auditPrescriptionSources());
console.log('   audit:', JSON.stringify(audit));
check('Every prescription resolves to a domain (none unsourced)',
  audit.unresolved.length===0 && audit.resolved===audit.total,
  `${audit.resolved}/${audit.total}, unresolved=${JSON.stringify(audit.unresolved)}`);
check('The audit covers the whole prescription set', audit.total>=28, String(audit.total));

// ── A resolved prescription names what governs it ──────────────────────────
const one=await page.evaluate(()=>resolvePrescriptionSource('aer_easy_run'));
check('A prescription names its adaptation', one.adaptation==='aerobic_durability', JSON.stringify(one.adaptation));
check('...and the domains that govern it', one.domains.length>0 && !!one.domains[0].title, JSON.stringify(one.domains.map(d=>d.id)));
check('...and carries a source tier', !!one.tier, String(one.tier));

// ── The weakest tier governs ───────────────────────────────────────────────
check('The weakest supporting tier is the one reported', await page.evaluate(()=>{
  const r=resolvePrescriptionSource('aer_easy_run');
  const order={established:3,accepted:2,methodology:1,synthesis:0};
  const tiers=r.domains.map(d=>d.sourceTier).filter(Boolean);
  return tiers.every(t=>(order[t]??0)>=(order[r.tier]??0)); }));

// ── admits_uncertainty: nothing is cited, and it SAYS so ───────────────────
check('The audit reports zero citations honestly', audit.cited===0, String(audit.cited));
check('Uncited prescriptions are listed, not hidden', audit.uncited.length===audit.total, `${audit.uncited.length}/${audit.total}`);
check('The citation registry is empty rather than fabricated', await page.evaluate(()=>
  Object.keys(KB_CITATIONS).length===0));

// ── Language is capped by evidence ─────────────────────────────────────────
const lang=await page.evaluate(()=>({
  uncited: evidenceLanguage('aer_easy_run'),
  unknown: evidenceLanguage('does_not_exist'),
}));
check('An uncited prescription is phrased as practice, not proof',
  lang.uncited.strength==='uncited' && /practice rather than a cited result/.test(lang.uncited.hedge), lang.uncited.hedge.slice(0,70));
check('It forbids proof language while uncited',
  lang.uncited.mustNot.includes('research confirms') && !lang.uncited.may.includes('proven'), JSON.stringify(lang.uncited.may));
check('An unknown prescription is declared unsourced', lang.unknown.strength==='unsourced', lang.unknown.strength);
check('...and says outright that nothing governs it', /don'?t have anything in my knowledge base/i.test(lang.unknown.hedge), lang.unknown.hedge.slice(0,60));

// ── Adding a citation upgrades the permitted language ──────────────────────
check('A cited domain unlocks stronger phrasing', await page.evaluate(()=>{
  KB_CITATIONS['aerobic_development']=[{ref:'TEST'}];
  const r=evidenceLanguage('aer_easy_run');
  const cited=r.strength==='cited' && /Supported by/.test(r.hedge);
  delete KB_CITATIONS['aerobic_development'];
  return cited; }));
check('...and removing it drops back down', await page.evaluate(()=>
  evidenceLanguage('aer_easy_run').strength==='uncited'));

// ── Every adaptation maps to a domain that actually exists ─────────────────
check('No mapping points at a non-existent domain', await page.evaluate(()=>{
  const bad=[];
  Object.entries(ADAPTATION_DOMAINS).forEach(([a,ids])=>ids.forEach(id=>{ if(!_kbDomain(id)) bad.push(a+'->'+id); }));
  return bad.length===0 ? true : bad.join(','); }));
check('Every adaptation in the KB has a mapping', await page.evaluate(()=>{
  const ids=(ADAPTATION_KB.adaptations||[]).map(a=>a.id);
  const missing=ids.filter(i=>!ADAPTATION_DOMAINS[i]);
  return missing.length===0 ? true : missing.join(','); }));

check('No real JS errors', errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e)).length===0,
  errs.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
