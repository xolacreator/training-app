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
    method: 'POST', headers: { 'Accept': '*/*', 'Authorization': 'ApiKey ' + env.GARMIN_PERSONAL_KEY } });
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
  const r = await fetch(GARMIN_BASE + path + q, { headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + bearer } });
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
    _id: 'garmin-' + a.activityId, source: 'garmin', name: String(a.activityName || type), sport: String(type),
    start: new Date(Date.parse(start)).toISOString(),
    start_local: a.startTimeLocal ? String(a.startTimeLocal).replace(' ', 'T') : null,
    distance_km: +(n(a.distance) / 1000).toFixed(3),
    duration_s: Math.round(n(a.duration)), moving_s: Math.round(n(a.movingDuration)),
    avg_hr: Math.round(n(a.averageHR)), max_hr: Math.round(n(a.maxHR)),
    avg_speed: +n(a.averageSpeed).toFixed(3), elev_gain_m: Math.round(n(a.elevationGain)),
    calories: Math.round(n(a.calories)),
    te_aerobic: +n(a.aerobicTrainingEffect).toFixed(1), te_anaerobic: +n(a.anaerobicTrainingEffect).toFixed(1),
  };
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

async function garminSync(env, token, opts) {
  opts = opts || {};
  if (!env.GARMIN_PERSONAL_KEY || !env.GARMIN_OWNER_TOKEN) return { ok: false, reason: 'not_configured' };
  if (token !== env.GARMIN_OWNER_TOKEN) return { ok: false, reason: 'not_owner' };
  const stateKey = 'garmin:' + token + ':state';
  const state = (await env.HEALTH_DATA.get(stateKey, 'json')) || {};
  if (!opts.force && state.at && Date.now() - Date.parse(state.at) < 10 * 60 * 1000) return { ok: true, throttled: true, ...state };
  const out = { ok: true, at: new Date().toISOString(), activities: 0, healthDays: 0, errors: [], found: {} };
  let bearer;
  try { bearer = await garminBearer(env); } catch (e) { out.ok = false; out.errors.push(String(e.message || e)); }
  if (bearer) {
    const from = daysAgo(state.at ? 7 : 30), to = daysAgo(0);
    // activities
    try {
      const raw = await garminGet(env, bearer, '/activitylist-service/activities/search/activities',
        { start: 0, limit: 100, startDate: from, endDate: to });
      const key = 'garmin:' + token + ':activities';
      let list = (await env.HEALTH_DATA.get(key, 'json')) || [];
      const seen = new Set(list.map((a) => a._id));
      for (const a of (Array.isArray(raw) ? raw : [])) {
        const n = normGarminActivity(a);
        if (!n || seen.has(n._id)) continue;
        list.unshift(n); seen.add(n._id); out.activities++;
      }
      list.sort((x, y) => (x.start < y.start ? 1 : -1));
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
  async fetch(request, env) {
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

    // ── ACTIVITY BRIDGE ──────────────────────────────────────────────────────
    // Store workout summaries pushed from Apple Health (via Health Auto Export or an
    // iOS Shortcut) so the app can auto-import them — no Strava/Garmin API needed.
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

    // Proxy Claude API calls — avoids CORS/iOS PWA restrictions on direct browser requests
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

    // Proxy OpenAI (ChatGPT) calls — same CORS/iOS-PWA reasons as /claude.
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
      const token = request.headers.get('X-Sync-Token') || '';
      if (!token) return gJson({ ok: false, reason: 'missing_token' }, 401);
      if (path === '/garmin/status' && request.method === 'GET') {
        const configured = !!(env.GARMIN_PERSONAL_KEY && env.GARMIN_OWNER_TOKEN);
        const mine = configured && token === env.GARMIN_OWNER_TOKEN;
        const state = mine ? await env.HEALTH_DATA.get('garmin:' + token + ':state', 'json') : null;
        return gJson({ ok: true, configured, owner: mine, last: state || null });
      }
      if (path === '/garmin/sync' && request.method === 'POST') {
        const r = await garminSync(env, token, { force: url.searchParams.get('force') === '1' });
        return gJson(r, r.ok ? 200 : (r.reason === 'not_owner' ? 403 : r.reason === 'not_configured' ? 501 : 502));
      }
      if (path === '/garmin/health' && request.method === 'GET') {
        if (!env.GARMIN_OWNER_TOKEN || token !== env.GARMIN_OWNER_TOKEN) return gJson({ ok: false, reason: 'not_owner' }, 403);
        const n = Math.min(30, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10) || 14)), rows = [];
        for (let i = 0; i < n; i++) {
          const row = await env.HEALTH_DATA.get('health:' + token + ':' + daysAgo(i), 'json');
          if (row && row.source === 'garmin') rows.push(row);
        }
        return gJson(rows);
      }
      if (path === '/garmin/activities' && request.method === 'GET') {
        if (!env.GARMIN_OWNER_TOKEN || token !== env.GARMIN_OWNER_TOKEN) return gJson({ ok: false, reason: 'not_owner' }, 403);
        const raw = await env.HEALTH_DATA.get('garmin:' + token + ':activities') || '[]';
        return new Response(raw, { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return gJson({ ok: false, reason: 'not_found' }, 404);
    }

    return new Response('Not found', { status: 404 });
  },

  // Every two hours, if a cron trigger is set on the Worker (Settings, Triggers, Cron).
  async scheduled(event, env, ctx) {
    if (env.GARMIN_PERSONAL_KEY && env.GARMIN_OWNER_TOKEN)
      ctx.waitUntil(garminSync(env, env.GARMIN_OWNER_TOKEN, { force: true }));
  },
};
