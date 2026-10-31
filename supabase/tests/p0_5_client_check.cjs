#!/usr/bin/env node
// P0-5, the app side: checks the company's cancellation code without a
// device, a server or a test framework. The app's TypeScript is compiled on
// the fly; the Supabase client is a recorder that answers as the server
// would; React Native and Expo modules are inert stand-ins. Nothing is sent
// anywhere.
//
//   node supabase/tests/p0_5_client_check.cjs
//
// Covers lib/bookings.ts cancelBookingByCompany (the server function, its
// answers, the fallback for a server without it), lib/companyCancel.ts (when
// the cancel button shows, the message for each refusal),
// lib/groupBooking.ts deriveConvoyMasterStatus, and that every text the
// screens show exists in all four languages.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

// --- a Supabase client that records and answers ------------------------------
const calls = [];
let rpcAnswer = () => ({ data: null, error: null });
let tableAnswers = [];
function builder(table) {
  const q = { table, ops: [] };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        const answer = tableAnswers.shift() || { data: null, error: null };
        calls.push({ kind: 'from', ...q });
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
    return Promise.resolve(rpcAnswer(name, args));
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { cancelBookingByCompany } = require(path.join(ROOT, 'lib/bookings.ts'));
const { companyCanCancelBooking, companyCancelRefusalKey } = require(path.join(ROOT, 'lib/companyCancel.ts'));
const { deriveConvoyMasterStatus } = require(path.join(ROOT, 'lib/groupBooking.ts'));

const BOOKING = '11111111-2222-4333-8444-555555555555';
const COMPANY = '99999999-8888-4777-8666-555555555555';

(async () => {
  // 1. cancelBookingByCompany: the server function
  calls.length = 0;
  rpcAnswer = () => ({ data: { ok: true, code: 'cancelled', previous_status: 'accepted', driver_told: true, message: 'x' }, error: null });
  let r = await cancelBookingByCompany(BOOKING, COMPANY, '  plans changed ');
  check(r.ok === true && r.code === 'cancelled' && r.driverTold === true, 'an accepted booking: cancelled, the driver told', r);
  check(calls.length === 1 && calls[0].name === 'cancel_booking_by_company'
        && same(calls[0].args, { p_booking_id: BOOKING, p_reason: 'plans changed' }),
        'one call to cancel_booking_by_company, with the booking and the trimmed reason', calls);

  calls.length = 0;
  rpcAnswer = () => ({ data: { ok: true, code: 'cancelled', previous_status: 'pending', driver_told: false }, error: null });
  r = await cancelBookingByCompany(BOOKING, COMPANY, '   ');
  check(r.ok === true && r.driverTold === false, 'an open booking: cancelled, nobody to tell', r);
  check(calls[0].args.p_reason === null, 'an empty reason is sent as none', calls[0].args);

  for (const code of ['already_cancelled', 'already_completed', 'already_closed', 'trip_in_progress',
                      'convoy_in_progress', 'forbidden', 'not_found']) {
    rpcAnswer = () => ({ data: { ok: false, code, message: 'server text' }, error: null });
    r = await cancelBookingByCompany(BOOKING, COMPANY);
    check(r.ok === false && r.code === code && r.error && r.error.message === 'server text',
          `the server's refusal "${code}" reaches the screen as is`, r);
  }
  rpcAnswer = () => ({ data: { ok: false, code: 'something_new' }, error: null });
  r = await cancelBookingByCompany(BOOKING, COMPANY);
  check(r.ok === false && r.code === 'failed', 'an answer the app does not know is a failure, not a success', r);

  calls.length = 0;
  rpcAnswer = () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
  r = await cancelBookingByCompany(BOOKING, COMPANY);
  check(r.ok === false && r.code === 'failed' && calls.length === 1,
        'a refused call (not signed in) fails, and nothing else is tried', { r, calls });

  calls.length = 0;
  r = await cancelBookingByCompany('not-a-booking', COMPANY);
  check(r.ok === false && r.code === 'not_found' && calls.length === 0, 'a malformed booking id never reaches the server', r);

  // 2. the fallback, for a server without cancel_booking_by_company
  for (const missing of ['PGRST202', '42883']) {
    calls.length = 0;
    rpcAnswer = () => ({ data: null, error: { code: missing, message: 'function not found' } });
    tableAnswers = [{ data: { id: BOOKING, is_group_master: false }, error: null }, { data: { id: BOOKING }, error: null }];
    r = await cancelBookingByCompany(BOOKING, COMPANY);
    const upd = calls.find((c) => c.kind === 'from' && c.ops.some((o) => o[0] === 'update'));
    check(r.ok === true && r.code === 'cancelled' && upd
          && upd.ops.some((o) => o[0] === 'eq' && o[1] === 'status' && o[2] === 'pending')
          && upd.ops.some((o) => o[0] === 'eq' && o[1] === 'company_id' && o[2] === COMPANY),
          `server without the function (${missing}): the old update of a pending booking of this company`, calls);
  }
  rpcAnswer = () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
  tableAnswers = [{ data: { id: BOOKING, is_group_master: false }, error: null }, { data: null, error: null }];
  r = await cancelBookingByCompany(BOOKING, COMPANY);
  check(r.ok === false && r.code === 'pending_only', '... which, for a booking no longer pending, says only pending ones can be cancelled there', r);
  tableAnswers = [{ data: null, error: null }];
  r = await cancelBookingByCompany(BOOKING, COMPANY);
  check(r.ok === false && r.code === 'not_found', '... and for a booking that is not this company\'s, not found', r);
  tableAnswers = [];

  // 3. when the cancel button shows
  const b = (status, extra) => ({ status, is_group_master: false, ...extra });
  const m = (status) => ({ status, is_group_master: true });
  const legs = (...s) => s.map((status, i) => ({ id: `leg${i}`, status }));
  check(companyCanCancelBooking(b('pending')) && companyCanCancelBooking(b('accepted')),
        'a pending or accepted booking can be cancelled by its company');
  check(!['in_progress', 'completed', 'cancelled', 'rejected'].some((s) => companyCanCancelBooking(b(s))),
        'a trip in progress, a finished, cancelled or declined booking shows no cancel');
  check(companyCanCancelBooking(m('pending')) && companyCanCancelBooking(m('accepted')),
        'a convoy on the full list (its cars unknown there): by its status');
  check(!companyCanCancelBooking(m('in_progress')) && !companyCanCancelBooking(m('completed'))
        && !companyCanCancelBooking(m('cancelled')),
        'a convoy on the road, finished or cancelled: no cancel');
  check(companyCanCancelBooking(m('accepted'), legs('accepted', 'pending')), 'a convoy whose cars wait: cancel shows');
  check(!companyCanCancelBooking(m('accepted'), legs('in_progress', 'pending')), 'a convoy with a car on the road: no cancel');
  check(!companyCanCancelBooking(m('cancelled'), legs('pending')), 'a cancelled convoy never shows cancel, whatever its cars say');

  // 4. a convoy's own status from its cars
  const d = (...s) => deriveConvoyMasterStatus(legs(...s));
  check(d('completed', 'cancelled') === 'completed' && d('completed', 'rejected') === 'completed',
        'all cars finished, some done and some cancelled: completed (was: pending, as if still open)');
  check(d('cancelled', 'rejected') === 'cancelled' && d('cancelled') === 'cancelled', 'every car cancelled: cancelled');
  check(d('in_progress', 'pending') === 'in_progress' && d('accepted', 'pending') === 'accepted'
        && d('pending', 'cancelled') === 'pending' && d('completed', 'completed') === 'completed' && d() === 'pending',
        'the other cases are as before');

  // 5. the words, in all four languages
  const locales = Object.fromEntries(['ka', 'en', 'ru', 'hy'].map((l) => [l, JSON.parse(fs.readFileSync(path.join(ROOT, `src/locales/${l}.json`), 'utf8'))]));
  const has = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  const refusals = ['already_cancelled', 'already_completed', 'already_closed', 'trip_in_progress', 'convoy_in_progress',
                    'forbidden', 'not_found', 'pending_only'];
  check(refusals.every((c) => companyCancelRefusalKey(c)) && companyCancelRefusalKey('failed') === null,
        'every refusal has its own message; an unexpected failure shows the error itself');
  const keys = [...refusals.map(companyCancelRefusalKey),
    'companyCancel.title', 'companyCancel.confirmButton', 'companyCancel.confirmWithDriver', 'companyCancel.confirmConvoy',
    'companyCancel.successDriverTold', 'companyDashboard.cancelConfirm', 'companyDashboard.cancelSuccess',
    'companyDashboard.cancelFailed', 'companyDashboard.sessionInactive', 'companyDashboard.cancelBooking',
    'companyDashboard.moreActive', 'companyDashboard.fullHistory', 'common.no', 'common.error', 'company.driverDefault'];
  for (const [l, dict] of Object.entries(locales)) {
    const missing = keys.filter((k) => typeof has(dict, k) !== 'string' || !has(dict, k).trim());
    check(missing.length === 0, `every text the cancellation shows exists in ${l}`, missing);
  }
  check(Object.values(locales).every((dict) => has(dict, 'companyCancel.confirmWithDriver').includes('{{name}}')
                                              && has(dict, 'companyDashboard.moreActive').includes('{{count}}')),
        'the driver\'s name and the count have their place in every language');

  console.log(`1..${n}`);
  if (failed) {
    console.log(`# ${failed} of ${n} failed`);
    process.exit(1);
  }
  console.log(`# all ${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
