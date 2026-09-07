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
  const k=STRENGTH_KB; const tiers=new Set(['established','accepted','methodology','synthesis','athlete-program']);
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
// This used to assert sourceTier==='methodology' — the test encoded the bug. One
// gym's programme for one athlete is not a methodology; holding it at that tier put
// a personal program in the knowledge layer, where the coach could present it to any
// athlete as what strength training should look like.
check('The Fitstop schedule is NOT held as methodology', fs.sourceTier!=='methodology', fs.sourceTier);
check('...it is tiered as one athlete\'s program', fs.sourceTier==='athlete-program', fs.sourceTier);
check('...marked uncitable and unverified', fs.citable===false && fs.verified===false,
  `citable=${fs.citable} verified=${fs.verified}`);
check('...and says plainly it must not be cited or shown as doctrine',
  (fs.contraindications||[]).some(c=>/citing this as evidence/i.test(c)) &&
  (fs.contraindications||[]).some(c=>/what training should look like/i.test(c)),
  (fs.contraindications||[])[0]);
check('...warns that running volume cannot be inferred from attendance',
  (fs.contraindications||[]).some(c=>/inferring running volume/i.test(c)));
check('...and that the 2 km time trial is not a run test',
  (fs.contraindications||[]).some(c=>/not run/i.test(c)));
// It used to assert the block's phase/RM progression as encoded knowledge. That was
// the same category error one level down: a 12-week BASE→PEAK arc with 5RM/3RM/1RM
// waves was asserted from one block, and the athlete's actual supplied weeks turn out
// to be a 1RM testing wave that does not match it. The domain now claims only the
// day-type shape, which is all a scheduler needs and all that is actually known.
check('It claims only the class SHAPE, not a progression it cannot know',
  /PERFORM/.test(JSON.stringify(fs)) && /LIFT/.test(JSON.stringify(fs)) &&
  !/5RM/.test(JSON.stringify(fs)), '');
check('...and says the sample is a testing wave, not the whole year',
  /not representative/i.test(JSON.stringify(fs)));
check('...and refuses to assert a progression',
  (fs.progression||[]).some(x=>/only the supplied weeks are known/i.test(x)),
  (fs.progression||[])[0]);

// Engine consults the strength KB
const ctxStr = await page.evaluate(()=>getKnowledgeContext('strength'));
check('Strength context pulls strength KB domains (Maximal Strength, Volume Landmarks)', /Maximal Strength/.test(ctxStr)&&/Volume Landmarks/.test(ctxStr), '');
const ctxFit = await page.evaluate(()=>getKnowledgeContext('strength',{strengthMethod:'fitstop'}));
check('Fitstop strength method → context includes the class schedule', /fitstop/i.test(ctxFit), '');
check('...but never calls it a methodology', !/as strength methodology/i.test(ctxFit), '');
const ctxEnd = await page.evaluate(()=>getKnowledgeContext('endurance'));
check('Endurance context does NOT pull strength domains', !/Maximal Strength/.test(ctxEnd));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
