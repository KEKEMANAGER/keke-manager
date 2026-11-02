// The review of critical fields, and the signed token the approval relies on.
import { assert, assertEquals } from './assert.ts';
import {
  approveService, criticalValues, reviewService, samePlace, signReview, verifyReview, withholdUnconfirmed,
} from '../review.ts';

const NOW = Date.parse('2026-11-01T10:00:00Z');
const draft = {
  kind: 'transfer', date_display: '2026-11-20T06:00:00.000Z', pickup_time: '10:00', from_location: 'Tbilisi International Airport',
  to_location: 'Hotel Stamba', passengers: 4, vehicle_type: 'minivan', client_price: 150, flight_number: 'TK 382', flight_direction: 'arrival',
};
const base = { sources: {}, templateDraft: null, aiUncertain: [], aiEvidence: null, flags: {}, inputKind: 'form' as const, sourceText: null, truncated: false, now: NOW };

Deno.test('places: different spellings of one place are the same; different hotels are not', () => {
  assert(samePlace('Radisson Blu Iveria, Tbilisi', 'Отель Radisson Blu Iveria, Тбилиси'));
  assert(samePlace('Tbilisi International Airport', 'Tbilisi airport'));
  assert(!samePlace('Hotel Stamba', 'Rooms Hotel'));
});

Deno.test('critical values: date and time in Tbilisi', () => {
  const v = criticalValues(draft);
  assertEquals([v.date, v.time, v.passengers], ['2026-11-20', '10:00', 4]);
});

Deno.test('both readers agree: confirmed; they disagree: conflict with both candidates', () => {
  const ok = reviewService({ ...base, draft, templateDraft: draft, aiDraft: draft });
  assertEquals(ok.blocking, []);
  const conflict = reviewService({ ...base, draft, templateDraft: draft, aiDraft: { ...draft, passengers: 5 } });
  assertEquals(conflict.fields.passengers?.status, 'conflict');
  assertEquals(conflict.fields.passengers?.candidates, [4, 5]);
});

Deno.test('plausibility: a 2.45 lari price, a past date, more people than seats', () => {
  const r = reviewService({ ...base, draft: { ...draft, client_price: 2.45, passengers: 9, date_display: '2026-10-01T06:00:00.000Z' }, templateDraft: { ...draft, client_price: 2.45, passengers: 9, date_display: '2026-10-01T06:00:00.000Z' }, aiDraft: null });
  assert(r.fields.client_price?.reasons.includes('price_too_low'));
  assert(r.fields.passengers?.reasons.includes('over_capacity'));
  assert(r.fields.date?.reasons.includes('date_past'));
});

Deno.test('an app without the review: unconfirmed values are withheld, the rest kept', () => {
  const r = reviewService({ ...base, draft, templateDraft: draft, aiDraft: { ...draft, passengers: 5 } });
  const d = withholdUnconfirmed(draft, r);
  assertEquals([d.passengers, d.client_price, d.pickup_time], [null, 150, '10:00']);
});

Deno.test('an app without the review: an unconfirmed leg is emptied (not dropped) and every day date is withheld', () => {
  const tour = {
    kind: 'tour', date_display: '2026-11-13T00:00:00.000Z', passengers: 6, vehicle_type: 'microbus', client_price: 2000,
    tour_days: [{ day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi' }, { day: 2, date: '2026-11-14', fromPlace: 'Tbilisi', toPlace: 'Kazbegi' }],
    transfer_in: null,
    transfer_out: { date_display: '2026-11-15T02:00:00.000Z', pickup_time: '06:00', from: 'Hotel Stamba', to: 'Tbilisi International Airport', flight: 'TK 383', flight_at: null },
  };
  // the model read the departure's time and the days; neither is in the request
  const r = reviewService({ ...base, draft: tour, templateDraft: null, aiDraft: tour, inputKind: 'prose', sourceText: 'Tour 13-14 Nov 2026, 6 people, microbus, 2000 GEL' });
  assert(r.blocking.includes('transfer_out') && r.blocking.includes('tour_days'), JSON.stringify(r.blocking));
  const d = withholdUnconfirmed(tour, r);
  assert(d.transfer_out != null, 'the leg is still there, to be filled in');
  assertEquals([d.transfer_out.date_display, d.transfer_out.pickup_time, d.transfer_out.from, d.transfer_out.to, d.transfer_out.flight], [null, null, null, null, null]);
  assertEquals(d.tour_days.map((x: any) => x.date), [null, null]);
});

Deno.test('values the request never names are not confirmed: the model’s vehicle, kind, a place its quote does not name', () => {
  const chat = '[01/11/2026, 10:00:00] Nino: tomorrow 10:00 from the hotel to Tbilisi airport, 3 people, 120 lari';
  const d = { ...draft, kind: 'transfer', from_location: 'Radisson Blu Iveria', vehicle_type: 'sedan', passengers: 3, client_price: 120 };
  const r = reviewService({ ...base, draft: d, templateDraft: null, aiDraft: d, inputKind: 'chat', sourceText: chat,
    aiEvidence: { from_location: 'from the hotel' }, sources: { kind: 'ai', vehicle_type: 'ai', from_location: 'ai' } });
  for (const f of ['kind', 'vehicle_type', 'from_location'] as const) {
    assertEquals(r.fields[f]?.status, 'unconfirmed', f);
    assert(r.fields[f]?.reasons.includes('not_in_request'), f);
  }
  // named in the request: confirmed
  const named = '[01/11/2026, 10:00:00] Nino: transfer tomorrow 10:00 from Radisson Blu Iveria to Tbilisi airport, 3 people, sedan, 120 lari';
  const ok = reviewService({ ...base, draft: d, templateDraft: null, aiDraft: d, inputKind: 'chat', sourceText: named, sources: { kind: 'ai', vehicle_type: 'ai', from_location: 'ai' } });
  for (const f of ['kind', 'vehicle_type', 'from_location'] as const) assertEquals(ok.fields[f]?.status, 'confirmed', f);
});

Deno.test('a flight after midnight asks which day the pickup is', () => {
  const dep = { ...draft, flight_direction: 'departure', from_location: 'Hotel Stamba', to_location: 'Tbilisi International Airport',
    date_display: '2026-11-20T18:30:00.000Z', pickup_time: '22:30', flight_at: '2026-11-20T21:30:00.000Z' };
  const r = reviewService({ ...base, draft: dep, templateDraft: dep, aiDraft: dep });
  assert(r.fields.flight_at?.reasons.includes('flight_next_day'), JSON.stringify(r.fields.flight_at));
  assert(r.blocking.includes('flight_at'));
});

Deno.test('a tour: its flight number is reviewed too', () => {
  const tour = { kind: 'tour', date_display: '2026-11-13T00:00:00.000Z', passengers: 6, vehicle_type: 'microbus', client_price: 2000, flight_number: 'TK 999',
    tour_days: [{ day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi' }] };
  const r = reviewService({ ...base, draft: tour, templateDraft: null, aiDraft: tour, inputKind: 'prose', sourceText: 'Tour 13.11.2026 Tbilisi, 6 people, microbus, 2000 GEL' });
  assertEquals(r.fields.flight_number?.status, 'unconfirmed');
});

Deno.test('approval: a value flagged for the old kind asks nothing once the new kind does not have it', async () => {
  // midnight in Tbilisi: a tour start with no time
  const tour = { kind: 'tour', date_display: '2026-11-12T20:00:00.000Z', passengers: 4, vehicle_type: 'minivan', client_price: 150,
    tour_days: [{ day: 1, date: '2026-11-13', fromPlace: 'Tbilisi', toPlace: 'Tbilisi' }] };
  // the day's date is nowhere in the request
  const r = reviewService({ ...base, draft: tour, templateDraft: null, aiDraft: tour, inputKind: 'prose', sourceText: 'Tour in November, 4 people, minivan, 150 GEL' });
  assert(r.blocking.includes('tour_days'), JSON.stringify(r.blocking));
  const token = await signReview('company-1', r, tour, 'secret', NOW);
  const transfer = { ...draft, passengers: 4, client_price: 150 };
  const insert = { kind: 'transfer', date_display: transfer.date_display, pickup_time: '10:00', passengers: 4, vehicle_type: 'minivan', price_gel: 150, client_price: 150, flight_number: 'TK 382' };
  const res = await approveService({ token, secret: 'secret', companyId: 'company-1', draft: transfer, insert, confirmed: ['from_location', 'to_location', 'time', 'flight_number'], now: NOW });
  assert(!res.ok);
  assert(!res.issues.some((i) => i.field === 'tour_days'), JSON.stringify(res.issues));
});

Deno.test('token: signed, tied to the company, tamper-evident', async () => {
  const r = reviewService({ ...base, draft, templateDraft: draft, aiDraft: draft });
  const token = await signReview('company-1', r, draft, 'secret', NOW);
  const p = await verifyReview(token, 'secret');
  assertEquals(p?.c, 'company-1');
  assertEquals(await verifyReview(token, 'other-secret'), null);
  assertEquals(await verifyReview(token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 'secret'), null);
});

Deno.test('approval: expired review is refused', async () => {
  const r = reviewService({ ...base, draft, templateDraft: draft, aiDraft: draft });
  const token = await signReview('company-1', r, draft, 'secret', NOW);
  const insert = { date_display: draft.date_display, pickup_time: '10:00', passengers: 4, vehicle_type: 'minivan', price_gel: 150, client_price: 150, flight_number: 'TK 382' };
  const fresh = await approveService({ token, secret: 'secret', companyId: 'company-1', draft, insert, confirmed: [], now: NOW + 60_000 });
  assert(fresh.ok);
  const late = await approveService({ token, secret: 'secret', companyId: 'company-1', draft, insert, confirmed: [], now: NOW + 25 * 3600e3 });
  assert(!late.ok && late.issues[0].code === 'review_expired');
});
