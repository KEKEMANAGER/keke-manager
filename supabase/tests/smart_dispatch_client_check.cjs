#!/usr/bin/env node
// Smart dispatch, the app side: checks the drivers' open-jobs list and the
// new-job push handling without a device, a server or a test framework. The
// app's TypeScript is compiled on the fly; the Supabase client is a recorder
// that answers as the server would; React Native and Expo modules are inert
// stand-ins. Nothing is sent anywhere.
//
//   node supabase/tests/smart_dispatch_client_check.cjs
//
// Covers lib/bookings.ts fetchOpenPendingBookingsForDriver: the server's
// driver_matching_open_jobs decides the list (an economy job the server shows
// a comfort driver stays in it), the driver's closed calendar still hides an
// open job (not one offered to him by name), the "add a car" hint, a server
// error, and the app's own filter on a server without the function. And that
// components/PushNotificationRoot.native.tsx no longer re-checks a new-job
// push against the app's class and seat rule.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

// --- a Supabase client that records and answers ------------------------------
// answers by table or function name: tables[name](ops) / rpcs[name](args)
const calls = [];
let tables = {};
let rpcs = {};
function builder(table) {
  const q = { table, ops: [] };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        calls.push({ kind: 'from', ...q });
        const answer = tables[table] ? tables[table](q.ops) : { data: null, error: null };
        return (resolve) => resolve(answer);
      }
      return (...args) => { q.ops.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
const supabase = {
  rpc(name, args) {
    calls.push({ kind: 'rpc', name, args });
    return Promise.resolve(rpcs[name] ? rpcs[name](args) : { data: null, error: { code: 'PGRST202', message: 'no such function' } });
  },
  from(table) { return builder(table); },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {},
  auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
};

// --- inert stand-ins for native modules ----------------------------------------
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
  if (/(^|\/)supabase$/.test(request) && parent && parent.filename.startsWith(path.join(ROOT, 'lib'))) {
    return { supabase };
  }
  if (/src\/lib\/i18n$/.test(request)) return { __esModule: true, default: { t: (k) => k, language: 'ka' } };
  if (NATIVE.test(request)) return inert();
  return origLoad.apply(this, arguments);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
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
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    module._compile(out, filename);
  };
}

// --- a tiny runner ------------------------------------------------------------
let n = 0;
let failed = 0;
function check(ok, what, detail) {
  n += 1;
  if (ok) {
    console.log(`ok ${n} - ${what}`);
  } else {
    failed += 1;
    console.log(`not ok ${n} - ${what}${detail === undefined ? '' : `\n#   got: ${JSON.stringify(detail)}`}`);
  }
}

const { fetchOpenPendingBookingsForDriver } = require(path.join(ROOT, 'lib/bookings.ts'));

const ME = '11111111-2222-4333-8444-555555555555';
const day = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
// open jobs as the server sends them (summaries)
const job = (id, cls, hours, extra = {}) => ({
  id, status: 'pending', kind: 'transfer', vehicle_type: 'minivan', vehicle_class: cls,
  date_display: day(hours), driver_id: null, created_at: day(-1), from_location: 'Tbilisi airport', to_location: 'Hotel',
  price_gel: 150, ...extra,
});
const ECO = job('aaaaaaaa-0000-4000-8000-000000000001', 'economy', 48);
const COMF = job('aaaaaaaa-0000-4000-8000-000000000002', 'comfort', 72);
const BUSY = job('aaaaaaaa-0000-4000-8000-000000000003', 'comfort', 96);
const OFFER = job('aaaaaaaa-0000-4000-8000-000000000004', 'comfort', 96, { driver_id: ME });

// a comfort driver, verified, one active comfort minivan; his calendar is closed 95-99 h from now
function comfortDriver() {
  tables = {
    profiles: () => ({ data: { id: ME, vehicle_type: 'minivan', vehicle_class: 'comfort', push_token: null, is_verified: true }, error: null }),
    users: () => ({ data: { is_verified: true, is_guide_driver: false, is_hired_driver: false, languages: [] }, error: null }),
    vehicles: () => ({ data: [{ type: 'minivan', class: 'comfort' }], error: null }),
    driver_schedules: () => ({ data: [{ id: 's1', driver_id: ME, booking_id: null, start_time: day(95), end_time: day(99), source: 'manual' }], error: null }),
  };
}
const ids = (rows) => rows.map((r) => r.id).sort().join(',');

(async () => {
  // 1. the server decides the list
  comfortDriver();
  rpcs = { driver_matching_open_jobs: () => ({ data: [ECO, COMF, BUSY, OFFER], error: null }) };
  calls.length = 0;
  let r = await fetchOpenPendingBookingsForDriver(ME);
  check(!r.error && ids(r.data) === ids([ECO, COMF, OFFER]),
        'the list is what the server sends, less the open job on his closed day', { error: r.error && r.error.message, ids: ids(r.data) });
  check(r.data.some((b) => b.id === ECO.id),
        'an economy job the server shows this comfort driver (its third wave went out) stays in his list', ids(r.data));
  check(r.data.some((b) => b.id === OFFER.id), 'a job offered to him by name stays, even on his closed day', ids(r.data));
  const rpcCalls = calls.filter((c) => c.kind === 'rpc').map((c) => c.name);
  check(rpcCalls.length === 1 && rpcCalls[0] === 'driver_matching_open_jobs', 'one server call: driver_matching_open_jobs', rpcCalls);
  check(!calls.some((c) => c.kind === 'from' && c.table === 'vehicles'),
        'the app no longer reads his cars to filter by class itself', calls.map((c) => c.table || c.name));
  check(!calls.some((c) => c.kind === 'rpc' && c.name === 'driver_open_jobs'), 'nor the unfiltered list', rpcCalls);

  // 2. nothing for him: why
  rpcs = {
    driver_matching_open_jobs: () => ({ data: [], error: null }),
    current_driver_can_take_jobs: () => ({ data: false, error: null }),
  };
  r = await fetchOpenPendingBookingsForDriver(ME);
  check(r.data.length === 0 && r.hint === 'profile_vehicle_required' && !r.error,
        'an empty list from a server that will not give him jobs yet: the "add an approved car" hint', r);
  rpcs.current_driver_can_take_jobs = () => ({ data: true, error: null });
  r = await fetchOpenPendingBookingsForDriver(ME);
  check(r.data.length === 0 && r.hint === undefined && !r.error, 'an empty list for a driver who may take jobs: no hint', r);

  // 3. a server error is shown, not papered over with the old filter
  rpcs = { driver_matching_open_jobs: () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }) };
  calls.length = 0;
  r = await fetchOpenPendingBookingsForDriver(ME);
  check(r.error && /timeout/.test(r.error.message) && r.data.length === 0, 'a server error reaches the screen', r.error && r.error.message);
  check(!calls.some((c) => c.kind === 'rpc' && c.name === 'driver_open_jobs'), '... without falling back to the old filter',
        calls.map((c) => c.name || c.table));

  // 4. a server without driver_matching_open_jobs: the app's own filter, as before
  for (const code of ['PGRST202', '42883']) {
    comfortDriver();
    rpcs = {
      driver_matching_open_jobs: () => ({ data: null, error: { code, message: 'function not found' } }),
      driver_open_jobs: () => ({ data: [ECO, COMF, BUSY, OFFER], error: null }),
    };
    calls.length = 0;
    r = await fetchOpenPendingBookingsForDriver(ME);
    check(!r.error && ids(r.data) === ids([COMF, OFFER]),
          `no such function (${code}): the old list — his class only, his calendar, his offer`, { ids: ids(r.data) });
    check(calls.some((c) => c.kind === 'rpc' && c.name === 'driver_open_jobs'), `(${code}) read through driver_open_jobs`,
          calls.map((c) => c.name || c.table));
  }

  // 5. a driver KEKE has not verified gets nothing, and the server is not asked
  tables = {
    profiles: () => ({ data: { id: ME, vehicle_type: 'minivan', vehicle_class: 'comfort', push_token: null, is_verified: false }, error: null }),
    users: () => ({ data: { is_verified: false }, error: null }),
  };
  rpcs = { driver_matching_open_jobs: () => ({ data: [ECO], error: null }) };
  calls.length = 0;
  r = await fetchOpenPendingBookingsForDriver(ME);
  check(r.data.length === 0 && !r.hint && !r.error, 'not verified: an empty list, no hint, as before', r);
  check(!calls.some((c) => c.kind === 'rpc'), 'and no server call', calls.map((c) => c.name || c.table));

  // 6. a new-job push is shown as the server sent it
  const root = fs.readFileSync(path.join(ROOT, 'components/PushNotificationRoot.native.tsx'), 'utf8');
  check(!/driverProfileMatchesBooking/.test(root),
        "PushNotificationRoot no longer re-checks a new-job push against the app's class and seat rule");
  check(/data\?\.type === 'new_booking' \|\|/.test(root), '... and still shows it as a booking notice');

  console.log(`1..${n}`);
  if (failed) {
    console.log(`# ${failed} of ${n} failed`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
