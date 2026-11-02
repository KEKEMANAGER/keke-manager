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
