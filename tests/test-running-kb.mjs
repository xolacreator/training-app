import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);

// Library integrity
const kb = await page.evaluate(()=>{
  const k=RUNNING_KB; const tiers=new Set(['established','accepted','methodology','synthesis']);
  const ids=new Set(k.domains.map(d=>d.id));
  const fields=['coreConcepts','adaptations','programming','progression','recovery','contraindications','relatedTo'];
  return {
    count:k.domains.length, version:k.version,
    allHaveSchema: k.domains.every(d=>d.id&&d.title&&d.sourceTier&&d.summary&&fields.every(f=>Array.isArray(d[f])&&d[f].length>=0)),
    allTiersValid: k.domains.every(d=>tiers.has(d.sourceTier)),
    relatedValid: k.domains.every(d=>(d.relatedTo||[]).every(r=>ids.has(r))),
    hasPhilosophy: k.philosophy?.sourceTier==='synthesis',
    domainIds: k.domains.map(d=>d.id),
  };
});
const REQUIRED = ['exercise_physiology','energy_systems','aerobic_development','lactate_threshold','vo2max','running_economy','speed_development','long_runs','race_specific','concurrent_training','recovery_science','biomechanics','injury_prevention','treadmill_training','track_training','trail_running','hyrox_running','deka_running'];
check('18 domains present', kb.count===18, `got ${kb.count}`);
check('All 18 required domains present', REQUIRED.every(id=>kb.domainIds.includes(id)), JSON.stringify(REQUIRED.filter(id=>!kb.domainIds.includes(id))));
check('Every domain has the full schema (7 array fields + meta)', kb.allHaveSchema);
check('All source tiers valid', kb.allTiersValid);
check('All relatedTo references resolve to real domains', kb.relatedValid);
check('Coach EV synthesis philosophy present + labelled', kb.hasPhilosophy);

// Query helpers
const q = await page.evaluate(()=>({
  vo2: runningDomain('vo2max'),
  missing: runningDomain('nope'),
  forEndurance: _runningDomainsForType('endurance'),
}));
check('runningDomain(vo2max) returns full domain', q.vo2 && q.vo2.adaptations.length>0 && q.vo2.sourceTier==='methodology', JSON.stringify(q.vo2?.title));
check('runningDomain(unknown) → null', q.missing===null);

// Engine consults the KB: endurance prompt now includes running KB domains + tiers
const ctxEnd = await page.evaluate(()=>getKnowledgeContext('endurance'));
check('Endurance context includes Lactate Threshold + VO₂max from KB', /Lactate Threshold/.test(ctxEnd)&&/VO₂max/.test(ctxEnd), '');
check('Context shows source tiers (e.g. [methodology])', /\[methodology\]|\[established\]|\[accepted\]/.test(ctxEnd), '');
const ctxStr = await page.evaluate(()=>getKnowledgeContext('strength'));
check('Strength context does NOT pull running domains', !/Lactate Threshold/.test(ctxStr));
const ctxHyb = await page.evaluate(()=>getKnowledgeContext('hybrid'));
check('Hybrid context includes concurrent training + HYROX running', /Concurrent Training/.test(ctxHyb)&&/HYROX Running/.test(ctxHyb), '');

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
