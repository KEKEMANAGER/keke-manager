/** Georgian cities — თბილისი first, then alphabetical (ka locale). */
const ALL_CITIES = [
  'თბილისი',
  'ახალქალაქი',
  'ახალციხე',
  'ბათუმი',
  'ბოლნისი',
  'გორი',
  'გრიგოლეთი',
  'ზესტაფონი',
  'ზუგდიდი',
  'თელავი',
  'თერჯოლა',
  'კასპი',
  'ლანჩხუთი',
  'მარნეული',
  'მცხეთა',
  'ოზურგეთი',
  'ონი',
  'რუსთავი',
  'სამტრედია',
  'საჩხერე',
  'სენაკი',
  'სიღნაღი',
  'ქობულეთი',
  'ქუთაისი',
  'ყვარელი',
  'შუახევი',
  'ჩოხატაური',
  'ცაგერი',
  'ძალისი',
  'წალენჯიხა',
  'წყალტუბო',
  'ხაშური',
  'ხობი',
  'ხონი',
] as const;

export type GeorgianCity = (typeof ALL_CITIES)[number];

function buildSortedCities(): readonly string[] {
  const tbilisi = 'თბილისი';
  const rest = ALL_CITIES.filter((c) => c !== tbilisi).sort((a, b) => a.localeCompare(b, 'ka'));
  return [tbilisi, ...rest];
}

export const GEORGIAN_CITIES: readonly string[] = buildSortedCities();

export function filterGeorgianCities(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...GEORGIAN_CITIES];
  return GEORGIAN_CITIES.filter((c) => c.toLowerCase().includes(q));
}

export function isValidGeorgianCity(value: string | null | undefined): boolean {
  const v = value?.trim();
  if (!v) return false;
  return GEORGIAN_CITIES.includes(v);
}
