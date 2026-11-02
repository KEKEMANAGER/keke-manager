#!/usr/bin/env node
// The import review, the app side: checks the code that turns a reviewed
// import into a booking, without a device, a server or a test framework. The
// app's TypeScript is compiled on the fly; the Supabase client is a recorder
// that answers as the server would; React Native and Expo modules are inert
// stand-ins. Nothing is sent anywhere.
//
//   node supabase/tests/import_review_client_check.cjs
//
// Covers lib/bookingImport.ts (unresolvedReviewFields, applyReviewChoice,
// createImportedBooking, approveImportedService and the clientGate flag on
// every read), lib/bookings.ts insertBooking (the approval id goes in only
// for an imported booking; a booking typed into the form inserts exactly as
// before), and that every review text exists in all four languages.
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
let invokeAnswer = () => ({ data: null, error: null });
const supabase = {
  functions: {
    invoke(name, opts) {
      calls.push({ kind: 'invoke', name, body: opts && opts.body });
      return Promise.resolve(invokeAnswer(name, opts && opts.body));
    },
  },
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


const imp = require(path.join(ROOT, 'lib/bookingImport.ts'));
const { insertBooking } = require(path.join(ROOT, 'lib/bookings.ts'));
const COMPANY = '99999999-8888-4777-8666-555555555555';
const ctx = { companyUserId: COMPANY, companyName: 'Test Transport', createdByName: 'Operator' };

const DRAFT = {
  kind: 'transfer', date_display: '2026-11-20T06:00:00.000Z', pickup_time: '10:00',
  from_location: 'Tbilisi International Airport', from_location_type: 'airport', from_location_link: null,
  to_location: 'Hotel Stamba', to_location_type: 'hotel', to_location_link: null, route: null,
  passengers: 4, vehicle_type: 'minivan', vehicle_class: 'comfort', flight_number: 'TK 382', flight_direction: 'arrival',
  flight_at: null, passenger_name: null, passenger_phone: null, meet_greet: false, sign_text: null,
  client_price: 150, payment_method: null, comment: null, hotel: null, tour_days: null, transfer_in: null, transfer_out: null,
  required_languages: null,
};
/**
 * A service as the server answers it: every field the server reviews for the
 * kind it read (`readAs`) has a review — confirmed unless `fields` says otherwise.
 */
const reviewed = (blocking, fields, draft = DRAFT, readAs = draft.kind) => {
  const all = {};
  for (const f of imp.reviewedFieldsFor(readAs)) all[f] = { status: 'confirmed', value: imp.reviewFieldValue(f, draft), reasons: [], required: false };
  return {
    draft: { ...draft }, sources: {}, warnings: [], evidence: null,
    review: { fields: { ...all, ...fields }, blocking, ready: blocking.length === 0, token: 'signed.token' },
  };
};
const PRICE_UNCONFIRMED = { client_price: { status: 'unconfirmed', value: 150, reasons: ['chat_price'], required: true } };

(async () => {
  // 1. what still needs a person; a confirmation holds for the value as it was confirmed
  let s = reviewed(['client_price'], PRICE_UNCONFIRMED);
  check(same(imp.unresolvedReviewFields(s, []), ['client_price']), 'an unconfirmed price needs the agency');
  let conf = { client_price: imp.confirmationKey('client_price', s.draft) };
  check(same(imp.unresolvedReviewFields(s, imp.confirmedNow(conf, s.draft)), []), 'confirmed as it stands, it is settled');
  s.draft = { ...DRAFT, client_price: 180 };
  check(same(imp.unresolvedReviewFields(s, imp.confirmedNow(conf, s.draft)), ['client_price']),
        'corrected afterwards: the confirmation was for 150, so 180 needs confirming (a change is not a confirmation)');
  conf = { client_price: imp.confirmationKey('client_price', s.draft) };
  check(same(imp.unresolvedReviewFields(s, imp.confirmedNow(conf, s.draft)), []), 'the corrected value, confirmed, is settled');
  const missingOnly = reviewed(['client_price'], { client_price: { status: 'missing', value: null, reasons: [], required: true } });
  check(same(imp.unresolvedReviewFields(missingOnly, []), []), 'a missing value is left to the form\'s own required-field check');
  const old = { draft: { ...DRAFT }, sources: {}, warnings: [] };
  check(same(imp.unresolvedReviewFields(old, []), []), 'a service from an older server (no review) has nothing to settle');

  // 1b. the kind changed after the review: what the new kind adds needs a person
  const ok1 = (value) => ({ status: 'confirmed', value, reasons: [], required: true });
  const tourFields = { kind: ok1('tour'), date: ok1('2026-11-13'), time: { status: 'missing', value: null, reasons: [], required: false },
    passengers: ok1(4), vehicle_type: ok1('minivan'), client_price: ok1(150),
    flight_number: { status: 'missing', value: null, reasons: [], required: false }, tour_days: ok1(['2026-11-13']),
    transfer_in: { status: 'missing', value: null, reasons: [], required: false }, transfer_out: { status: 'missing', value: null, reasons: [], required: false } };
  const switched = reviewed([], tourFields, DRAFT, 'tour'); // read as a tour, now a transfer (DRAFT)
  const items = imp.reviewItems(switched);
  check(same(items.map((x) => x.field), ['from_location', 'to_location']) && items.every((x) => x.reasons[0] === 'kind_changed'),
        'a tour turned into a transfer: its places were never reviewed — each needs confirming', items);
  check(same(imp.unresolvedReviewFields(switched, []), ['from_location', 'to_location']), 'and creation waits for them');
  // a value flagged for the old kind that the new kind does not have (a tour's days, on a transfer) asks nothing
  const flaggedDays = reviewed(['tour_days'], { ...tourFields, tour_days: { status: 'unconfirmed', value: ['2026-11-13'], reasons: ['not_in_request'], required: true } }, DRAFT, 'tour');
  check(!imp.reviewItems(flaggedDays).some((x) => x.field === 'tour_days'), 'a tour\'s flagged days do not follow it into a transfer');

  // 1c. what counts as the same value: a day's stops are not its date; a leg moved with the tour is a new value
  const TOUR = { ...DRAFT, kind: 'tour', date_display: '2026-11-13T00:00:00.000Z', pickup_time: null, flight_number: null, from_location: null, to_location: null,
    tour_days: [{ day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'Old Town' }], transfer_in: null,
    transfer_out: { date_display: '2026-11-15T02:00:00.000Z', pickup_time: '06:00', from: 'Hotel Stamba', to: 'Tbilisi International Airport', flight: 'TK 383' } };
  const k0 = imp.confirmationKey('tour_days', TOUR);
  check(imp.confirmationKey('tour_days', { ...TOUR, tour_days: [{ ...TOUR.tour_days[0], stops: 'Mtatsminda' }] }) === k0,
        'typing a day\'s stops does not undo the days\' confirmation');
  check(imp.confirmationKey('tour_days', { ...TOUR, tour_days: [{ ...TOUR.tour_days[0], date: '2026-11-14' }] }) !== k0, 'moving a day does');
  const legConf = { transfer_out: imp.confirmationKey('transfer_out', TOUR) };
  const moved = { ...TOUR, transfer_out: { ...TOUR.transfer_out, date_display: '2026-11-16T02:00:00.000Z' } };
  check(same(imp.confirmedNow(legConf, TOUR), ['transfer_out']) && same(imp.confirmedNow(legConf, moved), []),
        'a departure moved with the tour\'s start needs confirming again');
  check(imp.reviewFieldEdited('from_location', DRAFT, { ...DRAFT, from_location_type: 'address' }) === false,
        'changing a place\'s type is not changing the place');

  // 2. picking one of two readings
  let d = imp.applyReviewChoice(DRAFT, 'passengers', 7);
  check(d.passengers === 7, 'a disagreement on passengers: the reading picked goes in');
  d = imp.applyReviewChoice(DRAFT, 'time', '16:30');
  check(d.pickup_time === '16:30' && d.date_display === '2026-11-20T12:30:00.000Z', 'a time picked keeps the day, Tbilisi time', d);
  d = imp.applyReviewChoice(DRAFT, 'date', '2026-11-21');
  check(d.date_display === '2026-11-21T06:00:00.000Z' && d.pickup_time === '10:00', 'a date picked keeps the time', d);
  check(imp.applyReviewChoice(DRAFT, 'tour_days', ['x']) === DRAFT, 'a tour\'s days are corrected in the form, not by a tap');

  // 3. create: nothing reaches the server or the database while a value is open
  const inserted = [];
  const insert = async (row) => { inserted.push(row); return { id: 'b-1', error: null }; };
  let approveCalls = 0;
  const approve = async (svc, ins, confirmed) => { approveCalls += 1; return { ok: true, approvalId: 'appr-1', confirmed }; };
  let r = await imp.createImportedBooking({ service: reviewed(['client_price'], PRICE_UNCONFIRMED), confirmed: [], ctx, insert, approve });
  check(r.ok === false && r.reason === 'unconfirmed' && approveCalls === 0 && inserted.length === 0,
        'an unconfirmed value: no approval asked, no booking inserted', r);

  // 4. confirmed: approved by the server, inserted with the approval
  r = await imp.createImportedBooking({ service: reviewed(['client_price'], PRICE_UNCONFIRMED), confirmed: ['client_price'], ctx, insert, approve });
  check(r.ok === true && approveCalls === 1 && inserted.length === 1 && inserted[0].import_approval_id === 'appr-1',
        'confirmed: the server approves, the booking carries the approval id', { r, approveCalls, ins: inserted[0] && inserted[0].import_approval_id });
  check(inserted[0].passengers === 4 && inserted[0].price_gel === 150 && inserted[0].client_price === 150,
        'the booking carries the reviewed values');

  // 5. the server refuses: no booking
  inserted.length = 0;
  r = await imp.createImportedBooking({ service: reviewed([], {}), confirmed: [], ctx, insert,
    approve: async () => ({ ok: false, error: 'refused', issues: [{ field: 'client_price', code: 'needs_confirmation' }] }) });
  check(r.ok === false && r.reason === 'not_approved' && inserted.length === 0, 'refused by the server: no booking is inserted', r);

  // 6. the form's own required fields still come first
  const noPrice = reviewed([], {});
  noPrice.draft = { ...DRAFT, client_price: null };
  r = await imp.createImportedBooking({ service: noPrice, confirmed: [], ctx, insert, approve });
  check(r.ok === false && r.reason === 'missing', 'a missing required field stops it before the server', r);

  // 7. an older server: created as before, without an approval
  inserted.length = 0;
  approveCalls = 0;
  r = await imp.createImportedBooking({ service: old, confirmed: [], ctx, insert, approve });
  check(r.ok === true && approveCalls === 0 && inserted.length === 1 && !('import_approval_id' in inserted[0] && inserted[0].import_approval_id),
        'an older server (no review): created exactly as before', { r, approveCalls });

  // 8. approveImportedService sends the token, the draft, the insert and what was confirmed
  calls.length = 0;
  invokeAnswer = () => ({ data: { ok: true, approvalId: 'appr-9' }, error: null });
  const svc = reviewed(['client_price'], PRICE_UNCONFIRMED);
  const ins = imp.draftToInsertInput(svc.draft, ctx);
  const a = await imp.approveImportedService(svc, ins, ['client_price']);
  const call = calls.find((c) => c.kind === 'invoke');
  check(a.ok === true && a.approvalId === 'appr-9', 'the approval id comes back', a);
  check(call && call.name === 'booking-import' && call.body.action === 'approve' && call.body.reviewToken === 'signed.token'
        && same(call.body.confirmed, ['client_price']) && call.body.insert.price_gel === 150,
        'the approval request carries the token, the confirmed fields and the booking to insert', call && call.body);
  // the error carries the raw Response, whose body can be read only once
  invokeAnswer = () => ({ data: null, error: { name: 'FunctionsHttpError', message: 'x',
    context: new Response(JSON.stringify({ ok: false, error: 'no', issues: [{ field: 'passengers', code: 'choose_value' }] }), { status: 422, headers: { 'content-type': 'application/json' } }) } });
  const refused = await imp.approveImportedService(svc, ins, []);
  check(refused.ok === false && refused.error === 'no' && same(refused.issues, [{ field: 'passengers', code: 'choose_value' }]),
        'a refusal comes back with its message and the fields it names (one reading of the answer)', refused);

  // 9. every read says the app shows the review
  calls.length = 0;
  invokeAnswer = () => ({ data: { ok: true, draft: DRAFT, sources: {}, warnings: [], usedAi: false, fileName: 'x', textPreview: '' }, error: null });
  await imp.parseBookingText('Transfer 20/11 10:00 airport to hotel, 4 pax');
  const read = calls.find((c) => c.kind === 'invoke');
  check(read && read.body.clientGate === 2 && read.body.text, 'a read tells the server this app shows the review', read && read.body);

  // 10. insertBooking: the approval id only for an imported booking
  const base = imp.draftToInsertInput(DRAFT, ctx);
  calls.length = 0;
  tableAnswers = [{ data: { id: 'b-2' }, error: null }];
  await insertBooking({ ...base, skip_driver_notifications: true });
  let insertCall = calls.find((c) => c.kind === 'from' && c.table === 'bookings');
  let bodyIns = insertCall && insertCall.ops.find((o) => o[0] === 'insert');
  check(bodyIns && !('import_approval_id' in bodyIns[1]), 'a booking typed into the form inserts exactly as before (no approval id)', bodyIns && Object.keys(bodyIns[1]));
  calls.length = 0;
  tableAnswers = [{ data: { id: 'b-3' }, error: null }];
  await insertBooking({ ...base, skip_driver_notifications: true, import_approval_id: 'appr-1' });
  insertCall = calls.find((c) => c.kind === 'from' && c.table === 'bookings');
  bodyIns = insertCall && insertCall.ops.find((o) => o[0] === 'insert');
  check(bodyIns && bodyIns[1].import_approval_id === 'appr-1', 'an imported booking carries its approval id', bodyIns && bodyIns[1].import_approval_id);

  // 11. every review text in all four languages
  const langs = ['ka', 'en', 'ru', 'hy'].map((l) => [l, JSON.parse(fs.readFileSync(path.join(ROOT, `src/locales/${l}.json`), 'utf8'))]);
  const keysOf = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${p}${k}.`) : [`${p}${k}`]));
  const kaKeys = keysOf(langs[0][1].importBooking.review).sort();
  for (const [l, j] of langs.slice(1)) {
    const k = keysOf(j.importBooking.review || {}).sort();
    check(same(k, kaKeys), `every review text exists in ${l}`, kaKeys.filter((x) => !k.includes(x)));
  }
  const serverReasons = fs.readFileSync(path.join(ROOT, 'supabase/functions/booking-import/review.ts'), 'utf8');
  const used = [...new Set([...serverReasons.matchAll(/reasons\.push\('([a-z_]+)'\)|push\('([a-z_]+)'\)|flag\('[a-z_]+', '([a-z_]+)'\)/g)].map((m) => m[1] || m[2] || m[3]))];
  const known = Object.keys(langs[0][1].importBooking.review.reasons);
  const missing = used.filter((x) => !known.includes(x) && !['no_days'].includes(x));
  check(missing.length === 0, 'every reason the server gives has a text', missing);

  console.log(`1..${n}`);
  if (failed > 0) {
    console.log(`# ${failed} of ${n} failed`);
    process.exit(1);
  }
  console.log(`# all ${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
