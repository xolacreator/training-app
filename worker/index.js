import { decodeFit, compactFit, fitFromZip } from './fit.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Token',
};

// Pull a number out of a Health Auto Export field, which may be a number, a numeric
// string, or an object like { qty: 5.2, units: "km" }.
function numFrom(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  if (typeof v === 'object') return numFrom(v.qty ?? v.value ?? v.average ?? v.avg);
  return 0;
}
function distToKm(v) {
  if (v == null) return 0;
  const qty = numFrom(v);
  const units = (typeof v === 'object' && v.units) ? String(v.units).toLowerCase() : 'km';
  if (units.includes('mi')) return qty * 1.60934;
  if (units === 'm' || units.includes('meter')) return qty / 1000;
  return qty; // assume km
}
// Normalize a workout from Health Auto Export / a Shortcut into a compact summary.
function normWorkout(w) {
  if (!w || typeof w !== 'object') return null;
  const startRaw = w.start || w.startDate || w.start_date || w.date || w.startTime;
  const startMs = Date.parse(startRaw || '');
  if (isNaN(startMs)) return null;
  const name = w.name || w.workoutActivityType || w.activityType || w.type || 'Workout';
  let dur = numFrom(w.duration ?? w.durationSeconds ?? w.elapsed);
  if (!dur && w.end) { const e = Date.parse(w.end); if (!isNaN(e)) dur = (e - startMs) / 1000; }
  const distKm = distToKm(w.distance ?? w.totalDistance ?? w.distanceWalkingRunning);
  const hr = numFrom(w.avgHeartRate ?? w.averageHeartRate ?? w.heartRateAverage ?? w.heartRate);
  const id = w.id || w.uuid || `hae-${startMs}-${Math.round((distKm || 0) * 1000)}`;
  return {
    _id: String(id), name: String(name), sport: String(name),
    start: new Date(startMs).toISOString(),
    distance_km: +(distKm || 0).toFixed(3),
    duration_s: Math.round(dur || 0),
    avg_hr: Math.round(hr || 0),
  };
}


// -- GARMIN PERSONAL API -------------------------------------------------------
// Read-only access to the owner's own Garmin data (Garmin Connect Personal API, Oct 2026).
// The key is created at connect.garmin.com/app/settings/personalApiToken and stored as the
// Worker secret GARMIN_PERSONAL_KEY. It never reaches the browser. Only the sync token in the
// secret GARMIN_OWNER_TOKEN may use it: the key reads one person's data, and only that person.
// Endpoints and the key-for-token exchange follow Garmin's own client
// (github.com/garmin/connect-personal-api-python, Apache-2.0).
const GARMIN_BASE  = 'https://personal.connectapi.garmin.com';
const GARMIN_TOKEN = '/personalapitoken-service/personal-api/personal-api-key/token';
const GARMIN_TTL   = 7776000; // keep synced data 90 days, like the other stores

function gJson(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function isoDay(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return isoDay(d); }

// Exchange the key for a bearer token (a JWT, about 24 h) and cache it until an hour before expiry.
async function garminBearer(env) {
  const cached = await env.HEALTH_DATA.get('garmin:bearer', 'json');
  if (cached && cached.exp - Date.now() / 1000 > 3600) return cached.token;
  const r = await fetch(GARMIN_BASE + GARMIN_TOKEN, {
    method: 'POST', headers: { 'Accept': '*/*', 'Authorization': 'ApiKey ' + env.GARMIN_PERSONAL_KEY },
    signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('token_' + r.status);
  const token = (await r.text()).trim();
  let exp = Date.now() / 1000 + 6 * 3600;
  try { exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || exp; } catch (e) {}
  await env.HEALTH_DATA.put('garmin:bearer', JSON.stringify({ token, exp }),
    { expirationTtl: Math.max(60, Math.floor(exp - Date.now() / 1000)) });
  return token;
}

async function garminGet(env, bearer, path, params) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  const r = await fetch(GARMIN_BASE + path + q, { headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + bearer },
                                                   signal: AbortSignal.timeout(15000) });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(path.split('/')[1] + '_' + r.status);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// One activity, in the shape the app's importer already reads, plus what Garmin adds.
function normGarminActivity(a) {
  if (!a || a.activityId == null) return null;
  const gmt = a.startTimeGMT ? String(a.startTimeGMT).replace(' ', 'T') + 'Z' : null;
  const start = gmt || (a.startTimeLocal ? String(a.startTimeLocal).replace(' ', 'T') : null);
  if (!start || isNaN(Date.parse(start))) return null;
  const type = (a.activityType && (a.activityType.typeKey || a.activityType.key)) || a.activityTypeKey || 'workout';
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  return {
    _id: 'garmin-' + a.activityId, garmin_id: String(a.activityId), source: 'garmin', name: String(a.activityName || type), sport: String(type),
    start: new Date(Date.parse(start)).toISOString(),
    start_local: a.startTimeLocal ? String(a.startTimeLocal).replace(' ', 'T') : null,
    distance_km: +(n(a.distance) / 1000).toFixed(3),
    duration_s: Math.round(n(a.duration)), moving_s: Math.round(n(a.movingDuration)),
    avg_hr: Math.round(n(a.averageHR)), max_hr: Math.round(n(a.maxHR)),
    avg_speed: +n(a.averageSpeed).toFixed(3), elev_gain_m: Math.round(n(a.elevationGain)),
    calories: Math.round(n(a.calories)),
    te_aerobic: +n(a.aerobicTrainingEffect).toFixed(1), te_anaerobic: +n(a.anaerobicTrainingEffect).toFixed(1),
    ...(a.totalSets != null || a.activeSets != null ? { sets: Math.round(n(a.activeSets != null ? a.activeSets : a.totalSets)) } : {}),
    ...(a.totalReps != null ? { reps: Math.round(n(a.totalReps)) } : {}),
    // Multisport: a parent lists its legs' ids, a leg names its parent. Kept so a leg is never
    // counted twice and a parent's running legs count as running.
    ...(gChildIds(a).length ? { child_ids: gChildIds(a) } : {}),
    // Strength: Garmin's per-exercise summary on the list entry. It carries edits made in Connect
    // (exercise, reps, weight), and it is there even when the editable set list is not served.
    ...(gExSummary(a) ? { ex_summary: gExSummary(a) } : {}),
    ...(gParentId(a) ? { parent_id: gParentId(a) } : {}),
    // A fingerprint of everything Garmin says about the activity. An edit in Garmin Connect (a
    // new name or type, a corrected distance, sets and weights typed in) changes it, and a
    // changed fingerprint is how the Worker and the app know to read the activity again.
    rev: gRev(a),
  };
}

/* summarizedExerciseSets as [exercise, sets, reps, kg moved]. Garmin keeps volume in grams (a
   single set of 5 x 100 kg reads 500000); a number that size is read as grams. */
function gExSummary(a) {
  const xs = a && (a.summarizedExerciseSets || (a.summaryDTO && a.summaryDTO.summarizedExerciseSets));
  if (!Array.isArray(xs) || !xs.length) return null;
  return xs.slice(0, 20).map((x) => {
    const vol = typeof x.volume === 'number' ? x.volume : 0;
    return [String(x.category || x.subCategory || 'other').toLowerCase(), Math.round(x.sets || 0), Math.round(x.reps || 0),
            Math.round(vol > 50000 ? vol / 1000 : vol)];
  });
}

/* A HYROX simulation is 8 runs and 8 stations plus Garmin's transitions: well over 16 legs. The
   first version read 8 and dropped every run after them; reads made then carry no `legs_v` and are
   read again. */
const MAX_LEGS = 40, LEGS_V = 2, LEG_READS_PER_SYNC = 120;

function gChildIds(a) {
  const m = (a && a.metadataDTO) || {};
  const ids = (a && (a.childIds || a.childActivityIds)) || m.childIds || [];
  return Array.isArray(ids) ? ids.map(String) : [];
}
function gParentId(a) {
  const m = (a && a.metadataDTO) || {};
  const p = (a && (a.parentId || a.parentActivityId)) || m.parentId || null;
  return p != null && !(a && a.isMultiSportParent) ? String(p) : null;
}

function gRev(obj) {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Daily health, merged by date. Garmin's response shapes differ by service, so this walks each
// response for objects that carry a date and reads the fields the check-in uses, by any of the
// names Garmin is known to use. /garmin/status reports which were found, so the first real sync
// shows what arrived.
const G_FIELDS = {
  sleepHours:  [['sleepTimeSeconds', 3600], ['sleepTimeInSeconds', 3600], ['totalSleepSeconds', 3600]],
  hrv:         [['lastNightAvg', 1], ['lastNight5MinHigh', 0], ['hrvValue', 1]],
  restingHR:   [['restingHeartRate', 1], ['restingHeartRateValue', 1], ['restingHR', 1]],
  steps:       [['totalSteps', 1], ['steps', 1]],
  bodyBattery: [['bodyBatteryAtWakeTime', 1], ['bodyBatteryHighestValue', 1], ['highest', 1], ['bodyBatteryMostRecentValue', 1]],
};
function gWalk(node, out, depth, inheritedDate) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { node.forEach((x) => gWalk(x, out, depth + 1, inheritedDate)); return; }
  if (typeof node !== 'object') return;
  const date = node.calendarDate || node.date || node.calendar_date || inheritedDate;
  if (date && /^\d{4}-\d\d-\d\d/.test(String(date))) {
    const d = String(date).slice(0, 10), row = out[d] || (out[d] = {});
    const sc = node.sleepScores && node.sleepScores.overall && node.sleepScores.overall.value;
    if (row.sleepScore == null && typeof sc === 'number' && sc > 0) { row.sleepScore = sc; out.__found.sleepScore = 'sleepScores.overall.value'; }
    for (const f in G_FIELDS) {
      if (row[f] != null) continue;
      for (const [k, div] of G_FIELDS[f]) {
        const v = node[k];
        if (div && typeof v === 'number' && isFinite(v) && v > 0) { row[f] = div === 1 ? v : +(v / div).toFixed(2); out.__found[f] = k; break; }
      }
    }
  }
  for (const k in node) if (node[k] && typeof node[k] === 'object') gWalk(node[k], out, depth + 1, date && String(date).slice(0, 10));
}

/* One activity in full: Garmin's own summary of it (training effect, load, running dynamics -
   whatever the watch recorded), the original file decoded into laps and a 10-second trace, and,
   for strength work, the sets as Garmin Connect holds them. Kept until the activity's fingerprint
   changes: an activity edited in Connect is read again (the sync drops the stale copy). */
const G_SUMMARY_KEEP = /^(average|avg|max|min|total|training|aerobic|anaerobic|activityTrainingLoad|vO2|moderate|vigorous|elevation|calories|steps|strides|groundContact|verticalOscillation|verticalRatio|stride|normalizedPower|lactate|recovery|difference|beginPotential|endPotential|maxDoubleCadence|waterEstimated|bodyBattery|hrTimeInZone|powerTimeInZone)/i;
/* Heart-rate zones from Garmin Connect's settings: the maximum and the five zone floors, from the
   general (or running) set. Read by any of the names Garmin is known to use. */
function gHrZones(raw) {
  const sets = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const pick = sets.find((x) => x && /default|running/i.test(String(x.sport || 'DEFAULT'))) || sets[0];
  if (!pick || typeof pick !== 'object') return null;
  const max = pick.maxHeartRateUsed || pick.maxHeartRate || pick.maxHr || null;
  const floors = [1, 2, 3, 4, 5].map((i) => pick['zone' + i + 'Floor']);
  const ok = floors.every((f) => typeof f === 'number' && f > 0);
  if (!max && !ok) return null;
  return { max: typeof max === 'number' ? max : null, floors: ok ? floors : null,
           method: pick.trainingMethod || null, resting: pick.restingHeartRateUsed || null,
           source: ok ? 'zone floors' : 'maximum only' };
}

function gSummary(raw) {
  const src = (raw && (raw.summaryDTO || raw.summary)) || raw || {};
  const out = {};
  for (const k in src) {
    const v = src[k];
    if ((typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v.length < 80)) {
      if (G_SUMMARY_KEEP.test(k)) out[k] = v;
    }
  }
  if (raw && raw.activityTypeDTO && raw.activityTypeDTO.typeKey) out.typeKey = raw.activityTypeDTO.typeKey;
  const ex = gExSummary(raw || {});
  if (ex) out.exSummary = ex;
  return out;
}

/* Sets as Garmin Connect holds them, which is where edits made in the Connect app live: the
   original file keeps what the watch counted and is never rewritten. Read defensively, because
   the shape is not in Garmin's published client. Returned in the decoder's own form,
   [offset s, duration s, reps, kg, exercise], with `unit` saying how the weight was read. */
function gExerciseSets(raw, startIso) {
  const list = raw && (Array.isArray(raw) ? raw : raw.exerciseSets);
  if (!Array.isArray(list) || !list.length) return null;
  const active = list.filter((x) => x && String(x.setType || x.set_type || 'ACTIVE').toUpperCase() !== 'REST');
  const rest = list.filter((x) => x && String(x.setType || x.set_type || '').toUpperCase() === 'REST');
  const ws = active.map((x) => (typeof x.weight === 'number' ? x.weight : null)).filter((w) => w != null && w > 0);
  // Grams or kilograms is not documented. No barbell holds 500 kg, so a larger number is grams.
  const grams = ws.length && Math.max.apply(null, ws) > 500;
  const t0 = startIso ? Date.parse(startIso) : null;
  const sets = active.map((x) => {
    const ex = (Array.isArray(x.exercises) && x.exercises[0]) || {};
    const cat = String(ex.category || x.category || '').toLowerCase() || null;
    const st = x.startTime ? Date.parse(String(x.startTime).replace(' ', 'T') + (/[zZ+]/.test(String(x.startTime).slice(10)) ? '' : 'Z')) : null;
    const reps = x.repetitionCount != null ? x.repetitionCount : x.reps != null ? x.reps : null;
    const w = typeof x.weight === 'number' && x.weight > 0 ? Math.round((grams ? x.weight / 1000 : x.weight) * 10) / 10 : null;
    const dur = typeof x.duration === 'number' ? Math.round(x.duration * 10) / 10 : null;
    return [st != null && t0 != null && isFinite(st) ? Math.round((st - t0) / 1000) : null, dur, reps, w, cat === 'unknown' ? null : cat];
  });
  const restS = rest.reduce((a, x) => a + (typeof x.duration === 'number' ? x.duration : 0), 0);
  return { sets, rest_s: Math.round(restS), unit: ws.length ? (grams ? 'g' : 'kg') : null };
}

/* `fresh`: re-read what Garmin Connect holds now (its summary, edited sets, multisport legs)
   whatever is cached. The original file never changes after upload, so a cached one is kept
   rather than downloaded again. `drev` fingerprints what was read, so the app can tell an edit. */
async function garminDetail(env, token, id, bearer, rev, fresh) {
  const key = 'garmin:' + token + ':detail:' + id;
  const cached = await env.HEALTH_DATA.get(key, 'json');
  const sameRev = cached && (!rev || !cached.rev || cached.rev === rev);
  if (cached && cached.fit && sameRev && !fresh) return cached;
  bearer = bearer || await garminBearer(env);
  const out = { id: String(id), rev: rev || null, at: new Date().toISOString(), garmin: null, fit: null, connectSets: null, legs: null, errors: [] };
  let raw = null;
  try { raw = await garminGet(env, bearer, '/activity-service/activity/' + id, null); out.garmin = gSummary(raw); }
  catch (e) { out.errors.push('summary: ' + String(e.message || e)); }
  /* multisport: each leg as Garmin holds it now, edits included (an erg distance corrected in Connect) */
  const kids = gChildIds(raw || {});
  if (kids.length) {
    out.legs = [];
    for (const cid of kids.slice(0, MAX_LEGS)) {
      try {
        const c = await garminGet(env, bearer, '/activity-service/activity/' + cid, null), sm = (c && (c.summaryDTO || c.summary)) || c || {};
        const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
        out.legs.push({ id: String(cid), sport: (c && c.activityTypeDTO && c.activityTypeDTO.typeKey) || 'other', name: (c && c.activityName) ? String(c.activityName).slice(0, 60) : null,
                        dist_m: Math.round(num(sm.distance)), time_s: Math.round(num(sm.duration || sm.elapsedDuration)),
                        hr: Math.round(num(sm.averageHR)), max_hr: Math.round(num(sm.maxHR)), calories: Math.round(num(sm.calories)) });
      } catch (e) { out.errors.push('leg ' + cid + ': ' + String(e.message || e)); }
    }
  }
  if (sameRev && cached && cached.fit) out.fit = cached.fit;
  else try {
    const r = await fetch(GARMIN_BASE + '/download-service/files/activity/' + id, {
      headers: { 'Accept': 'application/zip, application/x-zip-compressed, application/octet-stream', 'Authorization': 'Bearer ' + bearer },
      signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('file_' + r.status);
    out.fit = compactFit(decodeFit(await fitFromZip(new Uint8Array(await r.arrayBuffer()))), 10);
  } catch (e) { out.errors.push('file: ' + String(e.message || e)); }
  if (!out.garmin && cached && cached.garmin) out.garmin = cached.garmin;
  const kind = String((out.garmin && out.garmin.typeKey) || (out.fit && out.fit.sport) || '');
  if (/strength|training|fitness|hiit|cardio/.test(kind) || (out.fit && out.fit.sets && out.fit.sets.length)) {
    try { out.connectSets = gExerciseSets(await garminGet(env, bearer, '/activity-service/activity/' + id + '/exerciseSets', null), out.fit && out.fit.start); }
    catch (e) { out.errors.push('sets: ' + String(e.message || e)); }
  }
  out.drev = gRev({ g: out.garmin, s: out.connectSets, l: out.legs });
  out.changed = !!(cached && cached.drev && cached.drev !== out.drev);
  if (out.fit || out.garmin) await env.HEALTH_DATA.put(key, JSON.stringify(out), { expirationTtl: GARMIN_TTL });
  return out;
}

async function garminSync(env, token, opts) {
  opts = opts || {};
  if (!env.GARMIN_PERSONAL_KEY || !env.GARMIN_OWNER_TOKEN) return { ok: false, reason: 'not_configured' };
  if (token !== env.GARMIN_OWNER_TOKEN) return { ok: false, reason: 'not_owner' };
  if (!env.HEALTH_DATA) return { ok: false, reason: 'no_storage' };
  const stateKey = 'garmin:' + token + ':state';
  const state = (await env.HEALTH_DATA.get(stateKey, 'json')) || {};
  if (!opts.force && state.at && Date.now() - Date.parse(state.at) < 10 * 60 * 1000) return { ok: true, throttled: true, ...state };
  const out = { ok: true, at: new Date().toISOString(), activities: 0, healthDays: 0, errors: [], found: {} };
  let bearer;
  try { bearer = await garminBearer(env); } catch (e) { out.ok = false; out.errors.push(String(e.message || e)); }
  if (bearer) {
    /* Three weeks back on every sync: an activity edited in Garmin Connect days later is read again. */
    const from = daysAgo(state.at ? 21 : 30), to = daysAgo(0);
    // activities
    try {
      const raw = await garminGet(env, bearer, '/activitylist-service/activities/search/activities',
        { start: 0, limit: 100, startDate: from, endDate: to });
      const key = 'garmin:' + token + ':activities';
      let list = (await env.HEALTH_DATA.get(key, 'json')) || [];
      const at = new Map(list.map((a, i) => [a._id, i]));
      const got = new Set();
      out.updated = 0; out.removed = 0;
      for (const a of (Array.isArray(raw) ? raw : [])) {
        const n = normGarminActivity(a);
        if (!n) continue;
        got.add(n._id);
        if (!at.has(n._id)) { list.unshift(n); at.set(n._id, -1); out.activities++; continue; }
        const i = list.findIndex((x) => x._id === n._id), old = list[i];
        if (old.rev === n.rev) { if (old.drev) n.drev = old.drev; list[i] = { ...old, ...n }; continue; }
        /* the legs are re-read on the next pass (they may be what was edited) */
        /* edited in Garmin Connect: the new summary replaces the old, and the stored file and sets
           are dropped so the next read is the edited activity */
        list[i] = n;
        await env.HEALTH_DATA.delete('garmin:' + token + ':detail:' + n.garmin_id);
        const { rev: _r, sets: _s, reps: _p, ...now } = n, { rev: _o, sets: _t, reps: _q, ...was } = old;
        if (old.rev || JSON.stringify(now) !== JSON.stringify(was)) out.updated++;
      }
      /* Deleted in Garmin: inside the window just read, absent from a list that was not cut
         short. The window's first day is left alone, since its edge depends on time zones. */
      if (Array.isArray(raw) && raw.length < 100) {
        const keep = list.filter((x) => {
          const d = String(x.start_local || x.start || '').slice(0, 10);
          return !(d > from && d <= to && !got.has(x._id));
        });
        for (const x of list) if (!keep.includes(x)) await env.HEALTH_DATA.delete('garmin:' + token + ':detail:' + x.garmin_id);
        out.removed = list.length - keep.length;
        list = keep;
      }
      list.sort((x, y) => (x.start < y.start ? 1 : -1));
      await env.HEALTH_DATA.put(key, JSON.stringify(list.slice(0, 300)), { expirationTtl: GARMIN_TTL });
      /* Edits Garmin Connect keeps outside the activity list (sets and weights, a multisport leg's
         distance) do not change the list entry. So recent activities are re-read for them: 10 days
         on a manual sync, 3 on the timer, at most 12 a sync, and a changed read updates `drev`. */
      out.refreshed = 0;
      const since = daysAgo(opts.force ? 10 : 3);
      for (const a of list) {
        if (out.refreshed >= 12) break;
        const gid = a.garmin_id || String(a._id || '').replace('garmin-', '');
        if (!/^\d+$/.test(gid) || String(a.start_local || a.start || '').slice(0, 10) < since) continue;
        if (!(await env.HEALTH_DATA.get('garmin:' + token + ':detail:' + gid))) continue;
        try {
          const d = await garminDetail(env, token, gid, bearer, a.rev, true);
          out.refreshed++;
          if (d.drev && d.drev !== a.drev) { if (a.drev) out.updated++; a.drev = d.drev; }
          if (Array.isArray(d.legs)){ a.legs = d.legs.map((l) => ({ id: l.id, sport: l.sport, dist_m: l.dist_m, time_s: l.time_s, hr: l.hr })); a.legs_v = LEGS_V; }
          if (d.garmin && d.garmin.exSummary) a.ex_summary = d.garmin.exSummary;
        } catch (e) { out.errors.push('refresh ' + gid); }
      }
      /* Multisport: the legs onto the list entry itself, so a session's running legs count from the
         first sync, with or without its full detail. At most 6 sessions a sync. */
      out.legs = 0;
      const legSince = daysAgo(21);
      let legReads = 0;
      for (const a of list) {
        if (out.legs >= 6 || legReads >= LEG_READS_PER_SYNC) break;
        const gid = a.garmin_id || String(a._id || '').replace('garmin-', '');
        const multi = /multi/.test(String(a.sport || '')) || (a.child_ids && a.child_ids.length);
        const complete = a.legs && a.legs_v === LEGS_V && !(a.child_ids && a.legs.length < a.child_ids.length);
        if (!multi || complete || a.parent_id || !/^\d+$/.test(gid) || String(a.start_local || a.start || '').slice(0, 10) < legSince) continue;
        try {
          let kids = a.child_ids || [];
          if (!kids.length) kids = gChildIds(await garminGet(env, bearer, '/activity-service/activity/' + gid, null) || {});
          const legs = [];
          for (const cid of kids.slice(0, MAX_LEGS)) {
            legReads++;
            const c = await garminGet(env, bearer, '/activity-service/activity/' + cid, null), sm = (c && (c.summaryDTO || c.summary)) || c || {};
            const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
            legs.push({ id: String(cid), sport: (c && c.activityTypeDTO && c.activityTypeDTO.typeKey) || 'other',
                        dist_m: Math.round(num(sm.distance)), time_s: Math.round(num(sm.duration || sm.elapsedDuration)), hr: Math.round(num(sm.averageHR)) });
          }
          a.child_ids = kids.map(String);
          a.legs = legs; a.legs_v = LEGS_V;
          out.legs++;
        } catch (e) { out.errors.push('legs ' + gid + ': ' + String(e.message || e)); }
      }
      /* the newest few in full, so the review is ready before anyone opens it */
      out.details = 0;
      for (const a of list.slice(0, 6)) {
        if (out.details >= 3) break;
        const gid = a.garmin_id || String(a._id || '').replace('garmin-', '');
        if (!/^\d+$/.test(gid) || await env.HEALTH_DATA.get('garmin:' + token + ':detail:' + gid)) continue;
        try { const d = await garminDetail(env, token, gid, bearer, a.rev); if (d.drev) a.drev = d.drev; out.details++; } catch (e) { out.errors.push('detail ' + gid); }
      }
      /* saved again: the re-checks and the prefetch set each read's `drev` on the list */
      await env.HEALTH_DATA.put(key, JSON.stringify(list.slice(0, 300)), { expirationTtl: GARMIN_TTL });
    } catch (e) { out.errors.push(String(e.message || e)); }
    // health, last 7 days, into the same daily check-in store the app already reads
    const hFrom = daysAgo(7), days = { __found: {} };
    const pulls = [
      ['/sleep-service/sleep/dailySleepSummariesByDate', { startDate: hFrom, endDate: to }],
      ['/hrv-service/hrv/daily/' + hFrom + '/' + to, null],
      ['/usersummary-service/v2/dailysummaries', { startDate: hFrom, endDate: to }],
      ['/wellness-service/wellness/bodyBattery/reports/daily', { startDate: hFrom, endDate: to }],
    ];
    for (const [path, params] of pulls) {
      try { gWalk(await garminGet(env, bearer, path, params), days, 0, null); }
      catch (e) { out.errors.push(String(e.message || e)); }
    }
    out.found = days.__found; delete days.__found;
    // the athlete's own heart-rate zones, as set in Garmin Connect, for the session review
    try {
      const z = gHrZones(await garminGet(env, bearer, '/biometric-service/heartRateZones/v2', null));
      if (z) { await env.HEALTH_DATA.put('garmin:' + token + ':hrzones', JSON.stringify(z), { expirationTtl: GARMIN_TTL }); out.found.hrZones = z.source; }
    } catch (e) { out.optional = ['heart-rate zones: ' + String(e.message || e)]; }   // optional: the review falls back to the observed maximum
    let latest = null;
    for (const d of Object.keys(days).sort()) {
      const row = days[d];
      if (!Object.keys(row).length) continue;
      const prev = (await env.HEALTH_DATA.get('health:' + token + ':' + d, 'json')) || {};
      const merged = { ...prev, date: d, ...row, source: 'garmin', garminSyncTime: out.at };
      await env.HEALTH_DATA.put('health:' + token + ':' + d, JSON.stringify(merged), { expirationTtl: GARMIN_TTL });
      out.healthDays++; latest = d;
    }
    if (latest) {
      const cur = await env.HEALTH_DATA.get('health:' + token + ':latest');
      if (!cur || cur <= latest) await env.HEALTH_DATA.put('health:' + token + ':latest', latest, { expirationTtl: GARMIN_TTL });
    }
  }
  if (out.errors.length && !out.activities && !out.healthDays) out.ok = false;
  await env.HEALTH_DATA.put(stateKey, JSON.stringify(out), { expirationTtl: GARMIN_TTL });
  return out;
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (e) {
      // Never a bare 500: the app cannot read one across origins and shows nothing at all.
      return new Response(JSON.stringify({ ok: false, reason: 'worker_error', detail: String((e && e.message) || e).slice(0, 200) }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  },

  // Every two hours, if a cron trigger is set on the Worker (Settings, Trigger Events, Cron).
  async scheduled(event, env, ctx) {
    if (env.GARMIN_PERSONAL_KEY && env.GARMIN_OWNER_TOKEN && env.HEALTH_DATA)
      ctx.waitUntil(garminSync(env, env.GARMIN_OWNER_TOKEN, { force: true }));
  },
};

async function handle(request, env, ctx) {
  {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // Strava was retired 2026-10-25: it only ever relayed Garmin data, which now comes from
    // Garmin directly (/garmin/*). Its login, callback and token refresh routes are gone.

    // Store a health check-in (called by iOS Shortcut)
    if (path === '/health' && request.method === 'POST') {
      const token = request.headers.get('X-Sync-Token') || '';
      if (!token) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing_token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      let body;
      try { body = await request.json(); } catch(e) {
        return new Response(JSON.stringify({ ok: false, reason: 'invalid_json' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const { date, sleepHours, hrv, restingHR, vo2max, steps, bodyBattery, garminSyncTime } = body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ ok: false, reason: 'invalid_date' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const payload = JSON.stringify({ date, sleepHours, hrv, restingHR, vo2max, steps, bodyBattery, garminSyncTime });
      const ttl = 7776000; // 90 days in seconds
      await env.HEALTH_DATA.put(`health:${token}:${date}`, payload, { expirationTtl: ttl });
      await env.HEALTH_DATA.put(`health:${token}:latest`, date, { expirationTtl: ttl });
      return new Response(JSON.stringify({ ok: true }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Retrieve a health check-in
    if (path === '/health' && request.method === 'GET') {
      const token = request.headers.get('X-Sync-Token') || '';
      if (!token) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing_token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const wantLatest = url.searchParams.get('latest') === 'true';
      let date = url.searchParams.get('date');
      if (wantLatest || !date) {
        const latestDate = await env.HEALTH_DATA.get(`health:${token}:latest`);
        if (!latestDate) {
          return new Response(JSON.stringify({ ok: false, reason: 'not_found' }),
            { headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        date = latestDate;
      }
      const raw = await env.HEALTH_DATA.get(`health:${token}:${date}`);
      if (!raw) {
        return new Response(JSON.stringify({ ok: false, reason: 'not_found' }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return new Response(raw,
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // -- ACTIVITY BRIDGE --------------------------------------------------------
    // Store workout summaries pushed from Apple Health (via Health Auto Export or an
    // iOS Shortcut) so the app can auto-import them - no Strava/Garmin API needed.
    // POST: body = a workout object, an array, or { data:{ workouts:[…] } }.
    if (path === '/activity' && request.method === 'POST') {
      const token = request.headers.get('X-Sync-Token') || '';
      if (!token) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing_token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      let body;
      try { body = await request.json(); } catch(e) {
        return new Response(JSON.stringify({ ok: false, reason: 'invalid_json' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const raw = Array.isArray(body) ? body
        : Array.isArray(body?.workouts) ? body.workouts
        : Array.isArray(body?.data?.workouts) ? body.data.workouts
        : [body];
      const key = `activity:${token}:list`;
      let list = [];
      try { list = JSON.parse(await env.HEALTH_DATA.get(key) || '[]'); } catch(e) {}
      const seen = new Set(list.map(a => a._id));
      let added = 0;
      for (const w of raw) {
        const n = normWorkout(w);
        if (!n || seen.has(n._id)) continue;
        list.unshift(n); seen.add(n._id); added++;
      }
      list = list.slice(0, 100); // keep the most recent 100
      await env.HEALTH_DATA.put(key, JSON.stringify(list), { expirationTtl: 7776000 });
      return new Response(JSON.stringify({ ok: true, added, total: list.length }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // GET: the app pulls the stored workout summaries for this token.
    if (path === '/activity' && request.method === 'GET') {
      const token = request.headers.get('X-Sync-Token') || url.searchParams.get('token') || '';
      if (!token) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing_token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const raw = await env.HEALTH_DATA.get(`activity:${token}:list`) || '[]';
      return new Response(raw, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Proxy Claude API calls - avoids CORS/iOS PWA restrictions on direct browser requests
    if (path === '/claude' && request.method === 'POST') {
      try {
        const { key, model, system, messages, max_tokens } = await request.json();
        if (!key || !key.startsWith('sk-ant')) {
          return new Response(JSON.stringify({ error: { message: 'missing or invalid API key' } }),
            { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const resp = await fetch(CLAUDE_API, {
          method: 'POST',
          headers: {
            'Content-Type':    'application/json',
            'x-api-key':       key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, system, messages, max_tokens }),
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data),
          { status: resp.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: { message: 'proxy_failed' } }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    // Proxy OpenAI (ChatGPT) calls - same CORS/iOS-PWA reasons as /claude.
    // Accepts the same Claude-shaped payload {key, model, system, messages, max_tokens}
    // and translates to OpenAI's chat-completions format. Returns OpenAI's raw JSON;
    // the client normalizes it to the {content:[{text}]} shape.
    if (path === '/openai' && request.method === 'POST') {
      try {
        const { key, model, system, messages, max_tokens } = await request.json();
        if (!key || !key.startsWith('sk-')) {
          return new Response(JSON.stringify({ error: { message: 'missing or invalid API key' } }),
            { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const oaMessages = [];
        if (system) oaMessages.push({ role: 'system', content: system });
        for (const m of (messages || [])) oaMessages.push({ role: m.role, content: m.content });
        const resp = await fetch(OPENAI_API, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({ model, messages: oaMessages, max_tokens }),
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data),
          { status: resp.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: { message: 'proxy_failed' } }),
          { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    // -- Garmin Personal API: sync, status, and the synced data -----------------
    if (path.startsWith('/garmin/')) {
      /* The status check also takes ?token= so it can be opened in a browser to diagnose setup. */
      const token = request.headers.get('X-Sync-Token') || (path === '/garmin/status' ? url.searchParams.get('token') || '' : '');
      if (!token) return gJson({ ok: false, reason: 'missing_token' }, 401);
      if (path === '/garmin/status' && request.method === 'GET') {
        const configured = !!(env.GARMIN_PERSONAL_KEY && env.GARMIN_OWNER_TOKEN);
        const mine = configured && token === env.GARMIN_OWNER_TOKEN;
        const storage = !!env.HEALTH_DATA;
        const state = mine && storage ? await env.HEALTH_DATA.get('garmin:' + token + ':state', 'json') : null;
        return gJson({ ok: true, configured, owner: mine, storage,
                       key_set: !!env.GARMIN_PERSONAL_KEY, owner_token_set: !!env.GARMIN_OWNER_TOKEN, last: state || null });
      }
      if (path === '/garmin/sync' && request.method === 'POST') {
        const r = await garminSync(env, token, { force: url.searchParams.get('force') === '1' });
        return gJson(r, r.ok ? 200 : (r.reason === 'not_owner' ? 403 : r.reason === 'not_configured' ? 501
                                     : r.reason === 'no_storage' ? 503 : 502));
      }
      if (path === '/garmin/health' && request.method === 'GET') {
        if (!env.GARMIN_OWNER_TOKEN || token !== env.GARMIN_OWNER_TOKEN) return gJson({ ok: false, reason: 'not_owner' }, 403);
        if (!env.HEALTH_DATA) return gJson({ ok: false, reason: 'no_storage' }, 503);
        const n = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10) || 14)), rows = [];
        for (let i = 0; i < n; i++) {
          const row = await env.HEALTH_DATA.get('health:' + token + ':' + daysAgo(i), 'json');
          if (row && row.source === 'garmin') rows.push(row);
        }
        return gJson(rows);
      }
      const dm = /^\/garmin\/activity\/(\d+)$/.exec(path);
      if (dm && request.method === 'GET') {
        if (!env.GARMIN_OWNER_TOKEN || token !== env.GARMIN_OWNER_TOKEN) return gJson({ ok: false, reason: 'not_owner' }, 403);
        if (!env.HEALTH_DATA) return gJson({ ok: false, reason: 'no_storage' }, 503);
        const d = await garminDetail(env, token, dm[1], null, url.searchParams.get('rev') || null, url.searchParams.get('fresh') === '1');
        return gJson({ ok: !!(d.fit || d.garmin), ...d }, d.fit || d.garmin ? 200 : 502);
      }
      if (path === '/garmin/profile' && request.method === 'GET') {
        if (!env.GARMIN_OWNER_TOKEN || token !== env.GARMIN_OWNER_TOKEN) return gJson({ ok: false, reason: 'not_owner' }, 403);
        if (!env.HEALTH_DATA) return gJson({ ok: false, reason: 'no_storage' }, 503);
        return gJson({ ok: true, hrZones: await env.HEALTH_DATA.get('garmin:' + token + ':hrzones', 'json') });
      }
      if (path === '/garmin/activities' && request.method === 'GET') {
        if (!env.GARMIN_OWNER_TOKEN || token !== env.GARMIN_OWNER_TOKEN) return gJson({ ok: false, reason: 'not_owner' }, 403);
        if (!env.HEALTH_DATA) return gJson({ ok: false, reason: 'no_storage' }, 503);
        const raw = await env.HEALTH_DATA.get('garmin:' + token + ':activities') || '[]';
        return new Response(raw, { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return gJson({ ok: false, reason: 'not_found' }, 404);
    }

    return new Response('Not found', { status: 404 });
  }
}
