// -- FIT DECODER ------------------------------------------------------------------------------
// Garmin's original activity file is a FIT file (the published Garmin FIT protocol), delivered by
// the Personal API inside a ZIP. This reads the messages the session review needs - the session
// summary (one per leg in a multisport file), the laps, the per-second records and the strength
// sets - and nothing else. Field numbers and
// scales follow the FIT profile; anything unknown is skipped by its declared size, so a newer
// watch with more fields still decodes.

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z, the FIT time origin, in Unix seconds

// base type -> [size, invalid value]
const BASE = {
  0x00: [1, 0xff], 0x01: [1, 0x7f], 0x02: [1, 0xff], 0x83: [2, 0x7fff], 0x84: [2, 0xffff],
  0x85: [4, 0x7fffffff], 0x86: [4, 0xffffffff], 0x07: [1, null], 0x88: [4, null], 0x89: [8, null],
  0x0a: [1, 0x00], 0x8b: [2, 0x0000], 0x8c: [4, 0x00000000], 0x0d: [1, 0xff],
  0x8e: [8, null], 0x8f: [8, null], 0x90: [8, null],
};

// message -> field number -> [name, scale, offset]
const PROFILE = {
  18: { // session
    253: ['timestamp', 1, 0], 2: ['start_time', 1, 0], 5: ['sport', 1, 0], 6: ['sub_sport', 1, 0],
    7: ['elapsed_s', 1000, 0], 8: ['timer_s', 1000, 0], 9: ['distance_m', 100, 0], 11: ['calories', 1, 0],
    14: ['avg_speed', 1000, 0], 15: ['max_speed', 1000, 0], 16: ['avg_hr', 1, 0], 17: ['max_hr', 1, 0],
    18: ['avg_cadence', 1, 0], 20: ['avg_power', 1, 0], 22: ['ascent_m', 1, 0], 23: ['descent_m', 1, 0],
    24: ['te_aerobic', 10, 0], 26: ['num_laps', 1, 0], 124: ['enh_avg_speed', 1000, 0],
    125: ['enh_max_speed', 1000, 0], 137: ['te_anaerobic', 10, 0],
  },
  19: { // lap
    253: ['timestamp', 1, 0], 2: ['start_time', 1, 0], 7: ['elapsed_s', 1000, 0], 8: ['timer_s', 1000, 0],
    9: ['distance_m', 100, 0], 13: ['avg_speed', 1000, 0], 14: ['max_speed', 1000, 0], 15: ['avg_hr', 1, 0],
    16: ['max_hr', 1, 0], 17: ['avg_cadence', 1, 0], 19: ['avg_power', 1, 0], 21: ['ascent_m', 1, 0],
    23: ['intensity', 1, 0], 24: ['lap_trigger', 1, 0], 71: ['wkt_step_index', 1, 0],
    110: ['enh_avg_speed', 1000, 0], 111: ['enh_max_speed', 1000, 0],
  },
  20: { // record
    253: ['timestamp', 1, 0], 2: ['altitude', 5, 500], 3: ['hr', 1, 0], 4: ['cadence', 1, 0],
    5: ['distance_m', 100, 0], 6: ['speed', 1000, 0], 7: ['power', 1, 0],
    73: ['enh_speed', 1000, 0], 78: ['enh_altitude', 5, 500],
  },
  225: { // set, the reps and load a watch counts in a strength activity; its timestamp is field 254
    254: ['timestamp', 1, 0], 0: ['duration_s', 1000, 0], 3: ['reps', 1, 0], 4: ['weight_kg', 16, 0],
    5: ['set_type', 1, 0], 6: ['start_time', 1, 0], 7: ['category', 1, 0],
  },
};

// exercise_category, as the FIT profile numbers it
const EXERCISE = ['bench_press', 'calf_raise', 'cardio', 'carry', 'chop', 'core', 'crunch', 'curl', 'deadlift', 'flye',
  'hip_raise', 'hip_stability', 'hip_swing', 'hyperextension', 'lateral_raise', 'leg_curl', 'leg_raise', 'lunge',
  'olympic_lift', 'plank', 'plyo', 'pull_up', 'push_up', 'row', 'shoulder_press', 'shoulder_stability', 'shrug',
  'sit_up', 'squat', 'total_body', 'triceps_extension', 'warm_up', 'run'];

const INTENSITY = ['active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval', 'other'];
const SPORT = { 0: 'generic', 1: 'running', 2: 'cycling', 3: 'transition', 4: 'fitness_equipment', 5: 'swimming', 10: 'training', 11: 'walking', 15: 'rowing', 17: 'hiking' };

function readNum(view, pos, type, little) {
  switch (type) {
    case 0x00: case 0x02: case 0x0a: case 0x0d: return view.getUint8(pos);
    case 0x01: return view.getInt8(pos);
    case 0x83: return view.getInt16(pos, little);
    case 0x84: case 0x8b: return view.getUint16(pos, little);
    case 0x85: return view.getInt32(pos, little);
    case 0x86: case 0x8c: return view.getUint32(pos, little);
    case 0x88: return view.getFloat32(pos, little);
    case 0x89: return view.getFloat64(pos, little);
    default: return null;
  }
}

export function decodeFit(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = bytes[0];
  if (headerSize < 12 || String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== '.FIT') throw new Error('not_fit');
  const dataSize = view.getUint32(4, true);
  const end = Math.min(bytes.length, headerSize + dataSize);
  const defs = {};
  const out = { session: null, sessions: [], laps: [], records: [], sets: [] };
  let pos = headerSize, lastTs = 0;

  while (pos < end) {
    const h = bytes[pos++];
    if (h & 0x80) {                                   // compressed timestamp header
      const local = (h >> 5) & 0x03, offset = h & 0x1f;
      let ts = (lastTs & ~0x1f) + offset;
      if (offset < (lastTs & 0x1f)) ts += 0x20;
      lastTs = ts;
      pos = readData(defs[local], ts);
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) {                                   // definition message
      const hasDev = !!(h & 0x20);
      pos++;                                          // reserved
      const little = bytes[pos++] === 0;
      const global = little ? view.getUint16(pos, true) : view.getUint16(pos, false); pos += 2;
      const n = bytes[pos++];
      const fields = [];
      for (let i = 0; i < n; i++) { fields.push({ num: bytes[pos], size: bytes[pos + 1], type: bytes[pos + 2] }); pos += 3; }
      let devSize = 0;
      if (hasDev) { const dn = bytes[pos++]; for (let i = 0; i < dn; i++) { devSize += bytes[pos + 1]; pos += 3; } }
      defs[local] = { global, little, fields, devSize };
    } else {
      pos = readData(defs[local], null);
    }
  }
  return out;

  function readData(def, compressedTs) {
    if (!def) throw new Error('fit_undefined_message');
    const prof = PROFILE[def.global];
    const msg = prof ? {} : null;
    for (const f of def.fields) {
      if (prof && prof[f.num]) {
        const base = BASE[f.type] || BASE[f.type & 0x1f] || [f.size, null];
        const v = f.type === 0x07 ? null : readNum(view, pos, f.type, def.little);
        if (v != null && v !== base[1] && !(typeof v === 'number' && isNaN(v))) {
          const [name, scale, off] = prof[f.num];
          msg[name] = v / scale - off;
        }
      }
      if (f.num === 253 && def.global !== undefined) {
        const t = readNum(view, pos, 0x86, def.little);
        if (t != null && t !== 0xffffffff) lastTs = t;
      }
      pos += f.size;
    }
    pos += def.devSize;
    if (msg) {
      if (compressedTs != null && msg.timestamp == null) msg.timestamp = compressedTs;
      if (def.global === 18) { out.session = msg; out.sessions.push(msg); }
      else if (def.global === 19) out.laps.push(msg);
      else if (def.global === 20) out.records.push(msg);
      else if (def.global === 225) out.sets.push(msg);
    }
    return pos;
  }
}

export function fitTime(t) { return t == null ? null : new Date((t + FIT_EPOCH) * 1000).toISOString(); }

// The compact form the app stores: the summary, every lap, and the records thinned to one point
// every `step` seconds - enough for pace and heart-rate curves, small enough for a phone.
export function compactFit(fit, step) {
  step = step || 10;
  /* A multisport file has one session per leg, transitions included: the summary is all of them,
     and each leg is kept, so its sport, distance and time need no read of its own. */
  const ss = fit.sessions && fit.sessions.length ? fit.sessions : (fit.session ? [fit.session] : []);
  const multi = ss.length > 1;
  const s = multi ? gather(ss) : (ss[0] || {});
  const spd = (o) => (o.enh_avg_speed != null ? o.enh_avg_speed : o.avg_speed);
  const r1 = (v, d) => (v == null ? null : Math.round(v * (d || 1)) / (d || 1));
  const laps = fit.laps.map((l) => ({
    start: fitTime(l.start_time), time_s: r1(l.timer_s != null ? l.timer_s : l.elapsed_s, 10),
    elapsed_s: r1(l.elapsed_s, 10), dist_m: r1(l.distance_m), speed: r1(spd(l), 1000),
    max_speed: r1(l.enh_max_speed != null ? l.enh_max_speed : l.max_speed, 1000),
    hr: r1(l.avg_hr), max_hr: r1(l.max_hr), cadence: l.avg_cadence != null ? Math.round(l.avg_cadence * 2) : null,
    power: r1(l.avg_power), ascent_m: r1(l.ascent_m),
    intensity: l.intensity != null ? INTENSITY[l.intensity] || 'other' : null,
    step: l.wkt_step_index != null ? l.wkt_step_index : null,
  }));
  /* Some watches leave a lap or session average out (or write it as invalid) while recording
     every second. Fill those from the records over the same span, so the review is not blank. */
  const recs = fit.records;
  const span = (from, to) => recs.filter((r) => r.timestamp != null && r.timestamp >= from && r.timestamp < to);
  const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
  fit.laps.forEach((l, i) => {
    const lap = laps[i];
    if (lap.speed == null && lap.dist_m > 0 && lap.time_s > 0) lap.speed = r1(lap.dist_m / lap.time_s, 1000);
    if (lap.hr == null && l.start_time != null) {
      const hrs = span(l.start_time, l.start_time + (l.elapsed_s || 0) + 1).map((r) => r.hr).filter((h) => h > 0);
      if (hrs.length) { lap.hr = Math.round(avg(hrs)); lap.max_hr = lap.max_hr || Math.max.apply(null, hrs); lap.derived = true; }
    }
  });
  const allHr = recs.map((r) => r.hr).filter((h) => h > 0);
  const legHr = (x) => {
    if (x.start_time == null) return null;
    const hrs = span(x.start_time, x.start_time + (x.elapsed_s || x.timer_s || 0) + 1).map((r) => r.hr).filter((h) => h > 0);
    return hrs.length ? Math.round(avg(hrs)) : null;
  };
  const t0 = fit.records.length ? fit.records[0].timestamp : null;
  const series = [];
  let next = 0;
  for (const r of fit.records) {
    if (r.timestamp == null || t0 == null) continue;
    const t = r.timestamp - t0;
    if (t < next) continue;
    next = t + step;
    const sp = r.enh_speed != null ? r.enh_speed : r.speed;
    const alt = r.enh_altitude != null ? r.enh_altitude : r.altitude;
    series.push([t, r.hr != null ? Math.round(r.hr) : null, sp != null ? Math.round(sp * 1000) / 1000 : null,
                 r.cadence != null ? Math.round(r.cadence * 2) : null, alt != null ? Math.round(alt * 10) / 10 : null,
                 r.distance_m != null ? Math.round(r.distance_m) : null]);
  }
  const sets = fit.sets || [];
  return {
    sport: multi ? 'multisport' : SPORT[s.sport] || (s.sport != null ? 'sport_' + s.sport : null),
    start: fitTime(s.start_time), time_s: r1(s.timer_s != null ? s.timer_s : s.elapsed_s, 10),
    elapsed_s: r1(s.elapsed_s, 10), dist_m: r1(s.distance_m), speed: r1(spd(s), 1000),
    hr: s.avg_hr != null ? r1(s.avg_hr) : (allHr.length ? Math.round(avg(allHr)) : null),
    max_hr: s.max_hr != null ? r1(s.max_hr) : (allHr.length ? Math.max.apply(null, allHr) : null),
    cadence: s.avg_cadence != null ? Math.round(s.avg_cadence * 2) : null,
    ascent_m: r1(s.ascent_m), calories: r1(s.calories),
    te_aerobic: r1(s.te_aerobic, 10), te_anaerobic: r1(s.te_anaerobic, 10),
    laps, series, series_fields: ['t', 'hr', 'speed', 'cadence', 'alt', 'dist_m'], series_step: step,
    // working sets only, as [offset from the first record (s), duration (s), reps, kg, exercise]
    sets: sets.filter((x) => x.set_type === 1).map((x) => [
      x.start_time != null && t0 != null ? x.start_time - t0 : null, r1(x.duration_s, 10),
      x.reps != null ? x.reps : null, x.weight_kg != null ? r1(x.weight_kg, 10) : null,
      x.category != null ? (EXERCISE[x.category] || 'other') : null]),
    rest_s: r1(sets.filter((x) => x.set_type === 0).reduce((a, x) => a + (x.duration_s || 0), 0)),
    ...(multi ? { legs: ss.map((x) => ({
      sport: SPORT[x.sport] || (x.sport != null ? 'sport_' + x.sport : 'other'), sub_sport: x.sub_sport != null ? x.sub_sport : null,
      start: fitTime(x.start_time), time_s: r1(x.timer_s != null ? x.timer_s : x.elapsed_s, 10), dist_m: r1(x.distance_m),
      hr: x.avg_hr != null ? r1(x.avg_hr) : legHr(x) })) } : {}),
  };
}

/* One summary for a multisport file: totals across the legs, heart rate weighted by time. */
function gather(ss) {
  const t = (x) => (x.timer_s != null ? x.timer_s : x.elapsed_s) || 0;
  const sum = (k) => { const v = ss.filter((x) => x[k] != null); return v.length ? v.reduce((a, x) => a + x[k], 0) : null; };
  const max = (k) => { const v = ss.map((x) => x[k]).filter((v) => v != null); return v.length ? Math.max.apply(null, v) : null; };
  const hr = ss.filter((x) => x.avg_hr != null && t(x) > 0), ht = hr.reduce((a, x) => a + t(x), 0);
  const tt = ss.reduce((a, x) => a + t(x), 0), dist = sum('distance_m');
  return { start_time: ss[0].start_time, timer_s: tt, elapsed_s: sum('elapsed_s'), distance_m: dist,
           avg_speed: dist != null && tt > 0 ? dist / tt : null, max_speed: max('max_speed'),
           avg_hr: ht ? hr.reduce((a, x) => a + x.avg_hr * t(x), 0) / ht : null, max_hr: max('max_hr'),
           ascent_m: sum('ascent_m'), calories: sum('calories'), te_aerobic: max('te_aerobic'), te_anaerobic: max('te_anaerobic') };
}

// The Personal API delivers the original file as a ZIP. Read its central directory and inflate
// the first .fit entry (stored or deflated), with the platform's own DecompressionStream.
export async function fitFromZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0x0e || String.fromCharCode(b[8], b[9], b[10], b[11]) === '.FIT') return b;  // already a bare FIT
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip_no_directory');
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('zip_bad_directory');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!/\.fit$/i.test(name)) continue;
    const lnlen = v.getUint16(local + 26, true), lelen = v.getUint16(local + 28, true);
    const data = b.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
    if (method === 0) return data;
    if (method !== 8) throw new Error('zip_method_' + method);
    const ds = new DecompressionStream('deflate-raw');
    const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }
  throw new Error('zip_no_fit');
}
