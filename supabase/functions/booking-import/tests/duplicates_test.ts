// Is the booking about to be created already there? A question for the agency,
// asked only when an existing booking looks like the same trip.
import { assert, assertEquals } from './assert.ts';
import { findDuplicates, pickupClock, reviewKey, searchWindow, tbilisiDay } from '../duplicates.ts';

// 15 Nov 2026, Tbilisi wall clock → ISO instant (Tbilisi is UTC+4 all year).
const at = (clock: string, day = '2026-11-15') => new Date(Date.parse(`${day}T${clock}:00+04:00`)).toISOString();

let n = 0;
const booking = (o: Record<string, unknown>) => ({
  id: `b${++n}`, voucher_code: `KEKE-T${n}`, kind: 'transfer', status: 'pending', date_display: at('10:00'), pickup_time: '10:00',
  from_location: 'Tbilisi International Airport', to_location: 'Hotel Stamba, Tbilisi', route: null, flight_number: null, passengers: 4, ...o,
}) as any;
const transfer = (o: Record<string, unknown> = {}) => ({
  kind: 'transfer', date_display: at('10:00'), pickup_time: '10:00', from_location: 'Tbilisi International Airport',
  to_location: 'Stamba Hotel', flight_number: null, passengers: 4, ...o,
});

Deno.test('duplicates: the same flight on the same day', () => {
  const m = findDuplicates(transfer({ flight_number: 'TK 382' }), [booking({ flight_number: 'tk-382', pickup_time: '14:00', date_display: at('14:00') })]);
  assertEquals(m.map((x) => [x.reason, x.voucher, x.time]), [['same_flight', 'KEKE-T1', '14:00']]);
});

Deno.test('duplicates: two different flights are two different trips', () => {
  assertEquals(findDuplicates(transfer({ flight_number: 'TK 382' }), [booking({ flight_number: 'A9 652' })]), []);
});

Deno.test('duplicates: the same places within an hour; not two hours apart; not to another hotel', () => {
  assertEquals(findDuplicates(transfer({ pickup_time: '10:40', date_display: at('10:40') }), [booking({})]).map((x) => x.reason), ['same_trip']);
  assertEquals(findDuplicates(transfer({ pickup_time: '12:30', date_display: at('12:30') }), [booking({})]), []);
  assertEquals(findDuplicates(transfer({ to_location: 'Rooms Hotel Kazbegi' }), [booking({})]), []);
});

Deno.test('duplicates: cancelled or rejected bookings, and other days, are not duplicates', () => {
  assertEquals(findDuplicates(transfer(), [booking({ status: 'cancelled' }), booking({ status: 'rejected' })]), []);
  assertEquals(findDuplicates(transfer(), [booking({ date_display: at('10:00', '2026-11-16') })]), []);
});

Deno.test('duplicates: the Tbilisi day decides, not the UTC one (a pickup at 02:00 Tbilisi is the evening before in UTC)', () => {
  assertEquals(tbilisiDay(at('02:00')), '2026-11-15');
  assertEquals(at('02:00').slice(0, 10), '2026-11-14');
  const early = transfer({ pickup_time: '02:00', date_display: at('02:00') });
  assertEquals(findDuplicates(early, [booking({ pickup_time: '02:30', date_display: at('02:30') })]).length, 1);
  assertEquals(findDuplicates(early, [booking({ pickup_time: '23:30', date_display: at('23:30', '2026-11-14') })]).length, 0);
});

Deno.test('duplicates: tours starting the same day; a tour and a transfer never', () => {
  const tour = { kind: 'tour', date_display: at('00:00'), pickup_time: null, from_location: 'Tbilisi', to_location: 'Tbilisi', passengers: 6 };
  assertEquals(findDuplicates(tour, [booking({ kind: 'tour', date_display: at('00:00'), pickup_time: null })]).map((x) => x.reason), ['same_tour']);
  assertEquals(findDuplicates(tour, [booking({})]), []);
  assertEquals(findDuplicates(transfer(), [booking({ kind: 'tour', date_display: at('09:30') })]), []);
});

Deno.test('duplicates: a day tour from the same place within an hour', () => {
  const day = { kind: 'day_tour', date_display: at('09:00'), pickup_time: '09:00', from_location: 'Hotel Stamba, Tbilisi', to_location: 'Kazbegi' };
  assertEquals(findDuplicates(day, [booking({ kind: 'day_tour', from_location: 'Stamba Hotel', to_location: 'Mtskheta', date_display: at('09:30'), pickup_time: '09:30' })]).map((x) => x.reason), ['same_trip']);
  assertEquals(findDuplicates(day, [booking({ kind: 'day_tour', from_location: 'Rooms Hotel', date_display: at('09:30'), pickup_time: '09:30' })]), []);
});

Deno.test('duplicates: at most five, the closest first; nothing about the guests', () => {
  const many = [50, 5, 40, 10, 30, 20].map((min) => booking({ pickup_time: `10:${String(min).padStart(2, '0')}`, date_display: at(`10:${String(min).padStart(2, '0')}`), passenger_name: 'Pieter', passenger_phone: '+31 6 1234 5678' }));
  const m = findDuplicates(transfer(), many);
  assertEquals(m.map((x) => x.time), ['10:05', '10:10', '10:20', '10:30', '10:40']);
  const text = JSON.stringify(m);
  assert(!text.includes('Pieter') && !text.includes('1234'), text);
});

Deno.test('duplicates: an insert without a readable date is never compared', () => {
  assertEquals(findDuplicates(transfer({ date_display: null }), [booking({})]), []);
  assertEquals(findDuplicates(transfer({ date_display: '15.11.2026' }), [booking({})]), []);
});

Deno.test('pickup clock: the booking’s own time, else the time of its date, never a midnight placeholder', () => {
  assertEquals(pickupClock({ pickup_time: '7:05', date_display: at('09:00') }), '7:05');
  assertEquals(pickupClock({ pickup_time: null, date_display: at('09:00') }), '09:00');
  assertEquals(pickupClock({ pickup_time: null, date_display: at('00:00') }), null);
});

Deno.test('search window: a day and a half either side; no window without a date', () => {
  const w = searchWindow(at('10:00'));
  assert(w !== null);
  if (w) assertEquals([w.from, w.to], ['2026-11-13T18:00:00.000Z', '2026-11-16T18:00:00.000Z']);
  assertEquals(searchWindow(null), null);
  assertEquals(searchWindow('soon'), null);
});

Deno.test('review key: a stable fingerprint, never the token itself', async () => {
  const a = await reviewKey('token.abc');
  assertEquals(a, await reviewKey('token.abc'));
  assert(a !== (await reviewKey('token.abd')));
  assert(/^[0-9a-f]{64}$/.test(a));
  assert(!a.includes('token'));
});
