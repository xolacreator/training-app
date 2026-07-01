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

// Every category has a complete fatigue vector
const cov = await page.evaluate(()=> TRAINING_CATEGORIES.every(c => {
  const v = Fatigue.category(c.id);
  return v && ['mechanical','metabolic','neurological','connective','recoveryHours'].every(k=>typeof v[k]==='number');
}));
check('Every category has a complete fatigue vector', cov===true);

// Relative ordering sanity: track (VO2) more metabolic than easy run; strength more neuro than easy run
const ord = await page.evaluate(()=>({
  trackMetab:Fatigue.category('track').metabolic, easyMetab:Fatigue.category('easy-run').metabolic,
  strNeuro:Fatigue.category('strength').neurological, easyNeuro:Fatigue.category('easy-run').neurological,
  longConn:Fatigue.category('long-run').connective, recoveryScore:Fatigue.score(Fatigue.category('recovery')),
}));
check('Track > easy run metabolically', ord.trackMetab>ord.easyMetab, JSON.stringify(ord));
check('Strength > easy run neurologically', ord.strNeuro>ord.easyNeuro);
check('Long run high connective; recovery ~zero load', ord.longConn>=6 && ord.recoveryScore===0);

// Fitstop session loads: LIFT strength-biased, PERFORM/CONDITION metabolic-biased
const fs = await page.evaluate(()=>({
  liftBase:Fatigue.fitstopLoad('LIFT','BASE'), liftPeak:Fatigue.fitstopLoad('LIFT','PEAK'),
  perform:Fatigue.fitstopLoad('PERFORM'), condition:Fatigue.fitstopLoad('CONDITION'),
}));
check('LIFT is strength-biased (strengthStimulus high)', fs.liftBase.strengthStimulus>=7, JSON.stringify(fs.liftBase));
check('PERFORM/CONDITION are metabolic-biased', fs.perform.metabolic>=7 && fs.condition.metabolic>=8);
check('PEAK LIFT > BASE LIFT in neuro/mechanical/recovery (1RM intensifies)',
  fs.liftPeak.neuro>fs.liftBase.neuro && fs.liftPeak.mechanical>fs.liftBase.mechanical && fs.liftPeak.recoveryHours>fs.liftBase.recoveryHours,
  JSON.stringify({base:[fs.liftBase.neuro,fs.liftBase.mechanical],peak:[fs.liftPeak.neuro,fs.liftPeak.mechanical]}));

// sessionFatigue maps program sessions correctly
const sf = await page.evaluate(()=>({
  easy:Fatigue.score(Fatigue.sessionFatigue({type:'endurance',runType:'easy'})),
  intervals:Fatigue.score(Fatigue.sessionFatigue({type:'endurance',runType:'intervals'})),
  lift:Fatigue.score(Fatigue.sessionFatigue({type:'strength'})),
  fitstopLiftPeak:Fatigue.score(Fatigue.sessionFatigue({type:'fitstop',name:'LIFT'},'PEAK')),
  rest:Fatigue.score(Fatigue.sessionFatigue(null)),
  isHighIntervals:Fatigue.isHigh(Fatigue.sessionFatigue({type:'endurance',runType:'intervals'})),
  isHighEasy:Fatigue.isHigh(Fatigue.sessionFatigue({type:'endurance',runType:'easy'})),
}));
check('Intervals far more taxing than easy run', sf.intervals>sf.easy+8, JSON.stringify(sf));
check('Rest = 0 load', sf.rest===0);
check('isHigh flags intervals, not easy', sf.isHighIntervals===true && sf.isHighEasy===false, JSON.stringify({i:sf.isHighIntervals,e:sf.isHighEasy}));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
