#!/usr/bin/env node
// GPS P0, the app side: checks the phone's trip GPS code without a device, a
// server or a test framework. The app's TypeScript is compiled on the fly; the
// Supabase client is a recorder that answers as the server would; the phone's
// location service, task manager and storage are stand-ins that remember what
// was asked of them. Nothing is sent anywhere.
//
//   node supabase/tests/gps_p0_client_check.cjs
//
// Covers (P0-2) lib/backgroundLocation.native.ts - stopTripSharing, the trip
// task's own check that its trip is still under way, reviveTripGps;
// lib/tripGpsKeeper.ts (what the app does when it comes to the front); every
// screen that ends a trip calls stopTripSharing; (P0-1) lib/companyGps.ts asks
// only for trips in progress; (P0-3) lib/signalAge.ts - live / weak / lost and
// their colours - used by every company and fleet map, its texts in all four
// languages.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

// --- a Supabase client that records and answers ------------------------------
const calls = [];
let answer = () => ({ data: null, error: null });
function builder(table) {
  const q = { kind: 'from', table, ops: [] };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        calls.push(q);
        const a = answer(q) || { data: null, error: null };
        return (resolve) => resolve(a);
      }
      return (...args) => { q.ops.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
const supabase = {
  rpc(name, args) { calls.push({ kind: 'rpc', name, args }); return Promise.resolve({ data: null, error: null }); },
  from(table) { return builder(table); },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {},
  auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
};
const op = (q, name) => q.ops.find((o) => o[0] === name);
const isStatusQuery = (q) => q.table === 'bookings' && op(q, 'select') && op(q, 'select')[1] === 'status';

// --- the phone: storage, location service, task manager -----------------------
const store = new Map();
const AsyncStorage = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => { store.set(k, String(v)); },
  removeItem: async (k) => { store.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => store.delete(k)); },
  multiSet: async (pairs) => { pairs.forEach(([k, v]) => store.set(k, String(v))); },
};
const phone = { running: false, started: 0, stopped: 0 };
const Location = {
  Accuracy: { High: 4, Balanced: 3 },
  ActivityType: { AutomotiveNavigation: 2 },
  hasStartedLocationUpdatesAsync: async () => phone.running,
  startLocationUpdatesAsync: async () => { phone.running = true; phone.started += 1; },
  stopLocationUpdatesAsync: async () => { phone.running = false; phone.stopped += 1; },
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
  getBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 41.7, longitude: 44.8 }, timestamp: Date.now() }),
  getLastKnownPositionAsync: async () => null,
};
const tasks = {};
const TaskManager = {
  isTaskDefined: (name) => name in tasks,
  defineTask: (name, fn) => { tasks[name] = fn; },
};

// --- inert stand-ins for everything else native -------------------------------
function inert() {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(_t, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (prop === Symbol.toPrimitive) return () => '';
      return p;
    },
    apply() { return p; },
    construct() { return p; },
  });
  return p;
}
const NATIVE = /^(react|react-native|expo|@expo|@react-native|react-native-|expo-|@react-navigation)/;
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (/(^|\/)supabase$/.test(request) && parent && parent.filename.startsWith(path.join(ROOT, 'lib'))) return { supabase };
  if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: AsyncStorage };
  if (request === 'expo-location') return Location;
  if (request === 'expo-task-manager') return TaskManager;
  if (request === 'react-native') return { Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove() {} }) } };
  if (/\/tripProgress$/.test(request)) return { recordPoint: async () => null, notifyArrival: async () => {} };
  if (/\/tripEvents$/.test(request)) return { flushTripEventQueue: async () => 0 };
  if (/\/usersDirectory$/.test(request)) return { USERS_DIRECTORY: 'users' };
  if (/constants\/theme$/.test(request)) {
    return { COLORS: { error: '#EF4444', textMuted: '#9CA3AF', gold: '#F5A623', blue: '#3B82F6' } };
  }
  if (NATIVE.test(request)) return inert();
  return origLoad.apply(this, arguments);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  // On the phone Metro picks backgroundLocation.native.ts.
  if (/(^|\/)backgroundLocation$/.test(request) && parent && parent.filename.startsWith(ROOT)) {
    return path.join(ROOT, 'lib/backgroundLocation.native.ts');
  }
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (e) {
    if (parent && parent.filename && request.startsWith('.')) {
      const base = path.resolve(path.dirname(parent.filename), request);
      for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        if (fs.existsSync(base + ext)) return base + ext;
      }
    }
    throw e;
  }
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = function (module, filename) {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    module._compile(out, filename);
  };
}
global.__DEV__ = false;

// --- a tiny runner ------------------------------------------------------------
let n = 0;
let failed = 0;
function check(ok, what, detail) {
  n += 1;
  if (ok) console.log(`ok ${n} - ${what}`);
  else {
    failed += 1;
    console.log(`not ok ${n} - ${what}${detail === undefined ? '' : `\n#   got: ${JSON.stringify(detail)}`}`);
  }
}

const bg = require(path.join(ROOT, 'lib/backgroundLocation.native.ts'));
const { checkTripGps } = require(path.join(ROOT, 'lib/tripGpsKeeper.ts'));
const { fetchCompanyActiveGpsDrivers } = require(path.join(ROOT, 'lib/companyGps.ts'));
const sig = require(path.join(ROOT, 'lib/signalAge.ts'));

const DRIVER = '11111111-2222-4333-8444-555555555555';
const TRIP = '99999999-8888-4777-8666-555555555555';
const OTHER = '77777777-8888-4777-8666-555555555555';
const COPY = { notificationTitle: 'T', notificationBody: 'B', arrivalTitle: 'A', arrivalBody: 'AB' };
const task = () => tasks[bg.LOCATION_TASK_NAME];
const batch = (lat = 41.7) => ({ data: { locations: [{ coords: { latitude: lat, longitude: 44.8 }, timestamp: Date.now() }] } });
const pinWrites = () => calls.filter((q) => q.table === 'driver_locations' && op(q, 'upsert'));
const pinDeletes = () => calls.filter((q) => q.table === 'driver_locations' && op(q, 'delete'));
const statusQueries = () => calls.filter(isStatusQuery);
function scene(status, { running = true, booking = TRIP } = {}) {
  store.clear();
  store.set('bg-location:active-driver-id', DRIVER);
  if (booking) store.set('bg-location:active-booking-id', booking);
  store.set('bg-location:consent', '1');
  store.set('bg-location:options-version', '2');
  phone.running = running; phone.started = 0; phone.stopped = 0;
  calls.length = 0;
  answer = (q) => {
    if (isStatusQuery(q)) {
      if (status === 'offline') return { data: null, error: { message: 'Network request failed' } };
      if (status === 'gone') return { data: null, error: null };
      return { data: { status }, error: null };
    }
    return { data: null, error: null };
  };
}

(async () => {
  check(typeof task() === 'function', 'P0-2: the trip task is defined when the module loads');

  // 1. the trip task finds its trip over
  for (const [status, why] of [['completed', 'finished'], ['cancelled', 'cancelled'], ['rejected', 'declined']]) {
    scene(status);
    await bg.stopTripSharing(null); // forget any earlier answer
    scene(status);
    await task()(batch());
    check(phone.stopped === 1 && !phone.running && pinWrites().length === 0 && pinDeletes().length === 1
          && !store.has('bg-location:active-booking-id'),
          `P0-2: the trip ${why} where the phone was not told: the task stops itself, sends no position and takes the pin off the maps`,
          { stopped: phone.stopped, writes: pinWrites().length, deletes: pinDeletes().length });
  }

  // 2. the trip is under way
  scene('in_progress');
  await bg.stopTripSharing(null);
  scene('in_progress');
  await task()(batch(41.71));
  const w = pinWrites()[0];
  check(phone.stopped === 0 && pinWrites().length === 1 && w && op(w, 'upsert')[1].gps_mode === 'background',
        'P0-2: the trip under way: the position is sent as before', { stopped: phone.stopped, writes: pinWrites().length });
  check(/41\.71/.test(JSON.stringify([...store.values()])), 'P0-2: ... and its road is kept on the phone for upload, as before');
  calls.length = 0;
  await task()(batch(41.80));
  check(statusQueries().length === 0, 'P0-2: ... the trip is asked about at most once a minute, not with every position');

  // 3. no sure answer: the task does not stop on a guess
  scene('offline');
  await bg.stopTripSharing(null);
  scene('offline');
  await task()(batch(41.72));
  check(phone.stopped === 0 && pinWrites().length === 1, 'P0-2: no answer from the server (no internet): the task carries on');
  scene('gone');
  await bg.stopTripSharing(null);
  scene('gone');
  await task()(batch(41.73));
  check(phone.stopped === 0 && pinWrites().length === 1,
        'P0-2: no row back (a sign-in the phone failed to refresh looks the same as "not yours"): the task carries on - the server drops what does not belong to a trip');
  // GPS turned on before the trip starts (an accepted job): it stays on, and keeps no road yet
  scene('accepted');
  await bg.stopTripSharing(null);
  scene('accepted');
  await task()(batch(41.74));
  check(phone.stopped === 0 && pinWrites().length === 1 && !/41\.74/.test(JSON.stringify([...store.values()])),
        'P0-2: GPS turned on for a job not started yet: it stays on (as before), and no road is kept for the trip yet');

  // 4. stopTripSharing and stopTripSharingFor
  scene('in_progress');
  await bg.stopTripSharing(DRIVER);
  check(phone.stopped === 1 && pinDeletes().length === 1 && op(pinDeletes()[0], 'eq')[2] === DRIVER
        && !store.has('bg-location:active-booking-id') && !store.has('bg-location:active-driver-id'),
        'P0-2: stopTripSharing: the task stops, the stored trip is forgotten, the driver’s pin is deleted');
  scene('in_progress');
  check((await bg.stopTripSharingFor(OTHER, DRIVER)) === false && phone.stopped === 0,
        'P0-2: cancelling another booking leaves the running trip alone');
  check((await bg.stopTripSharingFor(OTHER, DRIVER, { evenIfNoneShared: true })) === false && phone.stopped === 0,
        'P0-2: finishing another trip (a fleet owner finishing his driver’s) leaves this phone’s own trip running');
  check((await bg.stopTripSharingFor(TRIP, DRIVER)) === true && phone.stopped === 1,
        'P0-2: cancelling or finishing the trip being shared stops the sharing');
  scene('in_progress', { running: false, booking: null });
  check((await bg.stopTripSharingFor(TRIP, DRIVER)) === false && pinDeletes().length === 0,
        'P0-2: cancelling a booking while nothing is shared changes nothing');
  check((await bg.stopTripSharingFor(TRIP, DRIVER, { evenIfNoneShared: true })) === true && pinDeletes().length === 1,
        'P0-2: finishing a trip while nothing is shared still takes the driver’s pin off the maps');

  // 5. the server's silent wake-up for a trip that is over
  scene('completed');
  const r = await bg.reviveTripGps();
  check(r === 'no_trip' && pinWrites().length === 0 && phone.stopped === 1,
        'P0-2: a wake-up for a trip that is over: nothing is sent, the GPS stops', { r, writes: pinWrites().length });
  scene('in_progress', { running: false });
  check((await bg.reviveTripGps()) === 'restarted' && pinWrites().length === 1,
        'P0-2: a wake-up for a trip under way: the position is sent and the trip GPS restarted, as before');

  // 6. the app comes to the front (lib/tripGpsKeeper.ts)
  // The server: `active` is the driver's trip under way (or none); every other booking is completed.
  const keeperAnswer = (active, { error = false } = {}) => (q) => {
    if (q.table !== 'bookings') return { data: null, error: null };
    if (error) return { data: null, error: { message: 'Network request failed' } };
    if (op(q, 'select') && op(q, 'select')[1] === 'id') return { data: active ? { id: active } : null, error: null };
    if (isStatusQuery(q)) {
      const id = (q.ops.find((o) => o[0] === 'eq' && o[1] === 'id') || [])[2];
      return { data: { status: id === active ? 'in_progress' : 'completed' }, error: null };
    }
    return { data: null, error: null };
  };
  scene('x'); answer = keeperAnswer(null);
  check((await checkTripGps(DRIVER, COPY)) === 'stopped' && phone.stopped === 1 && pinDeletes().length === 1,
        'P0-2: the GPS runs but the server says its trip is over: stopped, pin removed');
  scene('x', { booking: null }); answer = keeperAnswer(null);
  check((await checkTripGps(DRIVER, COPY)) === 'stopped' && phone.stopped === 1,
        'P0-2: a GPS task with no trip stored (older app) and no trip under way: stopped');
  scene('x', { booking: null }); answer = keeperAnswer(null, { error: true });
  check((await checkTripGps(DRIVER, COPY)) === 'current' && phone.stopped === 0,
        'P0-2: ... the same without internet: left alone');
  scene('x'); answer = keeperAnswer(OTHER);
  const res2 = await checkTripGps(DRIVER, COPY);
  check(res2 === 'stopped' && phone.stopped === 1 && phone.started === 1 && store.get('bg-location:active-booking-id') === OTHER,
        'P0-2: the GPS runs for a trip that is over while another is under way: stopped, then resumed for the trip under way',
        { res2, stopped: phone.stopped, started: phone.started });
  scene('x'); answer = keeperAnswer(TRIP);
  check((await checkTripGps(DRIVER, COPY)) === 'current' && phone.stopped === 0, 'P0-2: the GPS runs for the trip under way: left alone');
  scene('x'); answer = keeperAnswer(null, { error: true });
  check((await checkTripGps(DRIVER, COPY)) === 'current' && phone.stopped === 0, 'P0-2: no internet: the running GPS is left alone');
  scene('x', { running: false }); answer = keeperAnswer(TRIP);
  check((await checkTripGps(DRIVER, COPY)) === 'resumed' && phone.started === 1, 'P0-2: a trip under way whose GPS the phone ended: resumed, as before');
  scene('x'); answer = (q) => (isStatusQuery(q) ? { data: { status: 'accepted' }, error: null }
                                                 : { data: null, error: null });
  check((await checkTripGps(DRIVER, COPY)) === 'current' && phone.stopped === 0,
        'P0-2: GPS turned on for a job not started yet: left alone');
  scene('x'); answer = (q) => ({ data: null, error: null });
  check((await checkTripGps(DRIVER, COPY)) === 'current' && phone.stopped === 0,
        'P0-2: no row back for its trip (a failed sign-in refresh looks the same): left alone');

  // 7. every screen that ends a trip stops the sharing
  const ends = /\b(completeBooking|completeTourTripWithOdometer|completeTourBooking)\(/;
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, 'app'));
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, 'components'));
  const enders = files.filter((f) => ends.test(fs.readFileSync(f, 'utf8')));
  const missing = enders.filter((f) => !/\bstopTripSharing(For)?\(/.test(fs.readFileSync(f, 'utf8')));
  check(enders.length >= 4 && missing.length === 0,
        `P0-2: every screen that ends a trip calls stopTripSharing (${enders.map((f) => path.relative(ROOT, f)).join(', ')})`,
        missing.map((f) => path.relative(ROOT, f)));
  const bookingsSrc = fs.readFileSync(path.join(ROOT, 'app/(driver)/bookings.tsx'), 'utf8');
  check(/stopTripSharingFor\(item\.id, user\.id\);/.test(bookingsSrc), 'P0-2: a trip the driver cancels from his list stops its sharing (only that trip’s)');

  // 8. the company's map asks only for trips under way (P0-1)
  calls.length = 0;
  answer = () => ({ data: [], error: null });
  await fetchCompanyActiveGpsDrivers('99999999-8888-4777-8666-555555555555');
  const bq = calls.find((q) => q.table === 'bookings');
  check(bq && bq.ops.some((o) => o[0] === 'eq' && o[1] === 'status' && o[2] === 'in_progress')
        && !bq.ops.some((o) => o[0] === 'in' && o[1] === 'status'),
        'P0-1: the company’s GPS map asks only for its trips in progress (not accepted jobs)', bq && bq.ops);

  // 9. live / weak / lost (P0-3)
  const now = Date.parse('2026-11-04T12:00:00Z');
  const ago = (s) => new Date(now - s * 1000).toISOString();
  const states = [0, 30, 89, 91, 599, 601, 3 * 3600, -20].map((s) => sig.signalState(ago(s), now));
  check(JSON.stringify(states) === JSON.stringify(['live', 'live', 'live', 'weak', 'weak', 'lost', 'lost', 'live']),
        'P0-3: live up to 90 s, weak signal up to 10 minutes, lost after (a position a little "ahead" is live)', states);
  check(sig.signalState(null, now) === 'none' && sig.signalState('not a date', now) === 'none', 'P0-3: no position: none');
  check(sig.signalColor(ago(10), '#3B82F6', now) === '#3B82F6' && sig.signalColor(ago(120), '#3B82F6', now) === '#9CA3AF'
        && sig.signalColor(ago(3 * 3600), '#3B82F6', now) === '#EF4444',
        'P0-3: the pin keeps its colour while live, turns grey on a weak signal, red once lost');
  check(sig.isSignalLost(ago(601), now) && !sig.isSignalLost(ago(599), now), 'P0-3: "signal lost" after 10 minutes, as before');
  const companyGpsSrc = fs.readFileSync(path.join(ROOT, 'lib/companyGps.ts'), 'utf8');
  check(/COMPANY_GPS_STALE_MS = SIGNAL_LIVE_MS/.test(companyGpsSrc), 'P0-3: the company GPS list uses the same 90 s rule (was 5 minutes)');
  const maps = ['app/(app)/tracking.tsx', 'app/(app)/gps.tsx', 'app/(driver)/fleet-map.tsx', 'components/LeafletDriverMap.web.tsx'];
  const notUsing = maps.filter((f) => !/from '\.\.\/(\.\.\/)?lib\/signalAge'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  const ownRules = maps.filter((f) => /getTime\(\)\s*>\s*(60_000|90_000)|isStale\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check(notUsing.length === 0 && ownRules.length === 0, 'P0-3: every company and fleet map takes live / weak / lost from lib/signalAge.ts, none keeps its own clock rule', { notUsing, ownRules });
  for (const lang of ['ka', 'en', 'ru', 'hy']) {
    const tr = JSON.parse(fs.readFileSync(path.join(ROOT, `src/locales/${lang}.json`), 'utf8')).tracking || {};
    check(['live', 'weakSignal', 'signalLostAt'].every((k) => typeof tr[k] === 'string' && tr[k].trim())
          && tr.signalLostAt.includes('{{time}}'),
          `P0-3: the three states have their texts in ${lang}`);
  }

  console.log(`1..${n}`);
  if (failed) {
    console.log(`# ${failed} of ${n} failed`);
    process.exit(1);
  }
  console.log(`# all ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
