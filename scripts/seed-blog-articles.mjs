/**
 * Seeds content/blog/*.md with 20 Georgian tourism-transport articles.
 * Run: node scripts/seed-blog-articles.mjs
 * Re-run: FORCE=1 node scripts/seed-blog-articles.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const FORCE = process.env.FORCE === '1';
const SIGN_UP = 'https://kekemanager.com/sign-up';

const CATEGORY_NAMES = {
  'tour-operators': 'ტუროპერატორები',
  drivers: 'მძღოლები',
  hosts: 'ჰოსტები და ფლოტი',
  routes: 'მარშრუტები',
  'tourism-trends': 'ტურიზმის ტენდენციები',
};

const SLUGS = [
  { slug: 'how-to-find-reliable-tour-driver-georgia', category: 'tour-operators' },
  { slug: 'tour-transport-pricing-guide-georgia', category: 'tour-operators' },
  { slug: 'managing-tourist-driver-fleet', category: 'tour-operators' },
  { slug: 'booking-management-software-tour-companies', category: 'tour-operators' },
  { slug: 'multi-day-tour-planning-georgia', category: 'tour-operators' },
  { slug: 'how-to-become-tour-driver-georgia', category: 'drivers' },
  { slug: 'guide-driver-vs-regular-driver', category: 'drivers' },
  { slug: 'driver-earnings-georgia-tour-industry', category: 'drivers' },
  { slug: 'best-vehicles-tourist-transport', category: 'drivers' },
  { slug: 'languages-tour-drivers-should-know', category: 'drivers' },
  { slug: 'tbilisi-airport-transfer-guide', category: 'routes' },
  { slug: 'tbilisi-kazbegi-day-trip-guide', category: 'routes' },
  { slug: 'kakheti-wine-tour-transport', category: 'routes' },
  { slug: 'georgia-mountain-tours-4x4', category: 'routes' },
  { slug: 'batumi-transport-tourism-guide', category: 'routes' },
  { slug: 'how-to-start-fleet-business-georgia', category: 'hosts' },
  { slug: 'hiring-drivers-fleet-management', category: 'hosts' },
  { slug: 'vehicle-maintenance-tourist-transport', category: 'hosts' },
  { slug: 'georgia-tourism-trends-2026', category: 'tourism-trends' },
  { slug: 'b2b-transport-platforms-vs-traditional-booking', category: 'tourism-trends' },
];

/** [slug, category, title, title_en, description, description_en, keywords, readingTime, topicKa, relatedSlugs] */
const META = [
  ['how-to-find-reliable-tour-driver-georgia', 'tour-operators', 'როგორ ვიპოვოთ სანდო ტურისტული მძღოლი საქართველოში', 'How to Find a Reliable Tour Driver in Georgia', 'პრაქტიკული გზამკვლევი ტუროპერატორებისთვის: როგორ შეაფასოთ მძღოლი, მანქანა და კომუნიკაცია B2B ეკოსისტემაში.', 'Practical guide for tour operators: vetting drivers, vehicles, licensing, and communication.', ['ტურისტული მძღოლი', 'სანდო ტრანსპორტი', 'ტუროპერატორი', 'KEKE Manager'], 10, 'სანდო ტურისტული მძღოლის ძებნა', ['tour-transport-pricing-guide-georgia', 'managing-tourist-driver-fleet', 'tbilisi-airport-transfer-guide']],
  ['tour-transport-pricing-guide-georgia', 'tour-operators', 'ტურისტული ტრანსპორტის ფასების გზამკვლევი საქართველოში', 'Tour Transport Pricing Guide in Georgia', 'როგორ დააფიქსიროთ ტარიფები, დამატებითი საათები და სეზონური კოეფიციენტები B2B-ში.', 'How to set rates, overtime, and seasonal coefficients for B2B tour transport.', ['ტრანსპორტის ფასები', 'ტარიფი', 'ტუროპერატორი', 'B2B'], 9, 'ტრანსპორტის ფასების დაგეგმვა', ['how-to-find-reliable-tour-driver-georgia', 'booking-management-software-tour-companies', 'multi-day-tour-planning-georgia']],
  ['managing-tourist-driver-fleet', 'tour-operators', 'ტურისტული მძღოლების ფლოტის მართვა', 'Managing a Tourist Driver Fleet', 'ფლოტის დაგეგმვა, რეზერვი, მოვლა და ტუროპერატორთან კოორდინაცია.', 'Fleet planning, backup capacity, maintenance, and tour-operator coordination.', ['ფლოტის მართვა', 'ტურისტული ტრანსპორტი', 'მძღოლები', 'KEKE Manager'], 11, 'ტურისტული ფლოტის მართვა', ['booking-management-software-tour-companies', 'hiring-drivers-fleet-management', 'vehicle-maintenance-tourist-transport']],
  ['booking-management-software-tour-companies', 'tour-operators', 'ჯავშნების მართვის პროგრამა ტურ კომპანიებისთვის', 'Booking Management Software for Tour Companies', 'რატომ სჭირდება ტურ ოფისს ცენტრალიზებული B2B ჯავშანი და ვაუჩერი.', 'Why tour offices need centralized B2B bookings and vouchers.', ['ჯავშნების მართვა', 'ტურ კომპანია', 'B2B პლატფორმა', 'ვაუჩერი'], 10, 'ჯავშნების პროგრამული უზრუნველყოფა', ['managing-tourist-driver-fleet', 'b2b-transport-platforms-vs-traditional-booking', 'multi-day-tour-planning-georgia']],
  ['multi-day-tour-planning-georgia', 'tour-operators', 'მრავალდღიანი ტურის დაგეგმვა საქართველოში', 'Multi-Day Tour Planning in Georgia', 'ლოჯისტიკა, მძღოლი-გიდი, ღამის გაჩერებები და ტრანსპორტი.', 'Logistics, guide-drivers, overnight stops, and transport for multi-day tours.', ['მრავალდღიანი ტური', 'ლოჯისტიკა', 'ტრანსპორტი', 'საქართველო'], 12, 'მრავალდღიანი ტურის ლოჯისტიკა', ['tbilisi-kazbegi-day-trip-guide', 'kakheti-wine-tour-transport', 'guide-driver-vs-regular-driver']],
  ['how-to-become-tour-driver-georgia', 'drivers', 'როგორ გავხდეთ ტურისტული მძღოლი საქართველოში', 'How to Become a Tour Driver in Georgia', 'დოკუმენტები, უნარები, B2B პლატფორმა და შემოსავალი.', 'Documents, skills, B2B platforms, and income for new tour drivers.', ['ტურისტული მძღოლი', 'კარიერა', 'საქართველო', 'KEKE Manager'], 9, 'ტურისტული მძღოლობა', ['guide-driver-vs-regular-driver', 'driver-earnings-georgia-tour-industry', 'languages-tour-drivers-should-know']],
  ['guide-driver-vs-regular-driver', 'drivers', 'გიდ-მძღოლი თუ ჩვეულებრივი მძღოლი', 'Guide-Driver vs Regular Driver', 'როლების განსხვავება, ტარიფი და მოლოდინები ტურისტისგან.', 'Role differences, pricing, and tourist expectations.', ['გიდ-მძღოლი', 'მძღოლი', 'ტური', 'საქართველო'], 8, 'გიდ-მძღოლი და მძღოლი', ['how-to-become-tour-driver-georgia', 'driver-earnings-georgia-tour-industry', 'multi-day-tour-planning-georgia']],
  ['driver-earnings-georgia-tour-industry', 'drivers', 'მძღოლის შემოსავალი ტურიზმში საქართველოში', 'Driver Earnings in Georgia Tour Industry', 'ტარიფები, სეზონი, B2B შეკვეთები და გამჭვირვალე ანგარიშსწორება.', 'Rates, seasonality, B2B orders, and transparent payouts.', ['მძღოლის შემოსავალი', 'ტურიზმი', 'B2B', 'ტარიფი'], 10, 'მძღოლის შემოსავალი', ['tour-transport-pricing-guide-georgia', 'how-to-become-tour-driver-georgia', 'best-vehicles-tourist-transport']],
  ['best-vehicles-tourist-transport', 'drivers', 'საუკეთესო მანქანები ტურისტული ტრანსპორტისთვის', 'Best Vehicles for Tourist Transport', 'Sedan, მინივანი, SUV და 4x4 — რა ჯგუფისთვის რა კლასი.', 'Sedan, minivan, SUV, and 4x4 — matching vehicle class to groups.', ['მანქანა', 'მინივანი', 'SUV', 'ტურისტული ტრანსპორტი'], 9, 'მანქანის არჩევა ტურებისთვის', ['georgia-mountain-tours-4x4', 'vehicle-maintenance-tourist-transport', 'tbilisi-airport-transfer-guide']],
  ['languages-tour-drivers-should-know', 'drivers', 'ენები, რომლებიც ტურისტულ მძღოლმა უნდა იცოდეს', 'Languages Tour Drivers Should Know', 'ინგლისური, რუსული, გერმანული და ბაზრის მიხედვით პრიორიტეტები.', 'English, Russian, German, and market-based language priorities.', ['ენები', 'ტურისტული მძღოლი', 'კომუნიკაცია', 'ტური'], 8, 'ენობრივი უნარები მძღოლისთვის', ['how-to-become-tour-driver-georgia', 'guide-driver-vs-regular-driver', 'georgia-tourism-trends-2026']],
  ['tbilisi-airport-transfer-guide', 'routes', 'თბილისის აეროპორტის ტრანსფერის გზამკვლევი', 'Tbilisi Airport Transfer Guide', 'TBS ტერმინალები, ლოდინი, ღამის ფრენები და B2B ჯავშანი.', 'TBS terminals, wait time, night flights, and B2B booking.', ['აეროპორტის ტრანსფერი', 'თბილისი', 'TBS', 'ტრანსფერი'], 9, 'თბილისის აეროპორტის ტრანსფერი', ['how-to-find-reliable-tour-driver-georgia', 'tour-transport-pricing-guide-georgia', 'tbilisi-kazbegi-day-trip-guide']],
  ['tbilisi-kazbegi-day-trip-guide', 'routes', 'თბილისი–ყაზბეგის ერთდღიანი ტური', 'Tbilisi to Kazbegi Day Trip Guide', 'გზა, დრო, მანქანის კლასი და უსაფრთხოება სამხედრო გზაზე.', 'Route, timing, vehicle class, and safety on the Georgian Military Road.', ['ყაზბეგი', 'ერთდღიანი ტური', 'სამხედრო გზა', 'ტრანსპორტი'], 11, 'თბილისი–ყაზბეგის მარშრუტი', ['georgia-mountain-tours-4x4', 'multi-day-tour-planning-georgia', 'best-vehicles-tourist-transport']],
  ['kakheti-wine-tour-transport', 'routes', 'კახეთის ღვინის ტურის ტრანსპორტი', 'Kakheti Wine Tour Transport', 'მარშრუტები, დეგუსტაცია და პასუხისმგებელი ტრანსპორტი.', 'Routes, tastings, and responsible transport in Kakheti.', ['კახეთი', 'ღვინის ტური', 'ტრანსპორტი', 'ტური'], 10, 'კახეთის ღვინის ტური', ['multi-day-tour-planning-georgia', 'tbilisi-kazbegi-day-trip-guide', 'guide-driver-vs-regular-driver']],
  ['georgia-mountain-tours-4x4', 'routes', 'საქართველოს სამთო ტურები და 4x4', 'Georgia Mountain Tours and 4x4', 'სვანეთი, ტუშეთი, გუდაური — როდის სჭირდება 4x4.', 'Svaneti, Tusheti, Gudauri — when you need 4x4 transport.', ['4x4', 'სამთო ტური', 'სვანეთი', 'ტრანსპორტი'], 12, 'სამთო ტურები და 4x4', ['tbilisi-kazbegi-day-trip-guide', 'best-vehicles-tourist-transport', 'vehicle-maintenance-tourist-transport']],
  ['batumi-transport-tourism-guide', 'routes', 'ბათუმის ტრანსპორტი ტურიზმისთვის', 'Batumi Transport for Tourism', 'აეროპორტი, ზღვისპირა ზონა, სეზონი და ტრანსფერები.', 'Airport, seaside zone, seasonality, and transfers in Batumi.', ['ბათუმი', 'ტრანსპორტი', 'ტურიზმი', 'ტრანსფერი'], 9, 'ბათუმის ტურისტული ტრანსპორტი', ['tbilisi-airport-transfer-guide', 'georgia-tourism-trends-2026', 'tour-transport-pricing-guide-georgia']],
  ['how-to-start-fleet-business-georgia', 'hosts', 'როგორ დავიწყოთ ფლოტის ბიზნესი საქართველოში', 'How to Start a Fleet Business in Georgia', 'იურიდიული ფორმა, მანქანები, B2B გაყიდვა და KEKE Manager.', 'Legal setup, vehicles, B2B sales, and platform onboarding.', ['ფლოტის ბიზნესი', 'ტურისტული ტრანსპორტი', 'საქართველო', 'KEKE Manager'], 10, 'ფლოტის ბიზნესის დაწყება', ['hiring-drivers-fleet-management', 'managing-tourist-driver-fleet', 'vehicle-maintenance-tourist-transport']],
  ['hiring-drivers-fleet-management', 'hosts', 'მძღოლების დაქირავება და ფლოტის მართვა', 'Hiring Drivers and Fleet Management', 'რეკრუტინგი, შემოწმება, გრაფიკი და KPI.', 'Recruiting, vetting, schedules, and KPIs for fleet hosts.', ['დაქირავება', 'ფლოტი', 'მძღოლი', 'მართვა'], 9, 'მძღოლების დაქირავება', ['how-to-start-fleet-business-georgia', 'how-to-find-reliable-tour-driver-georgia', 'driver-earnings-georgia-tour-industry']],
  ['vehicle-maintenance-tourist-transport', 'hosts', 'მანქანის მოვლა ტურისტულ ტრანსპორტში', 'Vehicle Maintenance for Tourist Transport', 'სეზონური სერვისი, საბურავები, უსაფრთხოება და დაზოგვის ცრუ ეკონომია.', 'Seasonal service, tires, safety, and false economies.', ['მოვლა', 'ტექნიკა', 'უსაფრთხოება', 'ფლოტი'], 8, 'მანქანის მოვლა ტურებისთვის', ['best-vehicles-tourist-transport', 'georgia-mountain-tours-4x4', 'managing-tourist-driver-fleet']],
  ['georgia-tourism-trends-2026', 'tourism-trends', 'საქართველოს ტურიზმის ტენდენციები 2026', 'Georgia Tourism Trends 2026', 'B2B ტრანსპორტი, FIT, ევროპული ბაზარი და ტექნოლოგია.', 'B2B transport, FIT growth, European market, and technology.', ['ტურიზმი 2026', 'ტენდენციები', 'საქართველო', 'B2B'], 11, 'ტურიზმის ტენდენციები 2026', ['b2b-transport-platforms-vs-traditional-booking', 'booking-management-software-tour-companies', 'batumi-transport-tourism-guide']],
  ['b2b-transport-platforms-vs-traditional-booking', 'tourism-trends', 'B2B ტრანსპორტის პლატფორმა vs ტრადიციული ჯავშანი', 'B2B Transport Platforms vs Traditional Booking', 'WhatsApp, Excel და ცენტრალიზებული ეკოსისტემა — შედარება.', 'WhatsApp, Excel, and centralized ecosystems compared.', ['B2B პლატფორმა', 'ჯავშანი', 'KEKE Manager', 'ტრანსპორტი'], 10, 'B2B პლატფორმა და ტრადიციული ჯავშანი', ['booking-management-software-tour-companies', 'georgia-tourism-trends-2026', 'how-to-find-reliable-tour-driver-georgia']],
];

const SECTION_TITLES = [
  ['რატომ არის ეს თემა კრიტიკული 2026-ში', 'ბაზრის კონტექსტი', 'ტუროპერატორის პერსპექტივა'],
  ['ძირითადი გამოწვევები და შეცდომები', 'რისკები', 'რეალური მაგალითები'],
  ['საუკეთესო პრაქტიკები', 'პროცესი', 'ინსტრუმენტები'],
  ['KEKE Manager B2B ეკოსისტემა', 'რეგისტრაცია და ონბორდინგ', 'ვაუჩერი, GPS და ისტორია'],
  ['ფასი, SLA და კონტრაქტი', 'გამჭვირვალე ტარიფი', 'გადახდის წესები'],
  ['მასშტაბირება სეზონზე', 'რეზერვი და ბექაპი', 'რევიუ და გაუმჯობესება'],
  ['დამატებითი რესურსები', 'დაკავშირებული სტატიები', 'შემდეგი ნაბიჯები'],
];

function spreadDates(count) {
  const start = new Date('2026-05-01');
  const end = new Date('2026-05-27');
  const span = end - start;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + Math.round((span * i) / (count - 1)));
    return d.toISOString().slice(0, 10);
  });
}

function pickRelated(slug, all, n = 3) {
  const others = all.filter((s) => s !== slug);
  const idx = Math.max(0, SLUGS.findIndex((x) => x.slug === slug));
  const out = [];
  for (let i = 1; i <= n; i++) out.push(others[(idx + i * 3) % others.length]);
  return out;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function yamlEscape(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function blogLink(slug, label) {
  return `[${label}](/blog/${slug})`;
}

function genParagraphs(topic, keywords, relatedSlugs) {
  const kw = keywords.join(', ');
  const l1 = relatedSlugs[0] ? blogLink(relatedSlugs[0], 'დაკავშირებული სტატია 1') : '';
  const l2 = relatedSlugs[1] ? blogLink(relatedSlugs[1], 'დაკავშირებული სტატია 2') : '';
  const l3 = relatedSlugs[2] ? blogLink(relatedSlugs[2], 'დაკავშირებული სტატია 3') : '';
  const templates = [
    `საქართველოს ტურისტული ტრანსპორტის ბაზარზე **${topic}** 2026 წელს განსაკუთრებულ მნიშვნელობას იძენის: ჯგუფური ტურები, FIT მოგზაურები და B2B აგენტები ერთდროულად იზრდიან. გასაღები სიტყვები: ${kw}. პროფესიონალური ოპერატორი აღარ ეყრდება მხოლოდ WhatsApp-ს — სჭირდება ისტორია, ვაუჩერი და დადასტურებული შესრულება.`,
    `ტუროპერატორი, ფლოტის მფლობელი თუ გიდ-მძღოლი — ყველას სჭირდება ერთიანი სურათი **${topic}**-ის გარშემო. [KEKE Manager](${SIGN_UP}) აერთიანებს მხარეებს: ჯავშანი, მძღოლი, მანქანის კლასი, ენები და GPS. ეს ამცირებს ბოლო წუთის ცვლილებებს და „დავიწყებულ“ ტრანსფერებს.`,
    `პრაქტიკული გამოცდილება გვიჩვენებს: ყველაზე ძვირი შეცდომა არის უმოწმესო პარტნიორი. ${topic} მოითხოვს დოკუმენტებს, საპილოტო რეისს და წერილობით SLA-ს. დამატებითი მასალა: ${l1}, ${l2}.`,
    `ფასის მხოლოდ მინიმუმზე გადაწყვეტილება ხშირად ნიშნავს ორმაგ გადახდას — რე-ბუქინგს, კომპენსაციას ან ტურისტის უარყოფას. **${topic}** უნდა იყოს გამჭვირვალე: ძირითადი ტარიფი, ლოდინი, დამატებითი საათი, გაუქმება. იხილეთ ასევე ${l3}.`,
    `აეროპორტის ტრანსფერი, ერთდღიანი ტური თუ მრავალდღიანი პროგრამა — მანქანის კლასი იცვლება. Sedan, მინივანი 7+1, SUV და 4x4 არ არის ურთიერთშეცვლადი. ${topic} გეგმავს ამ განსხვავებას წინასწარ, არა გზაზე.`,
    `ენობრივი ბარიერი პირველ დღეს ჩანს. ინგლისური საბაზისოა; ევროპული ბაზრისთვის გერმანული/პოლონური პლიუსია. ${topic} + კომუნიკაცია = ნაკლები ჩივილი ოფისში.`,
    `სეზონური პიკი (მაისი–სექტემბერი) მოითხოვს რეზერვს. ერთი მძღოლი ავარიით ან ავადმყოფობით ტურს არყოფს. პლატფორმაზე ხედავთ ხელმისაწვდომობას რეალურ დროში — არა ორმოცდახუთმეტი ზეპირი შეტყობინების შემდეგ.`,
    `მთის მარშრუტებზე (ყაზბეგი, სვანეთი, ტუშეთი) ტექნიკური მოწმობა და საბურავები გადამწყვეტია. ${topic} უსაფრთხოებას უთავსებს კომფორტს — ტურისტი არ იცის გზის სირთულე, მაგრამ ოპერატორი უნდა იცოდეს.`,
    `B2B ეკოსისტემაში ვაუჩერი და ფინანსური თვალყური მნიშვნელოვანია. ნაღდი „ბოლო წუთზე“ ზრდის დავების რისკს. [დარეგისტრირდით KEKE Manager-ზე](${SIGN_UP}) ტუროპერატორად, მძღოლად ან ფლოტის ჰოსტად — როლის მიხედვით.`,
    `კახეთის ღვინის ტური, ბათუმის სიგნალური ზონა, თბილისის ისტორიული ცენტრი — სხვადასხვა ლოჯისტიკა. ${topic} ნიშნავს მარშრუტის, დროის ფანჯრის და პარკინგის წინასწარ დაგეგმვას.`,
    `FIT სეგმენტი იზრდა: მცირე ჯგუფები ინდივიდუალურ მოთხოვნებს აყენებენ. სისტემაში უნდა ჩანდეს ყველა ცვლილება — არა ზეპირი ზარი. ეს არის **${topic}** ციფრულ ეპოქაში.`,
    `ფლოტის მფლობელი იგივე პრობლემით იტანს ტვირთს: მძღოლის ძებნა ყოველ ჯავშანზე. ცენტრალიზებული B2B აძლევს მზად ბაზას ტუროპერატორებს და სტაბილურ დატვირთვას მძღოლებს.`,
    `რეიტინგი და ისტორია უნდა ეფუძნებოდეს რეალურ ტურებს. ${topic} ხელს უწყობს გამეორებად პარტნიორობას — კარგი მძღოლი ღირს ოქროს.`,
    `კონტრაქტში ჩაწერეთ: მიღების დრო, ლოდინის ლიმიტი, ბაგაჟი, ბავშვის სავარძელი, გაუქმება. ${kw} — ყველა ეს პუნქტი უნდა იყოს ხილული ჯავშანში.`,
    `2026-ის ტენდენცია: ტექნოლოგიური პლატფორმები ტრადიციულ Excel-ს ცვლის. ${topic} არა მოდაა — ოპერაციული აუცილებლობა კონკურენტულ ბაზარზე.`,
    `VIP ჯგუფებისთვის მიუთითეთ მძღოლი წინასწარ — იგივე პირი მთელ ტურში. ${topic} ამატებს ნდობას და ამცირებს ცვლილების სტრესს.`,
    `ღამის ფრენები TBS-ზე მოითხოვენ ადგილობრივ მძღოლს, რომელიც ტერმინალებს იცნობს. ლოდინის პოლიტიკა უნდა იყოს ხელშეკრულებაში, არა დავის საგანში.`,
    `მრავალდღიან პროგრამაში მძღოლი ხშირად არის გიდიც — მოლოდინები უნდა შეუთავსოთ ტარიფს. ${l1} და ${l2} დაგეხმარებათ დეტალებში.`,
    `ტექნიკური მოვლა არის მოგება, არა ხარჯი: გაფხიზლებული ფლოტი ნაკლებ ავარიას ნიშნავს. ${topic} უსაფრთხოებას პირდაპირ უკავშირდება.`,
    `ტუროპერატორი, რომელიც იყენებს B2B პლატფორმას, სწრაფად იღებს შეთავაზებებს, ადარებს ისტორიას და ხსნის ოპერატორის დროს. ეს არის **KEKE Manager**-ის ძირითადი ღირებულება.`,
  ];
  const out = [];
  for (let i = 0; i < 32; i++) out.push(templates[i % templates.length]);
  return out;
}

function buildArticleDef(row) {
  const [slug, category, title, title_en, description, description_en, keywords, readingTime, topic, relatedSlugs] = row;
  const paras = genParagraphs(topic, keywords, relatedSlugs);
  let pi = 0;
  const nextPara = () => paras[pi++] || paras[paras.length - 1];

  const sections = SECTION_TITLES.map(([h2, h3a, h3b]) => ({
    h2,
    blocks: [
      { h3: h3a, text: `${nextPara()}\n\n${nextPara()}` },
      { h3: h3b, text: `${nextPara()}\n\n${nextPara()}` },
    ],
  }));

  const tldr = [
    `${topic} — სისტემური მიდგომა, არა იმპროვიზაცია.`,
    `KEKE Manager B2B: ჯავშანი, ვერიფიცირებული მძღოლები, ფლოტი, GPS — [რეგისტრაცია](${SIGN_UP}).`,
    `გამოიყენეთ SLA, საპილოტო რეისი და რეიტინგი პარტნიორის არჩევამდე.`,
    `დაკავშირებული: ${relatedSlugs.slice(0, 2).map((s) => blogLink(s, s.replace(/-/g, ' ').slice(0, 35))).join(', ')}.`,
    `სეზონი 2026: რეზერვი და მანქანის კლასის სწორი შერჩევა.`,
  ];

  const intro = `**${title}** — ეს სტატია შექმნილია ტუროპერატორების, მძღოლებისა და ფლოტის მფლობელებისთვის, ვინც პროფესიონალურ **ტურისტულ ტრანსპორტს** საქართველოში ემსახურება. ${topic} განსაზღვრავს ტურის ხარისხს, მოგებას და რეპუტაციას. დაიწყეთ B2B ეკოსისტემაში: [დარეგისტრირდით KEKE Manager-ზე](${SIGN_UP}) — ტურის ჯავშანი, ვაუჩერი და ისტორია ერთ პანელში.`;

  return {
    slug,
    category,
    title,
    title_en,
    description,
    description_en,
    keywords,
    readingTime,
    tldr,
    intro,
    sections,
    extraTable: {
      title: 'შედარებითი ცხრილი: არხები და კონტროლი',
      intro: `${topic} — სამი ხშირი მიდგომა:`,
      headers: ['არხი', 'სიჩქარე', 'კონტროლი', 'ისტორია / GPS'],
      rows: [
        ['WhatsApp / ზეპირი', 'მაღალი', 'დაბალი', 'არა'],
        ['Excel + ტელეფონი', 'საშუალო', 'საშუალო', 'შეზღუდული'],
        ['KEKE Manager B2B', 'მაღალი', 'მაღალი', 'სრული'],
      ],
    },
    steps: {
      title: 'ნაბიჯ-ნაბიჯ გეგმა',
      intro: `პრაქტიკული თანმიმდევრობა **${topic}**-ისთვის:`,
      items: [
        'განსაზღვრეთ მოთხოვნა: თარიღი, კლასი, ენა, მარშრუტი.',
        'განათავსეთ მოთხოვნა B2B პლატფორმაზე ან მიიღეთ შეთავაზება.',
        'შეამოწმეთ დოკუმენტები და ჩაიტარეთ საპილოტო რეისი საჭიროებისას.',
        'დააფიქსირეთ SLA და ტარიფი წერილობით ჯავშანში.',
        'დაამატეთ რეზერვი პიკის დღეებისთვის.',
        'შეაფასეთ შესრულება და განაახლეთ პარტნიორის რეიტინგი.',
      ],
    },
    closing: `**${topic}** პროფესიონალიზმს ნიშნავს: ვერიფიკაცია, ტექნოლოგია, გამჭვირვალე ფასი. KEKE Manager აგროვებს ტუროპერატორებს, მძღოლებსა და ფლოტს ერთ B2B სივრცეში საქართველოში — [დაიწყეთ აქ](${SIGN_UP}).`,
    supplement: paras,
    faq: [
      {
        question: `${topic} — რა პირველი ნაბიჯია?`,
        answer: 'განსაზღვრეთ მოთხოვნა (თარიღი, კლასი, ენა) და გამოიყენეთ B2B პლატფორმა ვერიფიცირებული პარტნიორის ძებნისთვის.',
      },
      {
        question: 'რატომ არა მხოლოდ WhatsApp?',
        answer: 'ჯგუფური ჩატი არ ინახავს ისტორიას, SLA-ს და ვაუჩერს. სეზონში ეს ხდება ძვირი შეცდომა.',
      },
      {
        question: 'როგორ ჩავერთო KEKE Manager-ში?',
        answer: 'დარეგისტრირდით როლის მიხედვით (ტუროპერატორი, მძღოლი, ფლოტი) და გამოიყენეთ ჯავშანი + GPS + ვაუჩერი.',
      },
    ],
    english: [
      `This article covers **${title_en}** for Georgia's tourist transport ecosystem. Tour operators, drivers, and fleet hosts face the same pressure in 2026: more FIT groups, tighter timelines, and higher expectations on the first mile (airport) and the last mile (mountain roads).`,
      `${topic} is not a nice-to-have — it defines reviews, repeat bookings, and B2B trust. Ad-hoc WhatsApp sourcing is fast but opaque; Excel lacks real-time availability. **KEKE Manager** centralizes verified partners, bookings, vouchers, and GPS. [Sign up](${SIGN_UP}) to post or accept professional transport work.`,
      `Best practice: document requirements (vehicle class, languages, wait policy), run a pilot when onboarding a new partner, and keep seasonal backup capacity. Price on a written matrix — base fare, overtime, cancellation — not on last-minute cash.`,
      `Related reading: ${relatedSlugs.map((s) => blogLink(s, s)).join(', ')}. For operators scaling multi-day programs, align driver role (guide-driver vs driver) with guest expectations.`,
      `Mountain and wine routes need the right vehicle and maintenance discipline; airport nights need local drivers who know TBS terminals. Technology is shifting the market from informal chats to accountable B2B platforms — early adopters win agency contracts with fewer midnight emergencies.`,
      `Keywords: ${keywords.join(', ')}. Whether you manage a fleet or drive yourself, treat transport as part of the product, not an afterthought. That is how Georgian tourism keeps growing without sacrificing safety or margin.`,
    ],
  };
}

const ARTICLE_DEFS = Object.fromEntries(META.map((row) => [row[0], buildArticleDef(row)]));

function section(h2, blocks) {
  let out = `## ${h2}\n\n`;
  for (const b of blocks) {
    if (b.h3) out += `### ${b.h3}\n\n`;
    out += `${b.text.trim()}\n\n`;
  }
  return out;
}

function table(headers, rows) {
  const sep = headers.map(() => '---');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function numberedSteps(items) {
  return items.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

function buildGeorgianBody(def) {
  const parts = ['## 📌 TL;DR\n', ...def.tldr.map((b) => `- ${b}`), '', def.intro, ''];
  for (const sec of def.sections) parts.push(section(sec.h2, sec.blocks));
  if (def.extraTable) {
    parts.push(
      `## ${def.extraTable.title}\n\n${def.extraTable.intro}\n\n${table(def.extraTable.headers, def.extraTable.rows)}\n`,
    );
  }
  if (def.steps) {
    parts.push(`## ${def.steps.title}\n\n${def.steps.intro}\n\n${numberedSteps(def.steps.items)}\n`);
  }
  if (def.closing) parts.push(def.closing);
  let body = parts.join('\n').trim();
  let i = 0;
  while (wordCount(body.split('## English')[0]) < 1200 && def.supplement?.length) {
    body += `\n\n${def.supplement[i % def.supplement.length]}`;
    i++;
    if (i > def.supplement.length * 4) break;
  }
  return body;
}

function buildEnglish(def) {
  return `## English\n\n${def.english.join('\n\n')}`;
}

function buildFrontmatter(meta) {
  const lines = [
    '---',
    `slug: ${meta.slug}`,
    `title: ${yamlEscape(meta.title)}`,
    `title_en: ${yamlEscape(meta.title_en)}`,
    `description: ${yamlEscape(meta.description)}`,
    `description_en: ${yamlEscape(meta.description_en)}`,
    `keywords: ${JSON.stringify(meta.keywords)}`,
    `date: ${meta.date}`,
    `author: ${yamlEscape(meta.author)}`,
    `category: ${meta.category}`,
    `categoryName: ${yamlEscape(meta.categoryName)}`,
    `readingTime: ${meta.readingTime}`,
    `featuredImage: ${yamlEscape(meta.featuredImage)}`,
    `language: ka`,
    'faq:',
  ];
  for (const item of meta.faq) {
    lines.push(`  - question: ${yamlEscape(item.question)}`);
    lines.push(`    answer: ${yamlEscape(item.answer)}`);
  }
  lines.push(`related: ${JSON.stringify(meta.related)}`);
  lines.push('---');
  return lines.join('\n');
}

function buildMarkdown(def, date, related) {
  const georgian = buildGeorgianBody(def);
  const fm = buildFrontmatter({
    slug: def.slug,
    title: def.title,
    title_en: def.title_en,
    description: def.description,
    description_en: def.description_en,
    keywords: def.keywords,
    date,
    author: 'Akaki Kachibaia',
    category: def.category,
    categoryName: CATEGORY_NAMES[def.category],
    readingTime: def.readingTime,
    featuredImage: `/blog/${def.slug}-cover.svg`,
    faq: def.faq,
    related,
  });
  return `${fm}\n\n${georgian}\n\n---\n\n${buildEnglish(def)}\n`;
}

function main() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  const dates = spreadDates(SLUGS.length);
  const allSlugs = SLUGS.map((s) => s.slug);
  let written = 0;
  let skipped = 0;
  for (let i = 0; i < SLUGS.length; i++) {
    const { slug, category } = SLUGS[i];
    const def = ARTICLE_DEFS[slug];
    const file = path.join(CONTENT_DIR, `${slug}.md`);
    if (fs.existsSync(file) && !FORCE) {
      console.log(`Skip (exists): ${slug}`);
      skipped++;
      continue;
    }
    const related = pickRelated(slug, allSlugs);
    const md = buildMarkdown({ ...def, slug, category }, dates[i], related);
    fs.writeFileSync(file, md, 'utf8');
    const wc = wordCount(md.split('## English')[0]);
    console.log(`Wrote ${slug}.md (${wc} ka words)`);
    written++;
  }
  console.log(`Done: ${written} written, ${skipped} skipped → ${CONTENT_DIR}`);
}

main();
