// Build a REAL .FIT file with Garmin's own encoder, so the decoder is tested
// against the actual format rather than against my idea of it.
import { Encoder, Profile } from '/home/user/training-app/node_modules/@garmin/fitsdk/src/index.js';
import { writeFileSync } from 'node:fs';
const enc = new Encoder();
const EPOCH = 631065600000;
const start = new Date('2026-09-05T06:30:00Z');
enc.onMesg(Profile.MesgNum.FILE_ID, {
  type:'activity', manufacturer:'garmin', product:1, timeCreated:start, serialNumber:1234,
});
enc.onMesg(Profile.MesgNum.SESSION, {
  timestamp: new Date(start.getTime()+ 3245*1000),
  startTime: start,
  sport: 'running',
  subSport: 'road',
  totalElapsedTime: 3245.0,      // s
  totalTimerTime: 3210.5,        // s
  totalDistance: 12345.67,       // m  → 12.35 km
  avgSpeed: 3.846,               // m/s
  avgHeartRate: 154,
});
writeFileSync(process.argv[2], Buffer.from(enc.close()));
console.log('wrote a real .FIT:', process.argv[2]);
