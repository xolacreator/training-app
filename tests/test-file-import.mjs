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
await page.addStyleTag({content:'#morning-overlay,#digest-backdrop,#digest-sheet{display:none!important;pointer-events:none!important}'});
await page.evaluate(()=>{try{dismissDigest();}catch(e){}});

// Build a GPX: 5 points, ~1km apart in latitude, 5 min apart → ~5:00/km, HR present
const gpx = (()=>{
  const base=new Date('2026-06-15T07:00:00Z');
  let pts=''; let lat=40.0;
  for(let i=0;i<5;i++){
    const t=new Date(base.getTime()+i*300000).toISOString(); // 5 min steps
    pts+=`<trkpt lat="${lat.toFixed(5)}" lon="-73.0"><time>${t}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${150+i}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`;
    lat+=0.00903; // ~1.005 km per step at this latitude
  }
  return `<?xml version="1.0"?><gpx xmlns:gpxtpx="x"><trk><name>Morning Run</name><type>running</type><trkseg>${pts}</trkseg></trk></gpx>`;
})();

const g = await page.evaluate((text)=>{ const a=_parseGPX(text,'run.gpx'); return {a, sess:_activityToSession(a,{allowOutOfRange:true})}; }, gpx);
check('GPX parses to activity', !!g.a, JSON.stringify(g.a&&{d:Math.round(g.a.distance),el:g.a.elapsed_time,hr:Math.round(g.a.average_heartrate),sp:g.a.strava_splits.length}));
check('GPX distance ~4km', g.a && Math.abs(g.a.distance-4020)<300, g.a&&Math.round(g.a.distance)+'m');
check('GPX elapsed ~1200s', g.a && Math.abs(g.a.elapsed_time-1200)<5, g.a&&g.a.elapsed_time+'s');
check('GPX avg HR ~152', g.a && Math.abs(g.a.average_heartrate-152)<3, g.a&&Math.round(g.a.average_heartrate));
check('GPX per-km splits produced (~4)', g.a && g.a.strava_splits.length>=3, g.a&&g.a.strava_splits.length);
check('GPX → session has pace + dist + gid file-', g.sess.session && g.sess.session.pace && g.sess.gid.startsWith('file-'), JSON.stringify({p:g.sess.session?.pace,dist:g.sess.session?.dist,gid:g.sess.gid}));

// TCX: 3 laps of 1000m / 300s, HR 148/150/152
const tcx = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-06-16T07:00:00Z</Id>
  <Lap StartTime="2026-06-16T07:00:00Z"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><AverageHeartRateBpm><Value>148</Value></AverageHeartRateBpm></Lap>
  <Lap StartTime="2026-06-16T07:05:00Z"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm></Lap>
  <Lap StartTime="2026-06-16T07:10:00Z"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><AverageHeartRateBpm><Value>152</Value></AverageHeartRateBpm></Lap>
</Activity></Activities></TrainingCenterDatabase>`;
const tc = await page.evaluate((text)=>{ const a=_parseTCX(text,'run.tcx'); return {a, sess:_activityToSession(a,{allowOutOfRange:true})}; }, tcx);
check('TCX parses to activity', !!tc.a, JSON.stringify(tc.a&&{d:tc.a.distance,el:tc.a.elapsed_time,hr:Math.round(tc.a.average_heartrate),laps:tc.a.strava_laps?.length}));
check('TCX distance 3000m', tc.a && tc.a.distance===3000, tc.a&&tc.a.distance);
check('TCX elapsed 900s', tc.a && tc.a.elapsed_time===900, tc.a&&tc.a.elapsed_time);
check('TCX avg HR 150', tc.a && Math.round(tc.a.average_heartrate)===150, tc.a&&Math.round(tc.a.average_heartrate));
check('TCX laps captured (3)', tc.a && tc.a.strava_laps && tc.a.strava_laps.length===3, tc.a&&tc.a.strava_laps?.length);
check('TCX → session dur ~15 min', tc.sess.session && tc.sess.session.dur==='15', tc.sess.session?.dur);

// Dedup: same activity twice → second is skip:'dup'
const dedup = await page.evaluate((text)=>{ const a=_parseGPX(text,'run.gpx'); const r1=_activityToSession(a,{allowOutOfRange:true}); sessions.unshift(r1.session); const r2=_activityToSession(a,{allowOutOfRange:true}); return r2.skip; }, gpx);
check('Re-importing same file dedups', dedup==='dup', dedup);

// Import footer button present on the (disconnected) Strava card
await page.evaluate(()=>{ nav('more',document.querySelectorAll('.nb')[4]); renderStravaCard(); });
await page.waitForTimeout(150);
const hasBtn = await page.evaluate(()=>/Import activity file/i.test(document.getElementById('strava-card').innerText) && !!document.getElementById('activity-file-input'));
check('Import button + hidden input present on Strava card', hasBtn);

// Diagnostic reasons for bad inputs (so "skipped" is never a dead end)
const routeGpx='<?xml version="1.0"?><gpx><rte><rtept lat="40" lon="-73"></rtept></rte></gpx>';
const rErr=await page.evaluate((t)=>_parseGPX(t,'route.gpx')?.error||'', routeGpx);
check('GPX route/course reports a clear reason', /route|course/i.test(rErr), rErr);
const fitErr=await page.evaluate(()=>_parseGPX('\x00\x00\x00.FIT\x00\x00binary', 'a.fit')?.error||'');
check('Binary/FIT file reports a clear reason', /fit|zip|export/i.test(fitErr), fitErr);
const noLap=await page.evaluate(()=>_parseTCX('<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-01-01T00:00:00Z</Id></Activity></Activities></TrainingCenterDatabase>','a.tcx')?.error||'');
check('TCX with no laps reports a clear reason', /lap/i.test(noLap), noLap);
// Indoor GPX (no track) → clear guidance to use TCX
const indoorErr=await page.evaluate(()=>_parseGPX('<?xml version="1.0"?><gpx><trk><name>Treadmill</name></trk></gpx>','indoor.gpx')?.error||'');
check('Indoor GPX (no track) suggests TCX', /tcx|treadmill|indoor/i.test(indoorErr), indoorErr);

const real=errs.filter(e=>!/Failed to load resource|ERR_|net::/.test(e));
check('No real JS errors', real.length===0, real.slice(0,3).join(' | '));
await browser.close();
const fails=results.filter(r=>!r.c);
console.log(`\n${results.length-fails.length}/${results.length} checks passed`);
process.exit(fails.length?1:0);
