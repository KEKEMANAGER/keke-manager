// Unit tests for normalize.ts — the values a booking cannot afford to get wrong.
import { assertEquals } from './assert.ts';
import {
  clockInSource, dateInSource, extractFlightNumber, headCountsMentioned, looksLikeJunkPlace, numberInSource,
  kindsNamed, parseAmount, parseClock, parseNumberToken, parsePassengers, placeInSource, quoteInSource, splitNameAndPhone,
  vehiclesNamed, withoutDates,
} from '../normalize.ts';

Deno.test('clock: 12-hour times with AM/PM', () => {
  const cases: [string, string | null][] = [
    ['4:30 PM', '16:30'], ['10:30 PM', '22:30'], ['12:15 AM', '00:15'], ['12:15 PM', '12:15'],
    ['7 pm', '19:00'], ['11AM', '11:00'], ['9.05 a.m.', '09:05'], ['12 am', '00:00'],
  ];
  for (const [t, want] of cases) assertEquals(parseClock(t).hhmm, want, t);
});

Deno.test('clock: Georgian, Russian and English day-part words', () => {
  const cases: [string, string][] = [
    ['საღამოს 7-ზე', '19:00'], ['დილის 9:30-ზე', '09:30'], ['ღამის 2-ზე', '02:00'], ['ღამის 11-ზე', '23:00'],
    ['დღის 2-ზე', '14:00'], ['в 7 вечера', '19:00'], ['в 2 ночи', '02:00'], ['в 9 утра', '09:00'], ['в 3 дня', '15:00'],
    ['7 in the evening', '19:00'], ['9:30 in the morning', '09:30'],
  ];
  for (const [t, want] of cases) assertEquals(parseClock(t).hhmm, want, t);
});

Deno.test('clock: 24-hour times; ambiguous when the document uses AM/PM elsewhere', () => {
  assertEquals(parseClock('14:30'), { hhmm: '14:30', ambiguous: false, reason: null });
  assertEquals(parseClock('22.30').hhmm, '22:30');
  assertEquals(parseClock('7:30', { docHasMeridiem: true }), { hhmm: '07:30', ambiguous: true, reason: 'ampm_unclear' });
  assertEquals(parseClock('19:30', { docHasMeridiem: true }).ambiguous, false);
  assertEquals(parseClock('no time here').hhmm, null);
  assertEquals(parseClock('25:00').hhmm, null);
});

Deno.test('clock: a written date is not a time ("20.11.2026" is not 20:11)', () => {
  for (const t of ['20.11.2026', ' 20.11.2026', 'TK 382 20.11.2026', '2026.11.20', '20/11/26', '2026-11-20', '1.12.2026 / 2.12.2026']) {
    assertEquals(parseClock(t).hhmm, null, t);
  }
  assertEquals(parseClock('20.11.2026 10.30').hhmm, '10:30');
  assertEquals(parseClock('TK 382, 20/11/2026 14:30').hhmm, '14:30');
  assertEquals(parseClock('вылет 21.15').hhmm, '21:15');
  assertEquals(withoutDates('Date: 20.11.2026, 10:00').includes('20.11'), false);
  // the check that confirms a model's time against the request
  assertEquals(clockInSource('20:11', 'Date: 20.11.2026'), false);
  assertEquals(clockInSource('11:20', 'Date: 2026.11.20'), false);
  assertEquals(clockInSource('14:05', 'arrive 14.05'), false, 'day.month or a time: needs a look');
  assertEquals(clockInSource('10:30', 'в 10.30'), true, 'minutes past 12 can only be a time');
  assertEquals(clockInSource('10:00', 'Date: 20.11.2026, 10:00'), true);
});

Deno.test('vehicles and kinds a request names in words', () => {
  assertEquals([...vehiclesNamed('Mercedes Sprinter for 14')], ['microbus']);
  assertEquals([...vehiclesNamed('მიკროავტობუსი')], ['microbus'], 'a microbus is not also a bus');
  assertEquals([...vehiclesNamed('sedan or minivan')].sort(), ['minivan', 'sedan']);
  assertEquals([...vehiclesNamed('7 people, airport pickup')], []);
  assertEquals([...kindsNamed('We are a tour operator: airport pickup tomorrow')], [], '"tour operator" names no tour');
  assertEquals([...kindsNamed('transfer from the airport')], ['transfer']);
  for (const t of ['8-day tour', '8 day tour', '11-day tour', 'multi-day tour', 'тур по Грузии']) assertEquals([...kindsNamed(t)], ['tour'], t);
  for (const t of ['1-day tour', 'one-day tour', 'day trip to Kazbegi', 'ერთდღიანი ტური', 'экскурсия']) assertEquals([...kindsNamed(t)], ['day_tour'], t);
});

Deno.test('numbers: thousands and decimal separators', () => {
  const cases: [string, number][] = [
    ['1,250', 1250], ['1.250', 1250], ['1 250', 1250], ['2,450.00', 2450], ['2.450,00', 2450], ['12,50', 12.5],
    ['99.90', 99.9], ['150', 150], ['12,500', 12500], ["1'250", 1250],
  ];
  for (const [t, want] of cases) assertEquals(parseNumberToken(t), want, t);
});

Deno.test('amount: currency, per person, several amounts', () => {
  assertEquals(parseAmount('2,450 USD'), { amount: 2450, currency: 'USD', perPerson: false, ambiguous: false, reason: null });
  assertEquals(parseAmount('140 EUR').currency, 'EUR');
  assertEquals(parseAmount('€180').amount, 180);
  assertEquals(parseAmount('250$').currency, 'USD');
  assertEquals(parseAmount('300 ლარი').currency, 'GEL');
  assertEquals(parseAmount('1 250 ₾').amount, 1250);
  assertEquals(parseAmount('150 GEL').currency, 'GEL');
  assertEquals(parseAmount('150').currency, null);
  assertEquals(parseAmount('35 USD per person').reason, 'price_per_person');
  assertEquals(parseAmount('150 / 200 GEL').reason, 'amount_several');
  // per person in every language the operators write in
  for (const t of ['150 ლარი ერთ პირზე', '150 ლარი თითო კაცზე', '60 ₾ 1 მგზავრზე', '40$ с чел.', '40 EUR за персону', '45 USD с человека',
    '35 USD/pax', '35 USD per guest', '30 EUR each', '50 GEL pp']) {
    assertEquals(parseAmount(t).perPerson, true, t);
  }
  for (const t of ['150 GEL each way', '150 GEL', '150 ლარი', '150 лари за машину', '2 450 ₾ ჯგუფზე']) {
    assertEquals(parseAmount(t).perPerson, false, t);
  }
});

Deno.test('passengers: adults + children, sums, ranges', () => {
  const cases: [string, number | null, boolean][] = [
    ['12 adults + 2 children', 14, false], ['3 взрослых + 2 детей', 5, false], ['2 ზრდასრული და 1 ბავშვი', 3, false],
    ['4+1 infant', 5, false], ['2+2', 4, false], ['6', 6, false], ['4-5', 4, true], ['6 incl. guide', 6, true],
    ['2 adults', 2, false],
  ];
  for (const [t, total, amb] of cases) {
    const r = parsePassengers(t);
    assertEquals([r.total, r.ambiguous], [total, amb], t);
  }
  const r = parsePassengers('12 adults + 2 children (ages 4 and 7)');
  assertEquals([r.adults, r.children], [12, 2]);
});

Deno.test('head counts mentioned in a chat', () => {
  assertEquals(headCountsMentioned('4 people please ... sorry 5 people not 4').sort(), [4, 5]);
  assertEquals(headCountsMentioned('6 ადამიანი, მინივენი'), [6]);
});

Deno.test('flight numbers, junk places, names with phones', () => {
  assertEquals(extractFlightNumber('W6 4470, вылет 21:15'), 'W6 4470');
  assertEquals(extractFlightNumber('KL3150'), 'KL 3150');
  assertEquals(extractFlightNumber('TK 7795 at 06:10'), 'TK 7795');
  assertEquals(extractFlightNumber('10.'), null);
  assertEquals(extractFlightNumber('A9 694'), 'A9 694');
  assertEquals(looksLikeJunkPlace('2  13.11.2026  Tbilisi city tour: Old Town, Narikala, Sulphur baths, Dry Tbilisi – Hotel Stamba'), true);
  assertEquals(looksLikeJunkPlace('Hotel Stamba'), false);
  assertEquals(splitNameAndPhone('Pieter van der Berg, +31 6 1234 5678'), { name: 'Pieter van der Berg', phone: '+31 6 1234 5678' });
  assertEquals(splitNameAndPhone('Иванов Сергей'), { name: 'Иванов Сергей', phone: null });
});

Deno.test('found in the request: quotes, numbers, places, times, dates', () => {
  const src = 'Transfer 20/11 at 4:30 PM from Tbilisi airport to Hotel Stamba, 4 people, price 1,250 GEL, flight TK 382';
  assertEquals(quoteInSource('Hotel Stamba', src), true);
  assertEquals(quoteInSource('Hotel Biltmore', src), false);
  assertEquals(numberInSource(1250, src), true);
  assertEquals(numberInSource(1350, src), false);
  assertEquals(placeInSource('Hotel Stamba, Tbilisi', src), true);
  assertEquals(placeInSource('Rooms Hotel Kazbegi', src), false);
  assertEquals(clockInSource('16:30', src), true);
  assertEquals(clockInSource('04:30', src), false);
  assertEquals(dateInSource('2026-11-20', src), true);
  assertEquals(dateInSource('2026-11-21', src), false);
  assertEquals(dateInSource('2026-11-15', '15 ნოემბერს ჩამოდის'), true);
  assertEquals(dateInSource('2026-12-03', 'Дата: 03.12.2026'), true);
});
