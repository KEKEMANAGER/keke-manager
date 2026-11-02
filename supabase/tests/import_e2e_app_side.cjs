// Cross-layer check, step 1 of 3 (see run_import_e2e.sh): the app's own code
// turns reviewed drafts into the booking rows it would insert. Writes them as
// JSON for the server step. Nothing is sent anywhere.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));
const NATIVE = /^(react|react-native|expo|@expo|@react-native|react-native-|expo-|@react-navigation)/;
function inert() {
  const f = function () { return p; };
  const p = new Proxy(f, { get(_t, k) { if (k === '__esModule') return true; if (k === 'then') return undefined; if (k === Symbol.toPrimitive) return () => ''; return p; }, apply() { return p; }, construct() { return p; } });
  return p;
}
// A Supabase client that only records: the body the app hands to
// supabase.from('bookings').insert(...) is exactly what PostgREST receives.
const sent = [];
function builder(table) {
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve(table === 'bookings' ? { data: { id: 'recorded' }, error: null } : { data: null, error: null });
      return (...args) => { if (table === 'bookings' && prop === 'insert') sent.push(args[0]); return chain; };
    },
  });
  return chain;
}
const supabase = {
  from: builder,
  rpc: async () => ({ data: null, error: null }),
  functions: { invoke: async () => ({ data: null, error: null }) },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {},
  auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
};
const origLoad = Module._load;
Module._load = function (request, parent) {
  if (/(^|\/)supabase$/.test(request) && parent && parent.filename.startsWith(path.join(ROOT, 'lib'))) return { supabase };
  if (/src\/lib\/i18n$/.test(request)) return { __esModule: true, default: { t: (k) => k, language: 'ka' } };
  if (NATIVE.test(request)) return inert();
  return origLoad.apply(this, arguments);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  try { return origResolve.call(this, request, parent, ...rest); } catch (e) {
    if (parent && parent.filename && request.startsWith('.')) {
      const base = path.resolve(path.dirname(parent.filename), request);
      for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return base + ext;
    }
    throw e;
  }
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = function (module, filename) {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    module._compile(out, filename);
  };
}
const imp = require(path.join(ROOT, 'lib/bookingImport.ts'));
const ctx = { companyUserId: process.argv[3], companyName: 'Test Transport', createdByName: 'Operator' };
const transfer = imp.withFormDefaults({
  kind: 'transfer', date_display: '2026-12-20T12:30:00.000Z', pickup_time: '16:30', from_location: 'Radisson Blu Iveria, Tbilisi',
  from_location_type: 'hotel', to_location: 'Kutaisi International Airport', to_location_type: 'airport', route: null,
  passengers: 5, vehicle_type: 'minivan', vehicle_class: 'comfort', flight_number: 'W6 4470', flight_direction: 'departure',
  flight_at: '2026-12-20T17:15:00.000Z', passenger_name: 'Test Guest', passenger_phone: '+995 500 00 00 00', meet_greet: true,
  sign_text: 'TEST', client_price: 380, payment_method: null, comment: 'Багаж: 7 чемоданов', hotel: null, tour_days: null,
  transfer_in: null, transfer_out: null, required_languages: ['ru'],
});
const tour = imp.withFormDefaults({
  kind: 'tour', date_display: null, pickup_time: null, from_location: null, to_location: null, route: null, passengers: 14,
  vehicle_type: 'microbus', vehicle_class: 'comfort', flight_number: null, flight_direction: null, passenger_name: null,
  passenger_phone: null, meet_greet: true, sign_text: 'NL-2611', client_price: 6600, payment_method: null, comment: null, hotel: null,
  tour_days: [
    { day: 1, date: '2026-12-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'Old Town', hotel: 'Hotel Stamba' },
    { day: 2, date: '2026-12-14', fromPlace: 'Tbilisi', toPlace: 'Telavi', stops: 'Sighnaghi', hotel: 'Schuchmann' },
    { day: 3, date: '2026-12-15', fromPlace: 'Telavi', toPlace: 'Tbilisi', stops: 'Gremi', hotel: null },
  ],
  transfer_in: { date_display: '2026-12-11T23:40:00.000Z', pickup_time: '03:40', from: 'Tbilisi International Airport', from_type: 'airport', to: 'Hotel Stamba', to_type: 'hotel', flight: 'KL 3150' },
  transfer_out: { date_display: '2026-12-15T23:30:00.000Z', pickup_time: '03:30', from: 'Hotel Stamba', from_type: 'hotel', to: 'Tbilisi International Airport', to_type: 'airport', flight: 'TK 383', flight_at: '2026-12-16T02:10:00.000Z' },
  required_languages: ['en'],
});
const bookings = require(path.join(ROOT, 'lib/bookings.ts'));
// The id the server returns from "approve"; the database step puts the real one in its place.
const APPROVAL = '00000000-0000-4000-8000-0000000000e2';
(async () => {
  const cases = [];
  for (const [name, draft] of [['transfer', transfer], ['tour', tour]]) {
    const missing = imp.missingRequiredFields(draft);
    if (missing.length) { console.error(`${name}: the form itself would refuse it: ${missing.join('; ')}`); process.exit(1); }
    // What createImportedBooking sends to "approve" ...
    const insert = imp.draftToInsertInput(draft, ctx);
    // ... and what insertBooking then sends to the database. (Driver
    // notifications run only after the insert; they are switched off here so
    // nothing but the insert body is exercised.)
    sent.length = 0;
    const r = await bookings.insertBooking({ ...insert, import_approval_id: APPROVAL, skip_driver_notifications: true });
    if (r.error || sent.length !== 1) { console.error(`${name}: insertBooking did not send one booking: ${r.error && r.error.message}`); process.exit(1); }
    if (sent[0].import_approval_id !== APPROVAL) { console.error(`${name}: the approval id was not sent`); process.exit(1); }
    cases.push({ name, draft, insert, body: sent[0] });
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(cases, null, 1));
  console.log(`app side: ${cases.length} bookings built with the app's own draftToInsertInput and insertBooking`);
})().catch((e) => { console.error(e); process.exit(1); });
