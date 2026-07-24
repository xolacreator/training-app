import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'node:url';
const APP = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
const results=[]; const check=(n,c,d='')=>{results.push({n,c:!!c});console.log(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await browser.newContext({viewport:{width:420,height:900}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto(APP,{waitUntil:'load'});
await page.evaluate(()=>{localStorage.setItem('ht-onboarded','true');sessionStorage.setItem('mc-shown','1');});
await page.reload({waitUntil:'load'}); await page.waitForTimeout(400);

check('Overlay API exists', await page.evaluate(()=>typeof _drawWorkoutOverlay==='function' && typeof _overlayData==='function'));

// Interval session (6 splits) → the "detailed" data
const D=await page.evaluate(()=>{
  const t=[194,189,187,185,183,178],h=[158,163,166,169,172,176],sp=[];
  for(let i=0;i<6;i++) sp.push({distance:800,moving_time:t[i],average_speed:800/t[i],average_heartrate:h[i]});
  const s={session:'Tempo Intervals',dist:'14.2',dur:'58',hr:'162',cad:182,ts:Date.parse('2026-07-11T09:00:00'),notes:'6x800m @ 5K pace - negative split.',strava_splits:sp};
  return _overlayData(s);
});
const paceStat=D.stats.find(s=>s.key==='pace');
check('Per-interval rows carry dist/time/pace/HR', D.reps.length===6 && D.reps.every(r=>r.dist&&r.time&&r.pace&&r.hr), JSON.stringify(D.reps[0]));
check('Pace uses a single unit slash (no //)', D.reps.every(r=>/^\d+:\d\d\/(km|mi)$/.test(r.pace)) && /\/(km|mi)$/.test(paceStat.val) && !/\/\//.test(paceStat.val), D.reps[0].pace+' · '+paceStat.val);
check('Cadence included when recorded', D.stats.some(s=>s.key==='cadence' && s.val==='182'));
check('Copy is hyphenated (no em dash)', !/[—–]/.test(D.coach) && !/[—–]/.test(D.eyebrow));
check('Headline exposes distance + duration options', D.headline.distance.val==='14.2' && D.headline.distance.unit==='km' && !!D.headline.duration, JSON.stringify(D.headline));
check('has.intervals true for a split session', D.has.intervals===true);

// ── À-la-carte options: headline metric + per-block toggles ──────────────────
const gran=await page.evaluate(()=>{
  const t=[194,189,187,185,183,178],sp=[]; for(let i=0;i<6;i++) sp.push({distance:800,moving_time:t[i],average_speed:800/t[i],average_heartrate:160});
  const s={session:'Tempo',dist:'14.2',dur:'58',hr:'162',cad:182,ts:Date.now(),notes:'note',strava_splits:sp};
  const draw=(o)=>{const c=document.createElement('canvas');c.width=1080;c.height=1920;return _drawWorkoutOverlay(c.getContext('2d'),s,o);};
  const O=_overlayResolve({});
  return {
    resolveDefault:O,
    dropCadence: draw({stats:{cadence:false}}).blocks,   // toggle a stat off (still renders)
    ivOn: draw({intervals:true}).blocks.intervals,
    ivOff: draw({intervals:false}).blocks.intervals,
    coachOff: draw({coach:false}).blocks.coach,
  };
});
check('Default resolve = distance headline, stats on, coach on, intervals off', gran.resolveDefault.headline==='distance' && gran.resolveDefault.coach===true && gran.resolveDefault.intervals===false && gran.resolveDefault.stats.hr===true, JSON.stringify(gran.resolveDefault));
check('Toggling a stat off still renders (stats block present)', gran.dropCadence.stats===true);
check('Intervals block honours its toggle', gran.ivOn===true && gran.ivOff===false, JSON.stringify({on:gran.ivOn,off:gran.ivOff}));
check('Coach note honours its toggle', gran.coachOff===false);

// Presets gate the optional blocks
const blk=await page.evaluate(()=>{
  const t=[194,189,187,185,183,178],sp=[]; for(let i=0;i<6;i++) sp.push({distance:800,moving_time:t[i],average_speed:800/t[i],average_heartrate:160});
  const s={session:'Tempo',dist:'14.2',dur:'58',hr:'162',ts:Date.now(),notes:'note here',strava_splits:sp};
  const mk=(p)=>{const c=document.createElement('canvas');c.width=1080;c.height=1920;return _drawWorkoutOverlay(c.getContext('2d'),s,{preset:p}).blocks;};
  return { min:mk('minimal'), std:mk('standard'), det:mk('detailed') };
});
check('Minimal preset = stats only', blk.min.stats && !blk.min.intervals && !blk.min.coach, JSON.stringify(blk.min));
check('Standard preset adds the coach note', blk.std.coach && !blk.std.intervals, JSON.stringify(blk.std));
check('Detailed preset adds the interval table', blk.det.intervals && blk.det.coach, JSON.stringify(blk.det));

// Transparency: the middle stays open; content is drawn
const tp=await page.evaluate(()=>{
  const t=[194,189,187,185,183,178],sp=[]; for(let i=0;i<6;i++) sp.push({distance:800,moving_time:t[i],average_speed:800/t[i],average_heartrate:160});
  const s={session:'Tempo',dist:'14.2',dur:'58',hr:'162',cad:182,ts:Date.now(),notes:'n',strava_splits:sp};
  const c=document.createElement('canvas');c.width=1080;c.height=1920;const x=c.getContext('2d');
  _drawWorkoutOverlay(x,s,{preset:'detailed'});
  const mid=x.getImageData(c.width/2,c.height*0.42,1,1).data[3];
  const img=x.getImageData(0,0,c.width,c.height).data; let op=0,tr=0;
  for(let i=3;i<img.length;i+=4*997){ if(img[i]>230)op++; else if(img[i]<10)tr++; }
  return {mid, op, tr};
});
check('Middle is transparent (open for the photo)', tp.mid===0, 'midAlpha='+tp.mid);
check('Overlay has both content and transparency', tp.op>20 && tp.tr>tp.op, JSON.stringify(tp));

// Adaptive availability: a steady run with no splits → no interval block offered
const steady=await page.evaluate(()=>{ const s={session:'Easy Run',dist:'8',dur:'44',hr:'140',ts:Date.now()}; const d=_overlayData(s); return {iv:d.has.intervals, reps:d.reps.length}; });
check('No splits → interval block not available (adaptive)', steady.iv===false && steady.reps===0, JSON.stringify(steady));

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::|Chart/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
