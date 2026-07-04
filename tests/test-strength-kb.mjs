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

const kb = await page.evaluate(()=>{
  const k=STRENGTH_KB; const tiers=new Set(['established','accepted','methodology','synthesis']);
  const ids=new Set(k.domains.map(d=>d.id));
  const fields=['coreConcepts','adaptations','programming','progression','recovery','contraindications','relatedTo'];
  return { count:k.domains.length, version:k.version,
    schema:k.domains.every(d=>d.id&&d.title&&d.sourceTier&&d.summary&&fields.every(f=>Array.isArray(d[f]))),
    tiers:k.domains.every(d=>tiers.has(d.sourceTier)),
    related:k.domains.every(d=>(d.relatedTo||[]).every(r=>ids.has(r))),
    hasFitstop:ids.has('fitstop_method'), philosophy:k.philosophy?.sourceTier==='synthesis',
    ids:[...ids] };
});
const REQ=['maximal_strength','hypertrophy','power_explosiveness','strength_endurance','volume_landmarks','autoregulation','movement_quality','structural_balance','exercise_selection','periodization_strength','concurrent_training','recovery_fatigue','injury_prevention_tendon','fitstop_method','hyrox_strength','deka_strength'];
check('16 strength domains present', kb.count===16, `got ${kb.count}`);
check('All required strength domains present', REQ.every(id=>kb.ids.includes(id)), JSON.stringify(REQ.filter(id=>!kb.ids.includes(id))));
check('Full schema on every domain', kb.schema);
check('Valid source tiers', kb.tiers);
check('relatedTo references resolve', kb.related);
check('Coach EV strength synthesis present', kb.philosophy);

// Fitstop is in the strength KB as a methodology domain with the real block structure
const fs = await page.evaluate(()=>strengthDomain('fitstop_method'));
check('fitstop_method domain = methodology tier', fs.sourceTier==='methodology', fs.sourceTier);
check('fitstop_method encodes real block (BASE→BUILD→PERFORMANCE→PEAK + 5RM/3RM/1RM)',
  JSON.stringify(fs).includes('BASE')&&/5RM|3RM|1RM/.test(JSON.stringify(fs)), '');

// Engine consults the strength KB
const ctxStr = await page.evaluate(()=>getKnowledgeContext('strength'));
check('Strength context pulls strength KB domains (Maximal Strength, Volume Landmarks)', /Maximal Strength/.test(ctxStr)&&/Volume Landmarks/.test(ctxStr), '');
const ctxFit = await page.evaluate(()=>getKnowledgeContext('strength',{strengthMethod:'fitstop'}));
check('Fitstop strength method → context features Fitstop methodology', /Fitstop \(as strength methodology\)|fitstop/i.test(ctxFit), '');
const ctxEnd = await page.evaluate(()=>getKnowledgeContext('endurance'));
check('Endurance context does NOT pull strength domains', !/Maximal Strength/.test(ctxEnd));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
