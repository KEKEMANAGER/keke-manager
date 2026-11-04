// The import, scenario by scenario: what a tour operator sends, in Georgian,
// English and Russian, as a pasted message, a chat export, a PDF, a Word or
// Excel file or a photo — transfers, day tours and multi-day programmes,
// complete, incomplete and wrong. Every model answer is scripted here (no API
// call, no network, no real data); what is checked is everything around it:
// what is read, what is flagged, what may become a booking unchecked.
//
// "ready" below means what the app would let the agency create without
// confirming anything: the server's review has nothing blocking and the
// server's own re-check of the form's required fields passes.
import { assert, assertEquals } from './assert.ts';
import { COMPANY, fixtureFile, program, run, single, tb, TEST_NOW, textFile, tool } from './harness.ts';
import { requiredIssues } from '../review.ts';

const gate = { clientGate: 2 };
const svc = (r: { json: any }, i = 0) => r.json.services?.[i] ?? null;
const ready = (r: { json: any }, i = 0) => {
  const s = svc(r, i);
  return !!s && s.review?.ready === true && requiredIssues(s.draft, TEST_NOW).length === 0;
};
const stat = (r: { json: any }, f: string, i = 0) => svc(r, i)?.review?.fields?.[f]?.status;
const reasons = (r: { json: any }, f: string, i = 0): string[] => svc(r, i)?.review?.fields?.[f]?.reasons ?? [];
const blocking = (r: { json: any }, i = 0): string[] => svc(r, i)?.review?.blocking ?? [];

const TRANSFER = {
  kind: 'transfer', date: '2026-11-20', time: '10:00', from_location: 'Tbilisi International Airport', from_location_type: 'airport',
  to_location: 'Hotel Stamba, Tbilisi', to_location_type: 'hotel', flight_number: 'TK 382', flight_direction: 'arrival',
  passengers: 4, vehicle_type: 'minivan', vehicle_class: 'comfort', client_price: 150, client_price_currency: 'GEL', uncertain_fields: [],
};
const LABELLED = [
  'Service: Transfer', 'Date: 20.11.2026', 'Pickup time: 10:00', 'From: Tbilisi International Airport',
  'To: Hotel Stamba, Tbilisi', 'Pax: 4', 'Vehicle: Minivan', 'Class: Comfort', 'Price: 150 GEL', 'Flight: TK 382',
].join('\n');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const THREE_DAYS = [
  { day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'Old Town' },
  { day: 2, date: '2026-11-14', fromPlace: 'Tbilisi', toPlace: 'Kazbegi', stops: 'Ananuri, Gudauri' },
  { day: 3, date: '2026-11-15', fromPlace: 'Kazbegi', toPlace: 'Tbilisi', stops: 'Mtskheta' },
];
const tour = (o: Record<string, unknown> = {}) =>
  ({ kind: 'tour', date: '2026-11-13', passengers: 6, vehicle_type: 'minivan', client_price: 900, client_price_currency: 'GEL', tour_days: THREE_DAYS, uncertain_fields: [], ...o });

// ------------------------------------------------------------ languages

Deno.test('S01 ka: a Georgian message, every value written in it → ready after the one look at a chat price', async () => {
  const text = '20 ნოემბერს 10:00-ზე ტრანსფერი თბილისის აეროპორტიდან სასტუმრო სტამბაში, 4 ადამიანი, მინივენი, რეისი TK 382, 150 ლარი';
  const r = await run({ text, ...gate }, { replies: [program({ ...TRANSFER, from_location: 'თბილისის აეროპორტი', to_location: 'სასტუმრო სტამბა' })] });
  for (const f of ['date', 'time', 'passengers', 'vehicle_type', 'flight_number', 'from_location', 'to_location']) assertEquals(stat(r, f), 'confirmed', f);
  assertEquals(tb(svc(r).draft.date_display), '2026-11-20 10:00');
});

Deno.test('S02 ru: «20 ноября в 10:00», «4 человека», «минивэн» are read as written', async () => {
  const text = 'Добрый день! 20 ноября в 10:00 трансфер из аэропорта Тбилиси в отель Stamba, 4 человека, минивэн, рейс TK 382, 150 лари';
  const r = await run({ text, ...gate }, { replies: [program({ ...TRANSFER, from_location: 'аэропорт Тбилиси', to_location: 'отель Stamba' })] });
  for (const f of ['date', 'time', 'passengers', 'vehicle_type', 'flight_number']) assertEquals(stat(r, f), 'confirmed', f);
});

Deno.test('S03 en: "November 20th at 10am" is the 20th at 10:00', async () => {
  const text = 'Hi, please book a transfer on November 20th at 10:00 from Tbilisi airport to Hotel Stamba for 4 people, minivan, flight TK 382, 150 GEL.';
  const r = await run({ text, ...gate }, { replies: [program(TRANSFER)] });
  assertEquals(stat(r, 'date'), 'confirmed');
  assertEquals(stat(r, 'time'), 'confirmed');
});

Deno.test('S04 ka form: labelled Georgian fields read by the template, the model agrees → ready', async () => {
  const r = await run({ ...textFile(LABELLED), ...gate }, { replies: [single(TRANSFER)] });
  assert(ready(r), JSON.stringify(blocking(r)));
});

// ------------------------------------------------------------ file types

Deno.test('S05 PDF (en): an 8-day programme is ONE tour with its days and arrival; no invented flight or hotel', async () => {
  const A = tour({
    passengers: 14, vehicle_type: 'microbus', client_price: 2450, client_price_currency: 'USD',
    tour_days: [
      { day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'Old Town, Narikala' },
      { day: 2, date: '2026-11-14', fromPlace: 'Tbilisi', toPlace: 'Telavi', stops: 'Sighnaghi – Bodbe' },
      { day: 3, date: '2026-11-15', fromPlace: 'Telavi', toPlace: 'Stepantsminda', stops: 'Ananuri' },
    ],
    transfer_in: { date: '2026-11-12', time: '03:40', from: 'Tbilisi International Airport', from_type: 'airport', to: 'Hotel Stamba', to_type: 'hotel', flight: 'KL 3150' },
  });
  const r = await run({ ...(await fixtureFile('programme_8_days_en.pdf')), ...gate }, { replies: [program(A)] });
  const d = svc(r).draft;
  assertEquals([r.json.services.length, d.kind, d.tour_days.length], [1, 'tour', 3]);
  assert(d.transfer_in && d.transfer_in.flight === 'KL 3150', JSON.stringify(d.transfer_in));
  assertEquals([d.flight_number, d.hotel], [null, null]);
  assertEquals(stat(r, 'client_price'), 'unconfirmed'); // USD is not a lari price
});

Deno.test('S06 Word (ru): a departure form — pickup 16:30, flight 21:15 kept, EUR flagged', async () => {
  const r = await run({ ...(await fixtureFile('departure_form_ru.docx')), ...gate }, {
    replies: [program({ kind: 'transfer', date: '2026-12-03', time: '16:30', from_location: 'Radisson Blu Iveria, Tbilisi', from_location_type: 'hotel', to_location: 'Kutaisi International Airport', to_location_type: 'airport', flight_number: 'W6 4470', flight_direction: 'departure', flight_time: '21:15', passengers: 5, vehicle_type: 'minivan', client_price: 140, client_price_currency: 'EUR', uncertain_fields: [] })],
  });
  const d = svc(r).draft;
  assertEquals([tb(d.date_display), tb(d.flight_at), d.flight_direction], ['2026-12-03 16:30', '2026-12-03 21:15', 'departure']);
  assertEquals(stat(r, 'client_price'), 'unconfirmed');
  assert(reasons(r, 'client_price').includes('currency_foreign'));
});

Deno.test('S07 Excel: a schedule of two groups is two services, each reviewed on its own', async () => {
  const r = await run({ ...(await fixtureFile('schedule_two_groups.xlsx')), ...gate }, {
    replies: [program(
      { ...TRANSFER, date: '2026-12-05', time: '10:15', passengers: 2, vehicle_type: 'sedan', flight_number: 'LH 2556', to_location: 'Hotel Biltmore' },
      { ...TRANSFER, date: '2026-12-22', time: '09:00', passengers: 9, vehicle_type: 'microbus', flight_number: null, from_location: 'Batumi', to_location: 'Gonio' },
    )],
  });
  assertEquals(r.json.services.length, 2);
  assertEquals(r.json.services.map((s: any) => s.draft.passengers), [2, 9]);
  assert(r.json.services.every((s: any) => s.review && typeof s.review.token === 'string'));
});

Deno.test('S08 WhatsApp chat (ka/ru/en mixed) with changes: the last word counts, the chat price is always looked at', async () => {
  const chat = await (await import('./harness.ts')).fixtureText('whatsapp_chat_changes.txt');
  const r = await run({ text: chat, ...gate }, {
    replies: [program(tour({ date: '2026-11-16', passengers: 6, client_price: 1100,
      tour_days: [
        { day: 1, date: '2026-11-16', fromPlace: 'Tbilisi', toPlace: 'Tbilisi', stops: 'city tour' },
        { day: 2, date: '2026-11-17', fromPlace: 'Tbilisi', toPlace: 'Kazbegi', stops: 'Kazbegi', hotel: 'Rooms Hotel' },
        { day: 3, date: '2026-11-18', fromPlace: 'Kazbegi', toPlace: 'Batumi', stops: '' },
      ],
      transfer_in: { date: '2026-11-15', time: '23:40', from: 'Tbilisi International Airport', to: 'Rooms Hotel Tbilisi', flight: 'A9 694' },
    }))],
  });
  const d = svc(r).draft;
  assertEquals([d.kind, d.passengers, d.transfer_in?.flight], ['tour', 6, 'A9 694']);
  assert(blocking(r).includes('client_price'), JSON.stringify(blocking(r)));
  assert(reasons(r, 'client_price').includes('chat_price'));
});

Deno.test('S09 WhatsApp export (.zip): the chat inside is read', async () => {
  const r = await run({ ...(await fixtureFile('whatsapp_export_long.zip')), ...gate }, {
    replies: [program({ kind: 'transfer', date: '2026-11-14', time: '07:05', flight_number: 'KE 9201', vehicle_type: 'minivan', uncertain_fields: [] })],
  });
  assertEquals(r.status, 200);
  assertEquals(svc(r).draft.flight_number, 'KE 9201');
});

Deno.test('S10 PDF (ka): a Georgian day-tour form is a day tour', async () => {
  const r = await run({ ...(await fixtureFile('day_tour_form_ka.pdf')), ...gate }, {
    replies: [program({ kind: 'day_tour', date: '2026-11-21', time: '09:00', from_location: 'სასტუმრო', to_location: 'სასტუმრო', route: 'მცხეთა, ჟინვალი, ანანური, გუდაური, სტეფანწმინდა', passengers: 3, vehicle_type: 'sedan', client_price: 350, client_price_currency: 'GEL', uncertain_fields: [] })],
  });
  assertEquals(svc(r).draft.kind, 'day_tour');
});

Deno.test('S11 photo: nothing read off a picture becomes a booking unchecked', async () => {
  const r = await run({ images: [{ base64: PNG }], ...gate }, { replies: [program(TRANSFER)] });
  assertEquals(r.status, 200);
  assert(!ready(r));
  assert(reasons(r, 'date').includes('from_picture'), JSON.stringify(reasons(r, 'date')));
});

Deno.test('S12 Word: a long brochure with the order at its end — the order is found, no "cut" warning', async () => {
  const r = await run({ ...(await fixtureFile('long_brochure_order_at_end.docx')), ...gate }, { replies: [single({ uncertain_fields: [] })] });
  assertEquals(r.status, 200);
  assert(svc(r).draft.date_display || svc(r).draft.passengers, JSON.stringify(svc(r).draft).slice(0, 200));
});

Deno.test('S13 old .doc: told to save it as .docx, in the agency’s language', async () => {
  const r = await run({ fileName: 'order.doc', contentBase64: btoa('\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1' + 'x'.repeat(600)), ...gate });
  assertEquals([r.status, r.json.code], [415, 'old_doc']);
});

Deno.test('S14 a format nobody can read: a clear answer, no model call', async () => {
  const r = await run({ fileName: 'order.pages', contentBase64: btoa('PK\x03\x04' + 'x'.repeat(600)), ...gate });
  assert(r.status >= 400 && typeof r.json.code === 'string', JSON.stringify(r.json));
  assertEquals(r.modelRequests.length, 0);
});

Deno.test('S15 a picture uploaded as a file is read as a picture, and checked like one', async () => {
  const bin = atob(PNG);
  const r = await run({ fileName: 'whatsapp_photo.png', contentBase64: btoa(bin), ...gate }, { replies: [program(TRANSFER)] });
  assertEquals(r.status, 200);
  assert(!ready(r));
});

// --------------------------------------- transfer, day tour, multi-day tour

Deno.test('S16 a programme the model labels "transfer" is still ONE tour with all its days — and the kind is asked', async () => {
  const text = 'Group of 6, 13-15.11.2026: day 1 Tbilisi Old Town, day 2 Kazbegi via Ananuri and Gudauri, day 3 Mtskheta and back. Minivan, 900 GEL.';
  const r = await run({ text, ...gate }, { replies: [program(tour({ kind: 'transfer' }))] });
  const d = svc(r).draft;
  assertEquals([d.kind, d.tour_days.length], ['tour', 3]);
  assert(blocking(r).includes('kind'));
  assert(reasons(r, 'kind').includes('several_days'));
});

Deno.test('S17 a tour with its arrival and departure: the transfers are the tour’s legs, not extra bookings', async () => {
  const text = 'Arrival 12.11.2026 flight TK 382 at 23:40, then tour 13-15.11.2026 (Tbilisi, Kazbegi, Mtskheta), departure 16.11.2026 pickup 06:00 for TK 383. 6 pax, minivan, 900 GEL.';
  const r = await run({ text, ...gate }, {
    replies: [program(tour({
      transfer_in: { date: '2026-11-12', time: '23:40', from: 'Tbilisi International Airport', from_type: 'airport', to: 'Hotel Stamba', to_type: 'hotel', flight: 'TK 382' },
      transfer_out: { date: '2026-11-16', time: '06:00', from: 'Hotel Stamba', from_type: 'hotel', to: 'Tbilisi International Airport', to_type: 'airport', flight: 'TK 383' },
    }))],
  });
  const d = svc(r).draft;
  assertEquals(r.json.services.length, 1);
  assertEquals([d.kind, tb(d.transfer_in?.date_display), tb(d.transfer_out?.date_display)], ['tour', '2026-11-12 23:40', '2026-11-16 06:00']);
});

Deno.test('S18 one day of sightseeing is a day tour', async () => {
  const r = await run({ text: 'Day trip 21.11.2026 09:00 from Hotel Stamba: Mtskheta, Ananuri, Kazbegi and back. 3 guests, sedan, 350 GEL.', ...gate }, {
    replies: [program({ kind: 'day_tour', date: '2026-11-21', time: '09:00', from_location: 'Hotel Stamba', to_location: 'Hotel Stamba', route: 'Mtskheta, Ananuri, Kazbegi', passengers: 3, vehicle_type: 'sedan', client_price: 350, client_price_currency: 'GEL', uncertain_fields: [] })],
  });
  assertEquals(svc(r).draft.kind, 'day_tour');
  assertEquals(stat(r, 'date'), 'confirmed');
});

Deno.test('S19 a free day without a date stays undated — never given an invented date', async () => {
  const r = await run({ text: '13 Nov city tour; one free day; then Kazbegi; then back via Ananuri. 6 guests, minivan, 900 lari', ...gate }, {
    replies: [program(tour({ tour_days: [THREE_DAYS[0], { ...THREE_DAYS[1], date: null }, { ...THREE_DAYS[2], date: null }] }))],
  });
  const days = svc(r).draft.tour_days.map((x: any) => x.date);
  assertEquals(days, ['2026-11-13', null, null]);
  assert(!ready(r));
});

Deno.test('S20 a span of dates "13-15.11.2026" vouches for each day of the tour', async () => {
  const r = await run({ text: 'Tour 13-15.11.2026, Tbilisi – Kazbegi – Mtskheta, 6 guests, minivan, 900 GEL', ...gate }, { replies: [program(tour())] });
  assertEquals(stat(r, 'tour_days'), 'confirmed');
});

Deno.test('S21 a landing after midnight: the arrival pickup is asked about, not guessed', async () => {
  const text = 'Tour 13-15.11.2026, 6 guests, minivan, 900 GEL. Arrival flight TK 382 on the night of 12 November, lands 00:40.';
  const r = await run({ text, ...gate }, {
    replies: [program(tour({ transfer_in: { date: '2026-11-12', time: '00:40', from: 'Tbilisi International Airport', to: 'Hotel Stamba', flight: 'TK 382' } }))],
  });
  assert(!ready(r));
  assert(blocking(r).includes('transfer_in'), JSON.stringify(blocking(r)));
});

// ------------------------------------------------------------ incomplete

Deno.test('S22 no time given: the time is asked for, not invented', async () => {
  const r = await run({ text: 'Transfer 20.11.2026 from Tbilisi airport to Hotel Stamba, 4 people, minivan, 150 GEL', ...gate }, {
    replies: [program({ ...TRANSFER, time: null, flight_number: null })],
  });
  assertEquals(svc(r).draft.pickup_time, null);
  assert(!ready(r));
});

Deno.test('S23 no head count: passengers missing, not guessed', async () => {
  const r = await run({ text: 'Transfer 20.11.2026 10:00 from Tbilisi airport to Hotel Stamba, minivan, flight TK 382, 150 GEL', ...gate }, {
    replies: [program({ ...TRANSFER, passengers: null })],
  });
  assertEquals(svc(r).draft.passengers, null);
  assertEquals(stat(r, 'passengers'), 'missing');
  assert(!ready(r));
});

Deno.test('S24 no price: the booking cannot be created until one is entered', async () => {
  const r = await run({ text: 'Transfer 20.11.2026 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382', ...gate }, {
    replies: [program({ ...TRANSFER, client_price: null, client_price_currency: null })],
  });
  assertEquals(svc(r).draft.client_price, null);
  assert(!ready(r));
});

Deno.test('S25 a message with nothing to book: a clear answer, no empty form', async () => {
  const r = await run({ text: 'Hello! How are you? Talk soon, best regards from all of us.', ...gate }, { replies: [program({ uncertain_fields: [] })] });
  assertEquals([r.status, r.json.code], [422, 'nothing_found']);
});

Deno.test('S26 a few characters pasted: asked for the message, no model call', async () => {
  const r = await run({ text: 'ok', ...gate });
  assertEquals([r.json.code, r.modelRequests.length], ['text_too_short', 0]);
});

// ------------------------------------------------------------ wrong dates

Deno.test('S27 a date in the past is flagged and stops creation', async () => {
  const r = await run({ text: 'Transfer 20.10.2026 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382, 150 GEL', ...gate }, {
    replies: [program({ ...TRANSFER, date: '2026-10-20' })],
  });
  assert(reasons(r, 'date').includes('date_past'), JSON.stringify(reasons(r, 'date')));
  assert(!ready(r));
});

Deno.test('S28 a date more than a year ahead is flagged', async () => {
  const r = await run({ text: 'Transfer 20.11.2028 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382, 150 GEL', ...gate }, {
    replies: [program({ ...TRANSFER, date: '2028-11-20' })],
  });
  assert(reasons(r, 'date').includes('date_far'), JSON.stringify(reasons(r, 'date')));
  assert(!ready(r));
});

Deno.test('S29 a day the month does not have (31.11) is not quietly 1 December', async () => {
  const r = await run({ ...textFile(LABELLED.replace('20.11.2026', '31.11.2026')), ...gate }, { replies: [single({ ...TRANSFER, date: null })] });
  const d = svc(r).draft;
  assert(!d.date_display || !tb(d.date_display)?.startsWith('2026-12-01'), tb(d.date_display) ?? 'null');
  assert(!ready(r));
});

Deno.test('S30 a pickup after the flight: never accepted as read, and refused at approval if typed in', async () => {
  // read: "pickup 22:30, flight 21:30" — the flight must be the next day, a day later: asked about
  const text = 'Departure 20.11.2026: pickup 22:30 at Hotel Stamba to Tbilisi airport, flight TK 383 at 21:30. 4 people, minivan, 150 GEL';
  const r = await run({ text, ...gate }, {
    replies: [program({ ...TRANSFER, time: '22:30', from_location: 'Hotel Stamba', from_location_type: 'hotel', to_location: 'Tbilisi International Airport', to_location_type: 'airport', flight_number: 'TK 383', flight_direction: 'departure', flight_time: '21:30' })],
  });
  assert(!ready(r), JSON.stringify(blocking(r)));
  const all = Object.values(svc(r).review.fields).flatMap((f: any) => f.reasons ?? []);
  assert(all.includes('pickup_long_before_flight') || all.includes('flight_next_day'), JSON.stringify(all));
  // approve: the agency sets the pickup after a same-day flight
  const s = svc(r);
  const late = { ...s.draft, flight_at: new Date(Date.parse('2026-11-20T21:30:00+04:00')).toISOString() };
  const ins = { kind: 'transfer', date_display: late.date_display, pickup_time: late.pickup_time, passengers: 4, vehicle_type: 'minivan', price_gel: 150, client_price: 150, flight_number: late.flight_number, from_location: late.from_location, to_location: late.to_location, tour_days: null, transfer_in: null, transfer_out: null };
  const a = await run({ action: 'approve', reviewToken: s.review.token, draft: late, insert: ins, confirmed: [...s.review.blocking, 'flight_at'] });
  assertEquals(a.status, 422, JSON.stringify(a.json));
  assert(a.json.issues.some((i: any) => i.code === 'pickup_after_flight'), JSON.stringify(a.json.issues));
  assertEquals(a.approvals.length, 0);
});

Deno.test('S31 a date the model made up (not in the request) is not confirmed', async () => {
  const r = await run({ text: 'Transfer next week, 10:00, Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382, 150 GEL', ...gate }, {
    replies: [program(TRANSFER)],
  });
  assertEquals(stat(r, 'date'), 'unconfirmed');
  assert(reasons(r, 'date').includes('not_in_request'));
  assert(!ready(r));
});

// --------------------------------------------- when the model is not there

Deno.test('S32 the model overloaded twice: a pasted message says "busy, try again" with a code', async () => {
  const busy = { kind: 'http' as const, status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } };
  const r = await run({ text: 'Transfer 20/11 at 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382, 150 lari', ...gate }, { replies: [busy, busy] });
  assertEquals([r.status, r.json.code, r.modelRequests.length], [422, 'ai_busy', 2]);
});

Deno.test('S33 a retired model: one call to the fallback model, and the request is read', async () => {
  const gone = { kind: 'http' as const, status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: claude-sonnet-4-5' } } };
  Deno.env.set('BOOKING_IMPORT_MODEL', 'claude-sonnet-4-5');
  try {
    const r = await run({ text: 'Transfer 20/11 at 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382, 150 lari', ...gate }, { replies: [gone, program(TRANSFER)] });
    assertEquals(r.status, 200);
    assertEquals(r.modelRequests.map((m) => m.model), ['claude-sonnet-4-5', 'claude-sonnet-4-6']);
    assert(r.logRows.some((row) => JSON.stringify(row).includes('fallback=1')), JSON.stringify(r.logRows));
  } finally {
    Deno.env.delete('BOOKING_IMPORT_MODEL');
  }
});

Deno.test('S34 no model at all: a labelled file is still read by the template; a photo says so plainly', async () => {
  const file = await run({ ...textFile(LABELLED), ...gate }, { apiKey: false });
  assertEquals(file.status, 200);
  assertEquals([svc(file).draft.passengers, svc(file).draft.client_price], [4, 150]);
  const photo = await run({ images: [{ base64: PNG }], ...gate }, { apiKey: false });
  assertEquals([photo.status, photo.json.code], [503, 'ai_unavailable']);
});

Deno.test('S35 the logs: no key, no guest name, no phone — even when the model fails', async () => {
  const text = 'Transfer 20/11 at 10:00 for Pieter van der Berg +31 6 1234 5678 from Tbilisi airport to Hotel Stamba, 4 people, 150 lari';
  const credit = { kind: 'http' as const, status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low. Pieter +31 6 1234 5678' } } };
  for (const replies of [[program({ ...TRANSFER, passenger_name: 'Pieter van der Berg', passenger_phone: '+31 6 1234 5678' })], [credit]]) {
    const r = await run({ text, ...gate }, { replies });
    const logged = JSON.stringify(r.logRows) + '\n' + r.consoleLines.join('\n');
    for (const secret of ['sk-ant-test', 'Pieter', '1234 5678', 'service-role-test-secret']) assert(!logged.includes(secret), secret);
  }
});

// ------------------------------------------------ duplicates, confirmation

Deno.test('S36 the same request booked twice: the agency is asked, and decides', async () => {
  const r = await run({ ...textFile(LABELLED), ...gate }, { replies: [single(TRANSFER)] });
  const s = svc(r);
  const ins = { kind: 'transfer', date_display: s.draft.date_display, pickup_time: s.draft.pickup_time, passengers: 4, vehicle_type: 'minivan', price_gel: 150, client_price: 150, flight_number: s.draft.flight_number, from_location: s.draft.from_location, to_location: s.draft.to_location, tour_days: null, transfer_in: null, transfer_out: null };
  const existing = { id: 'b-1', company_id: COMPANY, voucher_code: 'KEKE-AB12CD', kind: 'transfer', status: 'pending', date_display: s.draft.date_display, pickup_time: '10:00', from_location: s.draft.from_location, to_location: s.draft.to_location, route: null, flight_number: 'TK 382', passengers: 4 };
  const asked = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: ins, confirmed: [] }, { bookings: [existing] });
  assertEquals([asked.status, asked.json.code, asked.approvals.length], [409, 'possible_duplicate', 0]);
  const anyway = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: ins, confirmed: [], allowDuplicate: true }, { bookings: [existing] });
  assertEquals([anyway.status, anyway.approvals.length], [200, 1]);
});

Deno.test('S37 nothing unconfirmed is approved; a confirmed value is', async () => {
  const r = await run({ ...textFile(LABELLED.replace('150 GEL', '140 EUR')), ...gate }, { replies: [single({ ...TRANSFER, client_price: 140, client_price_currency: 'EUR' })] });
  const s = svc(r);
  const ins = { kind: 'transfer', date_display: s.draft.date_display, pickup_time: s.draft.pickup_time, passengers: 4, vehicle_type: 'minivan', price_gel: 140, client_price: 140, flight_number: s.draft.flight_number, from_location: s.draft.from_location, to_location: s.draft.to_location, tour_days: null, transfer_in: null, transfer_out: null };
  const no = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: ins, confirmed: [] });
  assertEquals([no.status, no.json.code, no.approvals.length], [422, 'approve_issues', 0]);
  const yes = await run({ action: 'approve', reviewToken: s.review.token, draft: s.draft, insert: ins, confirmed: ['client_price'] });
  assertEquals([yes.status, yes.approvals.length], [200, 1]);
});

Deno.test('S38 a driver account cannot import; the model is never called', async () => {
  const r = await run({ text: 'Transfer 20/11 at 10:00, 4 people', ...gate }, { role: 'driver', replies: [program(TRANSFER)] });
  assertEquals([r.status, r.json.code, r.modelRequests.length], [403, 'not_company', 0]);
});

Deno.test('S39 the model’s answer cut off: never ready, and the agency is told', async () => {
  const r = await run({ text: 'Transfer 20/11 at 10:00 from Tbilisi airport to Hotel Stamba, 4 people, minivan, flight TK 382, 150 lari', ...gate }, {
    replies: [tool({ services: [TRANSFER] }, { stop_reason: 'max_tokens', name: 'submit_program' })],
  });
  assert(!ready(r));
  assert((r.json.warnings ?? []).length > 0);
});

Deno.test('S40 a picture the AI service cannot open: "use another picture", not "try again later"', async () => {
  const bad = { kind: 'http' as const, status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Could not process image' } } };
  const r = await run({ images: [{ base64: PNG }], ...gate }, { replies: [bad] });
  assertEquals([r.status, r.json.code], [415, 'photo_unsupported']);
  assert(!String(r.json.error ?? '').includes('სცადე ხელახლა'), String(r.json.error));
  assert(JSON.stringify(r.logRows).includes('hint=image_rejected'));
});
