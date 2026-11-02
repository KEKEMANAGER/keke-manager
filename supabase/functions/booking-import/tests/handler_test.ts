// booking-import, end to end through the real handler (network stubbed).
//
// Three things are checked for every kind of request:
//   1. a correct request still reads straight through, ready to create;
//   2. a value the readers got wrong, disagree on or cannot vouch for is never
//      handed over as confirmed — it is flagged, and it stops creation;
//   3. nothing in the logs gives away a key or a guest's personal data.
import { assert, assertEquals } from './assert.ts';
import {
  COMPANY, FAKE_API_KEY, fixtureFile, fixtureText, program, run, single, tb, textFile,
} from './harness.ts';

const gate = { clientGate: 2 };

const BASE = [
  'Service: Transfer', 'Date: 20.11.2026', 'Pickup time: 10:00', 'From: Tbilisi International Airport',
  'To: Hotel Stamba, Tbilisi', 'Pax: 4', 'Vehicle: Minivan', 'Class: Comfort', 'Price: 150 GEL', 'Flight: TK 382',
].join('\n');
const AI_BASE = {
  kind: 'transfer', date: '2026-11-20', time: '10:00', from_location: 'Tbilisi International Airport', from_location_type: 'airport',
  to_location: 'Hotel Stamba, Tbilisi', to_location_type: 'hotel', flight_number: 'TK 382', flight_direction: 'arrival',
  passengers: 4, vehicle_type: 'minivan', vehicle_class: 'comfort', client_price: 150, client_price_currency: 'GEL', uncertain_fields: [],
};
const variant = (lines: Record<string, string>) =>
  BASE.split('\n').map((l) => {
    const k = l.split(':')[0];
    return lines[k] !== undefined ? `${k}: ${lines[k]}` : l;
  }).join('\n');

const svc0 = (r: { json: any }) => r.json.services[0];
const status = (r: { json: any }, field: string) => svc0(r).review.fields[field]?.status;
const blocking = (r: { json: any }) => svc0(r).review.blocking as string[];

// ------------------------------------------------------------ 1. controls

Deno.test('control: a clean labelled transfer reads straight through, ready', async () => {
  const r = await run({ ...textFile(BASE), ...gate }, { replies: [single(AI_BASE)] });
  assertEquals(r.status, 200);
  assertEquals(blocking(r), []);
  assertEquals(svc0(r).review.ready, true);
  const d = svc0(r).draft;
  assertEquals([tb(d.date_display), d.passengers, d.client_price, d.flight_number], ['2026-11-20 10:00', 4, 150, 'TK 382']);
  assert(typeof svc0(r).review.token === 'string' && svc0(r).review.token.includes('.'));
});

Deno.test('control: an app without the review gets the same clean draft, untouched', async () => {
  const r = await run(textFile(BASE), { replies: [single(AI_BASE)] });
  const d = svc0(r).draft;
  assertEquals([tb(d.date_display), d.pickup_time, d.passengers, d.client_price, d.from_location], ['2026-11-20 10:00', '10:00', 4, 150, 'Tbilisi International Airport']);
});

Deno.test('control: the Georgian day-tour form is read in full, adults and children added up', async () => {
  const r = await run({ ...(await fixtureFile('day_tour_form_ka.pdf')), ...gate }, {
    replies: [single({ kind: 'day_tour', date: '2026-11-21', time: '07:30', passengers: 3, vehicle_type: 'sedan', vehicle_class: 'comfort', client_price: 300, client_price_currency: 'GEL', required_languages: ['en'] })],
  });
  const d = svc0(r).draft;
  assertEquals([d.kind, tb(d.date_display), d.passengers, d.vehicle_type, d.client_price], ['day_tour', '2026-11-21 07:30', 3, 'sedan', 300]);
  assert(String(d.comment).includes('2 ზრდასრული, 1 ბავშვი'), d.comment);
  assertEquals(blocking(r), []);
});

// ------------------------------------------- 2. the silent errors, fixed

Deno.test('AM/PM: "4:30 PM" is 16:30, and both readers agree', async () => {
  const r = await run({ ...textFile(variant({ 'Pickup time': '4:30 PM' })), ...gate }, { replies: [single({ ...AI_BASE, time: '16:30' })] });
  assertEquals(tb(svc0(r).draft.date_display), '2026-11-20 16:30');
  assertEquals(status(r, 'time'), 'confirmed');
});

Deno.test('a date with no time: no pickup is invented from it ("20.11.2026" is not 20:11)', async () => {
  const noTime = BASE.split('\n').filter((l) => !l.startsWith('Pickup time')).join('\n');
  // the model finds no time either: the time is missing, and creation waits for it
  let r = await run({ ...textFile(noTime), ...gate }, { replies: [single({ ...AI_BASE, time: null })] });
  let s = svc0(r);
  assertEquals(s.draft.pickup_time, null);
  assertEquals(tb(s.draft.date_display), '2026-11-20 00:00');
  assertEquals(s.review.fields.time.status, 'missing');
  assert(s.review.blocking.includes('time'), 'time blocks');
  // the model offers a time the request never gives: kept, but not confirmed — and no made-up 20:11 to choose
  r = await run({ ...textFile(noTime), ...gate }, { replies: [single({ ...AI_BASE, time: '10:00' })] });
  s = svc0(r);
  assertEquals(s.review.fields.time.status, 'unconfirmed');
  assert(s.review.fields.time.reasons.includes('not_in_request'), 'not in the request');
  assert(!JSON.stringify(s.review).includes('20:11'), 'no 20:11 anywhere');
  // a flight cell carrying the date has no flight time in it
  r = await run({ ...textFile(variant({ Flight: 'TK 382 20.11.2026' })), ...gate }, { replies: [single(AI_BASE)] });
  s = svc0(r);
  assertEquals(s.draft.flight_number, 'TK 382');
  assert(!JSON.stringify(s.draft).includes('20:11') && s.draft.flight_at == null, 'no flight time from the date');
  assertEquals(s.review.ready, true);
});

Deno.test('a day the month does not have is not moved to the next month', async () => {
  const r = await run({ ...textFile(variant({ Date: '31.11.2026' })), ...gate }, { replies: [single({ ...AI_BASE, date: null })] });
  const s = svc0(r);
  assertEquals(s.draft.date_display, null);
  assertEquals(s.review.fields.date.status, 'missing');
  assert(s.review.blocking.includes('date'), 'date blocks');
});

Deno.test('prices: "1,250 GEL" is 1250, not 1.25', async () => {
  const r = await run({ ...textFile(variant({ Price: '1,250 GEL' })), ...gate }, { replies: [single({ ...AI_BASE, client_price: 1250 })] });
  assertEquals(svc0(r).draft.client_price, 1250);
  assertEquals(status(r, 'client_price'), 'confirmed');
});

Deno.test('passengers: "12 adults + 2 children" is 14', async () => {
  const r = await run({ ...textFile(variant({ Pax: '12 adults + 2 children', Vehicle: 'Sprinter' })), ...gate }, {
    replies: [single({ ...AI_BASE, passengers: 14, vehicle_type: 'microbus' })],
  });
  assertEquals(svc0(r).draft.passengers, 14);
  assertEquals(status(r, 'passengers'), 'confirmed');
});

Deno.test('currency: "140 EUR" stays in the draft but is not a confirmed lari price', async () => {
  const r = await run({ ...textFile(variant({ Price: '140 EUR' })), ...gate }, { replies: [single({ ...AI_BASE, client_price: 140, client_price_currency: 'EUR' })] });
  assertEquals(svc0(r).draft.client_price, 140);
  assertEquals(status(r, 'client_price'), 'unconfirmed');
  assert(svc0(r).review.fields.client_price.reasons.includes('currency_foreign'));
  assert(blocking(r).includes('client_price'));
  // an app without the review must not get it as a filled field
  const legacy = await run(textFile(variant({ Price: '140 EUR' })), { replies: [single({ ...AI_BASE, client_price: 140, client_price_currency: 'EUR' })] });
  assertEquals(svc0(legacy).draft.client_price, null);
  assert(svc0(legacy).warnings.some((w: string) => w.includes('ფასი') && w.includes('140')));
});

Deno.test('Russian departure form: 16:30 pickup, 5 passengers, flight time kept, EUR flagged', async () => {
  const r = await run({ ...(await fixtureFile('departure_form_ru.docx')), ...gate }, {
    replies: [program({ kind: 'transfer', date: '2026-12-03', time: '16:30', from_location: 'Radisson Blu Iveria, Tbilisi', from_location_type: 'hotel', to_location: 'Kutaisi International Airport', to_location_type: 'airport', flight_number: 'W6 4470', flight_direction: 'departure', flight_time: '21:15', passengers: 5, vehicle_type: 'minivan', client_price: 140, client_price_currency: 'EUR', required_languages: ['ru'], uncertain_fields: [] })],
  });
  const d = svc0(r).draft;
  assertEquals([tb(d.date_display), d.passengers, d.flight_number, tb(d.flight_at)], ['2026-12-03 16:30', 5, 'W6 4470', '2026-12-03 21:15']);
  assertEquals(status(r, 'time'), 'confirmed');
  assertEquals(status(r, 'passengers'), 'confirmed');
  assertEquals(status(r, 'client_price'), 'unconfirmed');
});

Deno.test('8-day programme PDF: no nonsense flight or hotel, name and phone apart, 14 people, USD flagged', async () => {
  const A = {
    kind: 'tour', date: '2026-11-13', passengers: 14, vehicle_type: 'microbus', client_price: 2450, client_price_currency: 'USD',
    passenger_name: 'Pieter van der Berg', passenger_phone: '+31 6 1234 5678',
    tour_days: [
      { day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'Old Town, Narikala', hotel: 'Hotel Stamba' },
      { day: 2, date: '2026-11-14', fromPlace: 'Tbilisi', toPlace: 'Telavi', stops: 'Sighnaghi – Bodbe', hotel: 'Schuchmann Wines Chateau' },
    ],
    transfer_in: { date: '2026-11-12', time: '03:40', from: 'Tbilisi International Airport', from_type: 'airport', to: 'Hotel Stamba', to_type: 'hotel', flight: 'KL 3150' },
    uncertain_fields: [],
  };
  const r = await run({ ...(await fixtureFile('programme_8_days_en.pdf')), ...gate }, { replies: [program(A)] });
  const d = svc0(r).draft;
  assertEquals(d.flight_number, null);
  assertEquals(d.hotel, null);
  assertEquals([d.passenger_name, d.passenger_phone, d.passengers, d.client_price], ['Pieter van der Berg', '+31 6 1234 5678', 14, 2450]);
  assertEquals(status(r, 'passengers'), 'confirmed');
  assertEquals(status(r, 'client_price'), 'unconfirmed');
});

// ------------------------------------------ 3. disagreements now stop

for (const [name, lines, ai, field] of [
  ['passengers 6 vs 7', { Pax: '6' }, { passengers: 7 }, 'passengers'],
  ['pickup 10:00 vs 11:00', {}, { time: '11:00' }, 'time'],
  ['flight TK 382 vs TK 384', {}, { flight_number: 'TK 384' }, 'flight_number'],
  ['price 150 vs 180', {}, { client_price: 180 }, 'client_price'],
  ['date 20.11 vs 21.11', {}, { date: '2026-11-21' }, 'date'],
] as const) {
  Deno.test(`conflict (${name}) blocks, with both readings shown`, async () => {
    const r = await run({ ...textFile(variant(lines as Record<string, string>)), ...gate }, { replies: [single({ ...AI_BASE, ...ai })] });
    assertEquals(status(r, field), 'conflict');
    assert(blocking(r).includes(field));
    assertEquals(svc0(r).review.fields[field].candidates.length, 2);
    assert(svc0(r).warnings.some((w: string) => w.startsWith('დასადასტურებელია')));
  });
}

Deno.test('a conflicting arrival flight makes its pickup time unconfirmed too', async () => {
  const r = await run({ ...textFile(BASE), ...gate }, { replies: [single({ ...AI_BASE, flight_number: 'TK 384' })] });
  assertEquals(status(r, 'time'), 'unconfirmed');
  assert(svc0(r).review.fields.time.reasons.includes('flight_unclear'));
});

Deno.test('Excel schedule the model groups into tours: service type conflict blocks the first service', async () => {
  const leg = (date: string, time: string, from: string, to: string, flight: string) => ({ date, time, from, to, flight });
  const r = await run({ ...(await fixtureFile('schedule_two_groups.xlsx')), ...gate }, {
    replies: [program(
      { kind: 'tour', date: '2026-12-06', passengers: 2, vehicle_type: 'sedan', tour_days: [{ day: 1, date: '2026-12-06', fromPlace: 'Hotel Biltmore', toPlace: 'Hotel Biltmore', stops: 'Kakheti' }], transfer_in: leg('2026-12-05', '10:15', 'Tbilisi Airport', 'Hotel Biltmore', 'LH 2556'), transfer_out: leg('2026-12-07', '05:00', 'Hotel Biltmore', 'Tbilisi Airport', 'LH 2557') },
      { kind: 'tour', date: '2026-12-22', passengers: 9, vehicle_type: 'microbus', tour_days: [{ day: 1, date: '2026-12-22', fromPlace: 'Batumi', toPlace: 'Batumi', stops: 'Gonio' }] },
    )],
  });
  assertEquals(status(r, 'kind'), 'conflict');
  assertEquals(svc0(r).review.ready, false);
});

// ---------------------------------------- 4. values nobody can vouch for

const CHAT = '[01/11/2026, 10:00:00] Nino (Tours): transfer 20/11 at 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382\n[01/11/2026, 10:01:00] Nino (Tours): comfort class please';

Deno.test('chat: values written in the chat are confirmed; its price always needs a look', async () => {
  const r = await run({ text: `${CHAT}\n[01/11/2026, 10:02:00] Nino (Tours): 150 lari ok`, ...gate }, { replies: [program(AI_BASE)] });
  assertEquals(blocking(r), ['client_price']);
  assertEquals(svc0(r).review.fields.client_price.reasons, ['chat_price']);
  for (const f of ['date', 'time', 'from_location', 'to_location', 'passengers', 'vehicle_type', 'flight_number']) {
    assertEquals(status(r, f), 'confirmed', f);
  }
});

Deno.test('a price the chat never mentions is not in the request', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [program({ ...AI_BASE, client_price: 1350 })] });
  assertEquals(status(r, 'client_price'), 'unconfirmed');
  assert(svc0(r).review.fields.client_price.reasons.includes('not_in_request'));
});

Deno.test('the model saying it is unsure keeps the value but does not confirm it', async () => {
  const r = await run({ text: `${CHAT}\n[01/11/2026, 10:05:00] Nino (Tours): sorry 5 people not 4`, ...gate }, {
    replies: [program({ ...AI_BASE, passengers: 5, uncertain_fields: ['passengers'] })],
  });
  assertEquals(svc0(r).draft.passengers, 5);
  assertEquals(status(r, 'passengers'), 'unconfirmed');
  const reasons = svc0(r).review.fields.passengers.reasons;
  assert(reasons.includes('model_unsure') && reasons.includes('chat_several_counts'), String(reasons));
});

Deno.test('a photo: every critical value needs the agency’s confirmation', async () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r = await run({ images: [{ base64: PNG }], ...gate }, { replies: [program(AI_BASE)] });
  for (const f of ['date', 'time', 'passengers', 'client_price']) assertEquals(status(r, f), 'unconfirmed', f);
  assert(svc0(r).review.fields.date.reasons.includes('from_picture'));
});

Deno.test('a cut-off answer: AI values unconfirmed and the agency is told', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [{ kind: 'tool', name: 'submit_program', input: { services: [{ ...AI_BASE, client_price: 150 }] }, stop_reason: 'max_tokens' }] });
  assertEquals(status(r, 'date'), 'unconfirmed');
  assert(svc0(r).review.fields.date.reasons.includes('answer_cut'));
  assert(r.json.warnings.some((w: string) => w.includes('არასრული')));
  assert(r.logRows[0].warnings.includes('ai_truncated'));
});

Deno.test('tour days the request did not date stay undated (no invented dates)', async () => {
  const r = await run({ text: '13 Nov city tour; 14 Nov free day; then Kazbegi; then Kakheti. 4 guests, minivan, 900 lari', ...gate }, {
    replies: [program({ kind: 'tour', date: '2026-11-13', passengers: 4, vehicle_type: 'minivan', client_price: 900, tour_days: [{ day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', stops: 'city' }, { day: 2, date: null, fromPlace: 'Tbilisi', stops: 'Kazbegi' }, { day: 3, date: null, fromPlace: 'Kazbegi', stops: 'Kakheti' }] })],
  });
  assertEquals(svc0(r).draft.tour_days.map((x: any) => x.date), ['2026-11-13', null, null]);
  assert(blocking(r).includes('tour_days'));
});

// ---------------------------------------------- 5. failures, explained

const credit = { kind: 'http' as const, status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } };

Deno.test('the 29 October case: a pasted message the model could not read now leaves its cause in the log', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [credit] });
  assertEquals(r.status, 422);
  assertEquals(r.json.error, 'შეტყობინების წაკითხვა ახლა ვერ მოხერხდა — სცადე ხელახლა.');
  const err = r.logRows[0].error as string;
  assert(err.includes('status=400') && err.includes('type=invalid_request_error') && err.includes('hint=credit_balance'), err);
  assert(err.includes('req=req_test_0001'), err);
});

Deno.test('no key: the cause is logged as such', async () => {
  const r = await run({ text: CHAT, ...gate }, { apiKey: false });
  assertEquals(r.status, 422);
  assert(String(r.logRows[0].error).includes('kind=no_key'));
});

Deno.test('a file the model could not read: the template result, a plain Georgian warning, no API text', async () => {
  const r = await run({ ...textFile(BASE), ...gate }, { replies: [credit] });
  assertEquals(r.status, 200);
  assert(!JSON.stringify(r.json).includes('credit balance'));
  assert(r.json.warnings.some((w: string) => w.startsWith('AI წაკითხვა დროებით მიუწვდომელია')));
  assertEquals(svc0(r).draft.passengers, 4);
});

Deno.test('overloaded once, then fine: retried and read', async () => {
  const overloaded = { kind: 'http' as const, status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } };
  const r = await run({ text: CHAT, ...gate }, { replies: [overloaded, program(AI_BASE)] });
  assertEquals(r.status, 200);
  assertEquals(r.modelRequests.length, 2);
});

Deno.test('a dropped connection, then fine: retried and read', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [{ kind: 'network' }, program(AI_BASE)] });
  assertEquals([r.status, r.modelRequests.length], [200, 2]);
});

Deno.test('a 400 is not retried', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [credit, program(AI_BASE)] });
  assertEquals(r.modelRequests.length, 1);
});

Deno.test('a retired model (404) is named in the log', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [{ kind: 'http', status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: claude-sonnet-4-5' } } }] });
  assert(String(r.logRows[0].error).includes('hint=model_not_found'));
});

Deno.test('a refusal is a failure with its own cause', async () => {
  const r = await run({ text: CHAT, ...gate }, { replies: [{ kind: 'tool', name: 'submit_program', input: {}, stop_reason: 'refusal' }] });
  assert(String(r.logRows[0].error).includes('kind=refusal'));
});

Deno.test('more than 25 services: the agency is told how many were left out', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ...AI_BASE, date: `2026-12-${String(i + 1).padStart(2, '0')}` }));
  const r = await run({ text: CHAT, ...gate }, { replies: [program(...many)] });
  assertEquals(r.json.services.length, 25);
  assert(r.json.warnings.some((w: string) => w.includes('30') && w.includes('25')));
  assert(r.logRows[0].warnings.includes('services_dropped:5'));
});

Deno.test('a long file the model sees only in part: the agency is told', async () => {
  const r = await run({ ...(await fixtureFile('long_brochure_order_at_end.docx')), ...gate }, { replies: [single({ uncertain_fields: [] })] });
  assert(r.json.warnings.some((w: string) => w.startsWith('დოკუმენტი გრძელია')));
  assert(r.logRows[0].warnings.includes('text_cut'));
  // the rules reader still read the order at the end
  assertEquals(svc0(r).draft.passengers, 5);
});

Deno.test('a long WhatsApp export is read from its end, and says so', async () => {
  const r = await run({ ...(await fixtureFile('whatsapp_export_long.zip')), ...gate }, { replies: [program({ kind: 'transfer', date: '2026-11-14', time: '07:05', flight_number: 'KE 9201', vehicle_type: 'minivan' })] });
  assert(r.json.warnings.some((w: string) => w.startsWith('ჩატი გრძელია')));
  const sent = JSON.stringify(r.modelRequests[0].messages);
  assert(!sent.includes('Kim Min-jun'), 'the oldest messages are not sent');
});

// ----------------------------------------- 6. who may read, how often

Deno.test('a driver account is refused before any model call or log row', async () => {
  const r = await run({ text: CHAT, ...gate }, { role: 'driver', replies: [program(AI_BASE)] });
  assertEquals([r.status, r.modelRequests.length, r.logRows.length], [403, 0, 0]);
});

Deno.test('when the role cannot be checked, nothing is read', async () => {
  const r = await run({ text: CHAT, ...gate }, { roleFails: true, replies: [program(AI_BASE)] });
  assertEquals([r.status, r.modelRequests.length], [503, 0]);
});

Deno.test('the daily ceiling stops the read before the model is called', async () => {
  const r = await run({ text: CHAT, ...gate }, { importsToday: 300, replies: [program(AI_BASE)] });
  assertEquals([r.status, r.modelRequests.length], [429, 0]);
});

Deno.test('an admin may read requests too', async () => {
  const r = await run({ ...textFile(BASE), ...gate }, { role: 'admin', replies: [single(AI_BASE)] });
  assertEquals(r.status, 200);
});

// ------------------------------------------------ 7. nothing private leaks

Deno.test('logs keep no file name, no guest name or phone, no key', async () => {
  const A = { kind: 'tour', date: '2026-11-13', passengers: 14, vehicle_type: 'microbus', client_price: 2450, passenger_name: 'Pieter van der Berg', passenger_phone: '+31 6 1234 5678', tour_days: [{ day: 1, date: '2026-11-13', fromPlace: 'Tbilisi' }] };
  const file = await fixtureFile('programme_8_days_en.pdf');
  const r = await run({ ...file, fileName: 'Pieter_van_der_Berg_+31612345678.pdf', ...gate }, { replies: [credit, program(A)] });
  const logged = JSON.stringify(r.logRows) + '\n' + r.consoleLines.join('\n');
  for (const secret of ['Pieter', 'Berg', '+31', '612345678', '1234 5678', FAKE_API_KEY, 'service-role-test-secret', 'credit balance']) {
    assert(!logged.includes(secret), `log contains ${secret}`);
  }
  assert(/^\.pdf #[0-9a-f]{8}$/.test(r.logRows[0].file_name), r.logRows[0].file_name);
});

Deno.test('the model request carries the key only in its header', async () => {
  const r = await run({ ...textFile(BASE), ...gate }, { replies: [single(AI_BASE)] });
  assert(!JSON.stringify(r.modelRequests).includes(FAKE_API_KEY));
});

// ------------------------------------------- 8. approval before create

async function readForApproval(text: string, ai: Record<string, unknown>) {
  const r = await run({ ...textFile(text), ...gate }, { replies: [single(ai)] });
  return svc0(r);
}

function insertFor(d: any) {
  const leg = (l: any) => (l?.date_display ? { date: l.date_display } : null);
  return {
    kind: d.kind ?? 'transfer',
    date_display: d.date_display, pickup_time: d.pickup_time, passengers: d.passengers, vehicle_type: d.vehicle_type,
    price_gel: d.client_price, client_price: d.client_price, flight_number: d.flight_number,
    from_location: d.from_location, to_location: d.to_location,
    tour_days: Array.isArray(d.tour_days) ? d.tour_days.map((x: any) => ({ ...x, date: x.date ?? '' })) : null,
    transfer_in: leg(d.transfer_in), transfer_out: leg(d.transfer_out),
  };
}

Deno.test('approve: a clean reading is approved and the approved values are stored', async () => {
  const s = await readForApproval(BASE, AI_BASE);
  const r = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: insertFor(s.draft), confirmed: [] });
  assertEquals(r.status, 200);
  assert(typeof r.json.approvalId === 'string');
  assertEquals(r.approvals.length, 1);
  assertEquals(r.approvals[0].company_id, COMPANY);
  assertEquals([r.approvals[0].approved.passengers, r.approvals[0].approved.price_gel, r.approvals[0].approved.pickup_time], [4, 150, '10:00']);
});

Deno.test('approve: an unconfirmed value stops creation until it is confirmed', async () => {
  const s = await readForApproval(variant({ Price: '140 EUR' }), { ...AI_BASE, client_price: 140, client_price_currency: 'EUR' });
  const refused = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: insertFor(s.draft), confirmed: [] });
  assertEquals(refused.status, 422);
  assertEquals(refused.json.issues, [{ field: 'client_price', code: 'needs_confirmation' }]);
  assertEquals(refused.approvals.length, 0);
  const ok = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: insertFor(s.draft), confirmed: ['client_price'] });
  assertEquals(ok.status, 200);
});

Deno.test('approve: a conflict must be chosen; a value the agency corrected is confirmed in its turn', async () => {
  const s = await readForApproval(variant({ Pax: '6' }), { ...AI_BASE, passengers: 7 });
  const refused = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: insertFor(s.draft), confirmed: [] });
  assertEquals(refused.json.issues, [{ field: 'passengers', code: 'choose_value' }]);
  // corrected in the form: a change is not a confirmation
  const edited = { ...s.draft, passengers: 7 };
  const notYet = await run({ action: 'approve', reviewToken: s.review.token, draft: edited, insert: insertFor(edited), confirmed: [] });
  assertEquals(notYet.json.issues, [{ field: 'passengers', code: 'choose_value' }]);
  const ok = await run({ action: 'approve', reviewToken: s.review.token, draft: edited, insert: insertFor(edited), confirmed: ['passengers'] });
  assertEquals(ok.status, 200);
});

const TOUR_TEXT = 'Tour of Georgia 13-15.11.2026: day 1 Tbilisi city tour, day 2 Kazbegi, day 3 back to Tbilisi. 4 guests, minivan, 900 lari. Departure flight TK 383.';
const TOUR_AI = {
  kind: 'tour', date: '2026-11-13', passengers: 4, vehicle_type: 'minivan', vehicle_class: 'comfort', client_price: 900, client_price_currency: 'GEL',
  tour_days: [
    { day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'city tour' },
    { day: 2, date: '2026-11-14', fromPlace: 'Tbilisi', toPlace: 'Kazbegi', stops: 'Kazbegi' },
    { day: 3, date: '2026-11-15', fromPlace: 'Kazbegi', toPlace: 'Tbilisi', stops: '' },
  ],
  transfer_out: { date: '2026-11-15', time: '06:00', from: 'Tbilisi', to: 'Tbilisi International Airport', flight: 'TK 383' },
  uncertain_fields: [],
};

Deno.test('approve: after a change of service type, what the new type adds needs confirming', async () => {
  const r = await run({ text: TOUR_TEXT, ...gate }, { replies: [program(TOUR_AI)] });
  const s = svc0(r);
  assertEquals(s.draft.kind, 'tour');
  // the agency turns it into a transfer and fills the transfer's fields
  const transfer = { ...s.draft, kind: 'transfer', tour_days: null, transfer_in: null, transfer_out: null,
    from_location: 'Tbilisi International Airport', to_location: 'Hotel Stamba', date_display: '2026-11-13T06:00:00.000Z', pickup_time: '10:00' };
  const first = await run({ action: 'approve', reviewToken: s.review.token, draft: transfer, insert: insertFor(transfer), confirmed: s.review.blocking });
  assertEquals(first.status, 422);
  // the places were never reviewed; the time was reviewed (missing for the tour) and the agency typed it
  assertEquals(first.json.issues.filter((i: any) => i.code === 'kind_changed').map((i: any) => i.field).sort(), ['from_location', 'to_location']);
  const ok = await run({ action: 'approve', reviewToken: s.review.token, draft: transfer, insert: insertFor(transfer),
    confirmed: [...s.review.blocking, 'from_location', 'to_location'] });
  assertEquals(ok.status, 200, JSON.stringify(ok.json));
});

Deno.test('approve: moving a tour’s start moves its legs and days, which still need confirming', async () => {
  const r = await run({ text: TOUR_TEXT, ...gate }, { replies: [program(TOUR_AI)] });
  const s = svc0(r);
  // the departure's 06:00 pickup is nowhere in the request
  assert(s.review.blocking.includes('transfer_out'), JSON.stringify(s.review.blocking));
  const day = 86_400_000;
  const shift = (iso: string | null) => (iso ? new Date(Date.parse(iso) + day).toISOString() : iso);
  const moved = {
    ...s.draft,
    date_display: shift(s.draft.date_display),
    tour_days: s.draft.tour_days.map((x: any) => ({ ...x, date: x.date ? new Date(Date.parse(x.date) + day).toISOString().slice(0, 10) : x.date })),
    transfer_out: { ...s.draft.transfer_out, date_display: shift(s.draft.transfer_out.date_display) },
  };
  const others = s.review.blocking.filter((f: string) => f !== 'transfer_out');
  const refused = await run({ action: 'approve', reviewToken: s.review.token, draft: moved, insert: insertFor(moved), confirmed: others });
  assertEquals(refused.json.issues, [{ field: 'transfer_out', code: 'needs_confirmation' }]);
  const ok = await run({ action: 'approve', reviewToken: s.review.token, draft: moved, insert: insertFor(moved), confirmed: [...others, 'transfer_out'] });
  assertEquals(ok.status, 200, JSON.stringify(ok.json));
});

Deno.test('approve: a tour’s legs and days in the booking must be the reviewed ones', async () => {
  const r = await run({ text: TOUR_TEXT, ...gate }, { replies: [program(TOUR_AI)] });
  const s = svc0(r);
  const ins = insertFor(s.draft);
  const otherLeg = { ...ins, transfer_out: { date: '2026-11-16T02:00:00.000Z' } };
  const r1 = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: otherLeg, confirmed: s.review.blocking });
  assert(r1.json.issues.some((i: any) => i.field === 'transfer_out' && i.code === 'insert_mismatch'), JSON.stringify(r1.json.issues));
  const otherDays = { ...ins, tour_days: ins.tour_days.map((x: any, i: number) => (i === 2 ? { ...x, date: '2026-11-17' } : x)) };
  const r2 = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: otherDays, confirmed: s.review.blocking });
  assert(r2.json.issues.some((i: any) => i.field === 'tour_days' && i.code === 'insert_mismatch'), JSON.stringify(r2.json.issues));
  const otherKind = { ...ins, kind: 'transfer' };
  const r3 = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: otherKind, confirmed: s.review.blocking });
  assert(r3.json.issues.some((i: any) => i.field === 'kind' && i.code === 'insert_mismatch'), JSON.stringify(r3.json.issues));
});

Deno.test('approve: a tampered or someone else’s review is refused', async () => {
  const s = await readForApproval(BASE, AI_BASE);
  const [body, sig] = String(s.review.token).split('.');
  const forged = `${body.slice(0, -2)}AA.${sig}`;
  const r1 = await run({ action: 'approve', reviewToken: forged, draft: s.draft, insert: insertFor(s.draft), confirmed: [] });
  assertEquals(r1.json.issues, [{ field: '*', code: 'review_invalid' }]);
  const r2 = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: insertFor(s.draft), confirmed: [] }, { userId: '00000000-0000-4000-8000-0000000000c2' });
  assertEquals(r2.json.issues, [{ field: '*', code: 'review_not_yours' }]);
});

Deno.test('approve: the booking to insert must carry the reviewed values', async () => {
  const s = await readForApproval(BASE, AI_BASE);
  const r = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: { ...insertFor(s.draft), passengers: 9 }, confirmed: [] });
  assertEquals(r.json.issues, [{ field: 'passengers', code: 'insert_mismatch' }]);
});

Deno.test('approve: the form’s required fields are checked on the server too', async () => {
  const s = await readForApproval(BASE, AI_BASE);
  const noTime = { ...s.draft, date_display: new Date(Date.parse('2026-11-20T00:00:00+04:00')).toISOString(), pickup_time: null };
  const r = await run({ action: 'approve', reviewToken: s.review.token, draft: noTime, insert: insertFor(noTime), confirmed: [] });
  assert(r.json.issues.some((i: any) => i.field === 'time' && i.code === 'missing'), JSON.stringify(r.json.issues));
});

Deno.test('approve: a departure picked up after its flight is refused', async () => {
  const dep = variant({ From: 'Hotel Stamba, Tbilisi', To: 'Tbilisi International Airport', 'Pickup time': '10:00' });
  const s = await readForApproval(dep, { ...AI_BASE, from_location: 'Hotel Stamba, Tbilisi', from_location_type: 'hotel', to_location: 'Tbilisi International Airport', to_location_type: 'airport', flight_direction: 'departure', flight_time: '13:00' });
  const late = { ...s.draft, date_display: new Date(Date.parse('2026-11-20T14:00:00+04:00')).toISOString(), pickup_time: '14:00' };
  const r = await run({ action: 'approve', reviewToken: s.review.token, draft: late, insert: insertFor(late), confirmed: ['time'] });
  assert(r.json.issues.some((i: any) => i.code === 'pickup_after_flight'), JSON.stringify(r.json.issues));
});

Deno.test('approve: drivers cannot approve', async () => {
  const s = await readForApproval(BASE, AI_BASE);
  const r = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: insertFor(s.draft), confirmed: [] }, { role: 'driver' });
  assertEquals(r.status, 403);
});

// ----------------------------------------------- the WhatsApp chat fixture

Deno.test('the WhatsApp chat with changes: later values read, the stale minivan price not taken as confirmed', async () => {
  const chat = await fixtureText('whatsapp_chat_changes.txt');
  const r = await run({ text: chat, ...gate }, {
    replies: [program({
      kind: 'tour', date: '2026-11-16', passengers: 6, vehicle_type: 'microbus', client_price: 1100, uncertain_fields: [],
      tour_days: [{ day: 1, date: '2026-11-16', fromPlace: 'Tbilisi', stops: 'city tour' }, { day: 2, date: '2026-11-17', fromPlace: 'Tbilisi', stops: 'Kazbegi' }, { day: 3, date: '2026-11-18', fromPlace: 'Kazbegi', stops: 'Batumi' }],
      transfer_in: { date: '2026-11-15', time: '23:40', from: 'Tbilisi International Airport', from_type: 'airport', to: 'Rooms Hotel Tbilisi', to_type: 'hotel', flight: 'A9 694' },
    })],
  });
  assertEquals(status(r, 'client_price'), 'unconfirmed');
  assert(svc0(r).review.fields.client_price.reasons.includes('chat_price'));
  assertEquals(status(r, 'passengers'), 'unconfirmed');
  assertEquals(svc0(r).review.ready, false);
});
