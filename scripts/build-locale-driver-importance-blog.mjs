/**
 * Writes /public/blog/ka|en/how-important-is-the-driver-during-tour-transfer/index.html
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMarketingHeaderHtml, escapeHtml, OG_IMAGE_URL, SITE_URL } from './seoBuildMeta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SLUG = 'how-important-is-the-driver-during-tour-transfer';
const DATE = '2026-06-09';
const COVER = `${SITE_URL}/blog/${SLUG}-cover.svg`;

const PRERENDER_CSS = `
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fff;color:#111;line-height:1.65}
a{color:#EF9F27}
.keke-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #eee;max-width:1200px;margin:0 auto;flex-wrap:wrap;gap:12px}
.keke-logo{font-weight:900;font-size:15px;color:#111;text-decoration:none;letter-spacing:.04em}
.keke-nav{display:flex;align-items:center;flex-wrap:wrap;gap:4px 16px}
.keke-nav a{color:#111;text-decoration:none;font-weight:500;font-size:15px}
.keke-lang{font-size:14px;color:#444;font-weight:600}
.keke-lang a{color:#444}
.keke-signup{background:#111;color:#fff!important;padding:8px 14px;border-radius:10px;font-weight:700}
.keke-main{max-width:720px;margin:0 auto;padding:32px 24px 48px}
.keke-main h1{font-size:1.75rem;line-height:1.25;margin:0 0 16px}
.keke-main h2{font-size:1.25rem;margin:32px 0 12px}
.keke-main p{margin:0 0 14px}
.keke-cta{margin-top:36px;padding:20px;background:#faf6ef;border-radius:12px;border:1px solid #f0e4cc}
.keke-cta a{display:inline-block;margin-top:10px;padding:12px 20px;background:#EF9F27;color:#111;font-weight:700;text-decoration:none;border-radius:8px}
.keke-footer{text-align:center;padding:24px;color:#888;font-size:14px;border-top:1px solid #eee;margin-top:48px}
.keke-faq dt{font-weight:700;margin-top:18px}
.keke-faq dd{margin:6px 0 0;padding:0}
`.trim();

const KA = {
  lang: 'ka',
  locale: 'ka_GE',
  title: 'რამდენად მნიშვნელოვანია მძღოლი ტურის ან ტრანსფერის დროს? | KEKE Manager',
  description:
    'მძღოლი არ არის მხოლოდ მძღოლი — ის შენი კომპანიის სახეა. გაიგე, რატომ განსაზღვრავს სწორი მძღოლი ტურის ხარისხს, რეიტინგს და განმეორებით ჯავშნებს.',
  canonical: `${SITE_URL}/blog/ka/${SLUG}/`,
  hrefKa: `${SITE_URL}/blog/ka/${SLUG}/`,
  hrefEn: `${SITE_URL}/blog/en/${SLUG}/`,
  nav: { blog: 'ბლოგი', signIn: 'შესვლა', signUp: 'რეგისტრაცია', home: 'მთავარი' },
  footer: '© KEKE Manager · B2B ტურისტული ტრანსპორტი · საქართველო',
  h1: 'რამდენად მნიშვნელოვანია მძღოლი ტურის ან ტრანსფერის დროს?',
  faqTitle: 'ხშირი კითხვები',
  ctaTitle: 'KEKE Manager-ზე ვერიფიცირებული მძღოლები ხელმისაწვდომია',
  ctaSub: 'კომპანიისთვის პლატფორმა უფასოა — ჯავშნები, GPS, ვაუჩერი.',
  ctaBtn: 'რეგისტრაცია →',
  relatedLabel: 'დაკავშირებული სტატია:',
  relatedText: 'სანდო ტურისტული მძღოლის პოვნა საქართველოში',
  relatedHref: '/blog/ka/how-to-find-reliable-tour-driver-georgia/',
  body: `
<p>ბათუმიდან სვანეთამდე დაახლოებით ექვსი საათი გზაა. ამ ექვსი საათის განმავლობაში მძღოლი — შენი კომპანიის ერთადერთი წარმომადგენელია ველზე. არც ოფისი, არც გიდი ტელეფონში, არც მარკეტინგის გუნდი. მხოლოდ ის ადამიანი, მანქანა და გზა. ტურისტი ამ დროს გადაწყვეტს — ღირს თუ არა შემდეგ ჯავშანი, რეკომენდაცია თუ უარყოფითი მიმოხილვა.</p>
<p>იგივე ლოგიკა მუშაობს ფლუღჰაფენიდან სასტუმრომდე ტრანსფერზეც. პირველი შეხება ხდება მანქანის კარის გახსნისას. თუ მძღოლი დროულია, მშვიდი და პროფესიონალი — ტური კარგ საფუძველზე იწყება. თუ არა — ყველაფერი, რაც შენ ოფისში დაგეგმე, ნაწილობრივ უკვე დაზიანებულია. მძღოლი არ არის „ტრანსპორტის ხაზი" შენს ბიუჯეტში — ის შენი ბრენდია გზაზე.</p>
<p>ოთხი წლის გამოცდილებიდან ერთი რამ ნათლად ჩანს: ტურისტი ხშირად არ იხსენებს CRM-ს, ვაუჩერის ნომერს ან ოფისის მისამართს. იხსენებს მძღოლს — სახელით, ტონით, იმით, თუ როგორ გრძნობინა თავს უსაფრთხოდ. ამიტომ ხარისხიანი მძღოლი არის ინვესტიცია, არა ხარჯი, რომელსაც „ყველაზე იაფს" ვეძებთ.</p>
<h2>უსაფრთხოება პირველ რიგში</h2>
<p>კაზბეგის გზა ზამთარში სხვა რეალობაა, ვიდრე ივლის-აგვისტოს ტურისტული ნაკადი. ყინული ტრამპლინი, ნისლი, ოფლაინეს ზონები — ეს არ არის „ცოტა რთული გზა" პრეზენტაციაში. ეს არის ყოველდღიური სამუშაო გარემო.</p>
<p>ერთხელ (და არა ერთხელ) ვნახე, როგორ გაიწვევდა „იაფი" მძღოლი ჯგუფს მთაში საბურავების არასწორი მდგომარეობით. ტურისტებმა არაფერი იცოდნენ — მაგრამ ოპერატორმა იცოდა და მეორე დღეს უკვე სხვა კომპანიას ეძებდნენ. ასეთი შემთხვევები არ ჩანს Excel-ში, მაგრამ ძალიან კარგად ჩანს Booking-ის კომენტარებში.</p>
<p>ვერიფიკაცია აქ არ არის ბიუროკრატია. ეს არის ფილტრი: ვინ შეიძლება შენს სახელზე მართოს მანქანა? მართვის მოწმობა, პირადობა, მანქანის კლასი — მინიმუმი. მაგრამ პრაქტიკაში კიდევ უფრო მნიშვნელოვანია გამოცდილება: ვინ მართავს ზამთრის ტრანსფერს ფლუღჰაფენიდან, ვინ არ ჩქარობს სვანეთის პასზე, ვინ იცის როდის უნდა გაჩერდეს და როდის — არა.</p>
<p>ოქტომბერში კაზბეგის გზაზე ხშირად ერთი და იგივე შეცდომა მეორდება: მძღოლი, ვინც „ნორმალურ მანქანას" აყენებს მთის პირობებთან. ტურისტი ეს არ ხედავს. ხედავ შენ — როცა ჯგუფი ცოტა უფრო გვიან ბრუნდება, ცოტა უფრო დაღლილია და შემდეგ ტურში უკვე ნაკლებად ენდობა გიდს. უსაფრთხო მძღოლი ხარისხსაც იცავს.</p>
<h2>ადგილობრივი ცოდნა, რომელსაც ფული ვერ ყიდულობ</h2>
<p>TripAdvisor-ზე ყველაფერი უკვე დაწერილია — მაგრამ ტურისტი მაინც იხარებს, როცა მძღოლი უხსნის, სადაც „მხოლოდ ადგილობრივები იციან".</p>
<p>ჩაჩის ქარხანა, სადაც ნამდვილად არის კარგი ჩაი. ძველი ეკლესია გზის პირას, სადაც ხალხი აღარ ჩერდება. ხინკლის ადგილი, სადაც ორმოცი წელია ერთნაირად ამზადებენ. ეს არის ის „დამატებითი ღირებულება", რომელიც შენს პაკეტში ხშირად უფასოდ შედის — მაგრამ მხოლოდ იმ შემთხვევაში, თუ მძღოლი იცის სად უნდა გაჩერდეს.</p>
<p>ზაფხულის სეზონში, როცა ყველა მარშრუტი დატვირთულია, განსხვავება ჩანს პატარა დეტალებში: ვინ იცის ალტერნატიული გზა ბორჯომისკენ, ვინ არ აყენებს ჯგუფს ორმოც წუთს მზის ქვეშ პარკინგზე, ვინ ეხმარება ფოტოს გადაღებაში ისე, რომ ტური არ გაუცდეს.</p>
<p>კახეთის ღვინის ტურზე ერთი კარგი გაჩერება — სწორ დროს, სწორ ადგილას — ხშირად უფრო მეტს ღირს, ვიდრე ერთი დამატებითი ღვინის დეგუსტაცია პროგრამაში. მძღოლი, ვინც იცის სად არის ხალხიანი და სად — თავისუფალი, ტურს არ ართულებს. ეს უნარი სახელმძღვანელოსგან ვერ ისწავლი — ან გაქვს, ან არა.</p>
<h2>პირველი შთაბეჭდილება = შენი ბიზნესი</h2>
<p>წარმოიდგინე ორი სცენა თბილისის აეროპორტში.</p>
<p><strong>კარგი:</strong> მძღოლი დროულადაა, ხელში აქვს ტაბლეტი შენი კომპანიის სახელით, მანქანა სუფთაა, ტურისტს ეუბნება ინგლისურად ან მის ენაზე, ბარგი უსაფრთხოდ ეტევა. ტურისტი ფიქრობს: „კარგი არჩევანი გავაკეთე."</p>
<p><strong>ცუდი:</strong> ხუთი წუთის ნაცვლად თხუთმეთი. ზარი არ პასუხობს. მანქანა ბუნკერში, სული და ცუდი სუნით. ტურისტი ფიქრობს: „ვინ მომიყვანა აქ?" — და ეს კითხვა შენს მისამართით მიდის, არა მძღოლის.</p>
<p>პირველი შთაბეჭდილება ხშირად უფრო მტკიცეა, ვიდრე მეოთხე დღის გზაზე ლექსი. ამიტომ ოპერატორები, ვინც სერიოზულად უყურებენ ხარისხს, მძღოლს აღარ უყურებენ „ტრანსპორტის ხაზად" — უყურებენ ბრენდის წარმომადგენლობად.</p>
<p>ფორმა, სუფთა სალონი და მცირე დეტალები — წყალი, ტილო, დამაგრებული ბარგი — ხშირად უფრო მეტს ნიშნავს, ვიდრე ფასდაკლება. ტურისტი ამას ფოტოდაც აგზავნის მეგობრებთან: „აი, როგორ დაგვხვდნენ საქართველოში." შენი მძღოლი იქ არის.</p>
<h2>სანდოობა და კომუნიკაცია</h2>
<p>ყველა ოპერატორს აქვს ისტორია: მძღოლი არ პასუხობს, ტურისტი დგას წვიმაში, ფრენა დაგვიანდა და ვინმე უნდა მიიღოს გადაწყვეტილება — სწრაფად.</p>
<p>მრავალდღიან ტურზე ეს კიდევ უფრო კრიტიკულია. დღე 1-ზე დაგვიანებული ტრანსფერი მთელ პროგრამას არყვნის. მძღოლი, ვინც დროულად აგზავნის სტატუსს („გზაზე ვარ", „სასტუმროში ჩავედით"), ოფისს საშუალებას აძლევს პრობლემა ადრე დაინახოს, არა ღამით.</p>
<p>WhatsApp-ში ეს ქაოსია. ერთ ჯგუფში 200 შეტყობინება, ვინ დადასტურა, ვინ გაუქმდა, ვინ სად არის — და ოპერატორი ხელით ამოწმებს ყველაფერს. ზაფხულის სეზონში ეს არის პირდაპირ ფინანსური და რეპუტაციული რისკი.</p>
<p><a href="/">KEKE Manager</a>-ში ჯავშანი, push-შეტყობინება და GPS ერთ პანელშია. როცა ხედავ, სად არის მანქანა და მძღოლი იღებს ჯავშანს ერთი დაკლიკებით, ნაკლებია სიტუაცია „ვერ დავუკავშირდი".</p>
<p>ფრენის დაგვიანება, სასტუმროს შეცვლა, დამატებითი ბარგი — ეს ყოველდღიური სცენარია. მძღოლი, ვინც ოპერატორს არ „აწუხებს" ყოველ ხუთ წუთში, მაგრამ დროულად ატყობინებს სტატუსს, ოფისს ნაკლებ სტრესს აძლევს. კომუნიკაცია არის ნაწილი სერვისისა, არა დამატებითი ფუნქცია.</p>
<h2>რბილი უნარები, რომელსაც აპი ვერ ჩაანაცვლებს</h2>
<p>მართვის მოწმობას შეგიძლია გადაამოწმო. მოთმინებას — არა.</p>
<p>მძღოლი, ვინც დაგვიანებულ ფრენას, დაღლილ მოგზაურს და არასწორ მისამართს უბრალოდ „შვება" — ეს არის ოქროს ღირს. ტურისტი ამას აღნიშნავს მიმოხილვაში: „გიორგი იყო შესანიშნავი, მშვიდი, დაგვეხმარა ყველაფერში."</p>
<p>ენის ცოდნა მნიშვნელოვანია, მაგრამ უფრო მნიშვნელოვანია ტონი: როდის ელაპარაკო, როდის გაჩუმდე, როდის ჰკითხო „კარგად ხარ?" და როდის უბრალოდ მიიყვანო სასტუმრომდე დაღლილი ადამიანი.</p>
<p>მრავალენოვან ჯგუფში ეს კიდევ უფრო ჩანს. მძღოლი, ვინც ინგლისურს თანაბრად კარგად უსმენს გერმანულსაც ან პოლონურსაც, ოპერატორს ბევრ სათაურ ზარს აგარიდებს. ენა არის კომფორტი, არა მხოლოდ ინფორმაცია.</p>
<p>ამ ხარისხს პირველი ტრანსფერი გამოაჩენს. ამიტომ გამოცდილი ოპერატორები ახალ მძღოლს არ „ამატებენ სიაში" — ჯერ საპილოტო რეისს აძლევენ, ნახულობენ რეაქციას, შემდეგ ენდობიან ძვირად ღირებულ ჯგუფს.</p>
<h2>რა შეგიძლია გააკეთო დღესვე</h2>
<p>დაიწყე მარტივად: ყოველი ახალი მძღოლი ერთი საპილოტო რეისით. ერთი აეროპორტის ტრანსფერი ან ერთი მოკლე ტური — საკმარისია, რომ ნახო დროულობა, კომუნიკაცია და ტონი. მეორე ნაბიჯი: დოკუმენტები და მანქანის კლასი წერილობით, არა ზეპირად. მესამე: ერთი სისტემა ჯავშნისთვის, სადაც ისტორია რჩება.</p>
<p>მძღოლი განსაზღვრავს, ტურისტი შენს კომპანიას გაიხსენებს როგორც პროფესიონალს თუ როგორც რისკს. ეს არჩევანი ყოველდღე იღება — ხელით, თუ სისტემით. უკეთესი ოპერატორები ორივეს იყენებენ.</p>
<p>თუ გინდა სისტემურად იპოვო ასეთი მძღოლები — და არა ყოველ ჯავშანზე ხელახლა ძებნა — იხილე <a href="/blog/ka/how-to-find-reliable-tour-driver-georgia/">სანდო მძღოლის პოვნის გზამკვლევი</a> და დაიწყე <a href="/sign-up">რეგისტრაცია</a> KEKE Manager-ზე.</p>`,
  faq: [
    {
      q: 'რატომ ითვლება მძღოლი ტურ-კომპანიის სახედ?',
      a: 'ტურისტი ხშირად პირველად მძღოლს ხვდება — აეროპორტში, სასტუმროს წინ ან ტურის პირველ დილას. მისი ტონი, დროულობა და მანქანის მდგომარეობა პირდაპირ გადადის შენს ბრენდზე, მაშინაც კი, ოფისში ყველაფერი იდეალურადაა დაგეგმილი.',
    },
    {
      q: 'რა ვერიფიკაცია სჭირდება ტურისტულ მძღოლს საქართველოში?',
      a: 'საბაზისო მინიმუმია მოქმედი მართვის მოწმობა და პირადობა — პლატფორმაზე ეს დოკუმენტები ვერიფიცირებული უნდა იყოს. მაგრამ პროფესიონალური ოპერატორი ასევე ამოწმებს მანქანის კლასს, ტექნიკურ მდგომარეობას, ენებს და რეალურ გამოცდილებას მთის ან აეროპორტის მარშრუტებზე.',
    },
    {
      q: 'KEKE Manager-ი როგორ ეხმარება ოპერატორს სწორი მძღოლის პოვნაში?',
      a: 'პლატფორმაზე ხედავ ვერიფიცირებულ მძღოლებს, მანქანის კლასს, ენებს და რეიტინგს. ჯავშანი, ვაუჩერი და GPS ერთ სისტემაშია — აღარ გჭირდება ზეპირი ძებნა ყოველ ახალ ტურზე.',
    },
    {
      q: 'კომისიას იხდის თუ არა KEKE Manager მოგზაურობებიდან?',
      a: 'არა — ტურ კომპანიებისთვის პლატფორმა უფასოა, კომისია ტურის ფასიდან არ იჭრება.',
    },
  ],
};

const EN = {
  lang: 'en',
  locale: 'en_US',
  title: 'How Important Is the Driver During a Tour or Transfer? | KEKE Manager',
  description:
    'The driver is the face of your tour company. Learn why the right driver determines tour quality, review scores, and repeat bookings — and how to find them.',
  canonical: `${SITE_URL}/blog/en/${SLUG}/`,
  hrefKa: `${SITE_URL}/blog/ka/${SLUG}/`,
  hrefEn: `${SITE_URL}/blog/en/${SLUG}/`,
  nav: { blog: 'Blog', signIn: 'Sign in', signUp: 'Sign up', home: 'Home' },
  footer: '© KEKE Manager · B2B tourist transport · Georgia',
  h1: 'How Important Is the Driver During a Tour or Transfer?',
  faqTitle: 'Frequently asked questions',
  ctaTitle: 'Verified drivers, real-time GPS, zero commission',
  ctaSub: 'KEKE Manager is free for tour operators.',
  ctaBtn: 'Sign up →',
  relatedLabel: 'Related guide:',
  relatedText: 'How to Find a Reliable Tour Driver in Georgia',
  relatedHref: '/blog/en/how-to-find-reliable-tour-driver-georgia/',
  body: `
<p>Six hours from Batumi to Mestia. No guide in the van, no office on the line, no marketing team in the background — just your driver, the road, and your client. For those six hours, the driver <em>is</em> your company. The tourist decides whether the next booking, the referral, or the one-star review belongs to you.</p>
<p>Same logic applies to a Tbilisi airport pickup. The first human contact is the person opening the car door. Get that right and the tour starts on solid ground. Get it wrong and everything you planned in the office is already damaged. The driver is not a transport line item — they are your brand in the field.</p>
<p>After four years in this market, one pattern is obvious: guests rarely remember your CRM, voucher number, or office address. They remember the driver — by name, by tone, by how safe they felt. A strong driver is an investment, not a line item you always minimize.</p>
<h2>Safety first</h2>
<p>The Kazbegi highway in winter is a different world from a busy August run. Ice, fog, dead zones with no signal — this is not a “slightly challenging road” on a slide deck. It is daily work.</p>
<p>I have seen budget drivers push groups into the mountains on the wrong tyres. Tourists often do not know the risk. Operators do — and by day two the group is already shopping for another company. That cost rarely shows up in a spreadsheet. It shows up in reviews.</p>
<p>Verification is not paperwork for its own sake. It is a filter: who is allowed to drive under your brand? Licence and ID are the baseline. In practice, experience matters more — who handles winter airport runs, who does not rush Svaneti passes, who knows when to stop and when to keep moving.</p>
<p>On the Kazbegi road in October, the same mistake repeats: a driver who treats mountain conditions like a city run. The guest does not see the risk. You do — when the group returns a little later, a little more tired, and trusts the guide a little less. A safe driver protects quality as much as reputation.</p>
<h2>Local knowledge money cannot buy</h2>
<p>TripAdvisor lists the famous stops. Tourists still light up when the driver says, “There is a place only locals still go.”</p>
<p>The family winery off the main road. The church by the highway nobody photographs anymore. The khinkali spot that has not changed in forty years. That invisible value often ends up in five-star comments — but only if the driver knows where to pull over.</p>
<p>In peak summer, when every route is packed, the gap shows in small things: who knows the alternate road toward Borjomi, who does not leave a group in the sun for forty minutes, who helps with photos without making the day late.</p>
<p>On a Kakheti wine tour, one well-timed stop — right place, right moment — often beats an extra tasting on paper. The driver who knows where crowds build up and where you still have space keeps the day smooth. You cannot train that from a manual. Either they have it or they do not.</p>
<h2>The first impression is the business</h2>
<p>Picture two scenes at Tbilisi airport.</p>
<p><strong>Good:</strong> Driver on time, name sign with your company logo, clean car, calm greeting in the guest’s language, luggage handled properly. The client thinks: <em>Good choice.</em></p>
<p><strong>Bad:</strong> Fifteen minutes instead of five. Calls go to voicemail. Car smells, looks tired, parked awkwardly. The client thinks: <em>Who sent me here?</em> — and that question is aimed at you, not the driver.</p>
<p>First impressions stick harder than a great story on day four. Serious operators do not treat drivers as a line item. They treat them as brand representatives in the field.</p>
<p>Clean car, clear name sign, water, towels, luggage handled properly — small details guests photograph and send home: “This is how we were met in Georgia.” Your driver is in that frame.</p>
<h2>Reliability and communication</h2>
<p>Every operator has the story: driver not answering, guests standing in the rain, flight delayed, someone must decide fast.</p>
<p>In a WhatsApp group with two hundred messages, nobody knows who confirmed what. In summer that is a direct hit to revenue and reputation.</p>
<p>On <a href="/">KEKE Manager</a>, bookings, push alerts, and GPS live in one panel. When you can see the vehicle and the driver accepts in one tap, you get fewer “could not reach anyone” moments.</p>
<p>Delayed flights, hotel changes, extra bags — daily reality. The driver who does not spam you every five minutes but updates status on time keeps the office calmer. Communication is part of service, not an optional extra.</p>
<h2>Soft skills no app can replace</h2>
<p>You can verify a licence. You cannot verify patience.</p>
<p>The driver who absorbs a delayed flight, a tired traveler, and a wrong hotel address without drama is worth keeping. Guests name that person in reviews: <em>George was calm, helpful, professional.</em></p>
<p>Language helps. Tone matters more: when to talk, when to stay quiet, when to ask if someone is okay and when to simply deliver them to the hotel.</p>
<p>You see this on the first transfer. That is why experienced operators do not add a new driver to the VIP list immediately — they run a pilot route, watch the reaction, then trust them with a high-value group.</p>
<h2>What you can do today</h2>
<p>Start simple: every new driver gets one pilot run — one airport transfer or one short tour is enough to see punctuality, communication, and tone. Step two: documents and vehicle class in writing, not on a voice note. Step three: one booking system that keeps history.</p>
<p>The driver decides whether your company is remembered as professional or risky. That choice happens every day — manually or with structure. Strong operators use both.</p>
<p>If you want to find drivers like this systematically — not from scratch on every booking — read our <a href="/blog/en/how-to-find-reliable-tour-driver-georgia/">guide to finding reliable tour drivers</a> and <a href="/sign-up">sign up</a> on KEKE Manager.</p>`,
  faq: [
    {
      q: 'Why is the driver considered the "face" of a tour company?',
      a: 'The tourist often meets the driver first — at the airport, outside the hotel, or on day one of the tour. Their tone, punctuality, and the condition of the vehicle reflect directly on your brand, even when everything in the office was planned perfectly.',
    },
    {
      q: 'What verification should a tour driver in Georgia have?',
      a: 'At minimum, a valid driving licence and ID — on a professional platform these should be verified. Serious operators also check vehicle class, technical condition, languages, and real experience on mountain or airport routes.',
    },
    {
      q: 'How does KEKE Manager help operators find the right driver?',
      a: 'You see verified drivers, vehicle class, languages, and ratings on one platform. Bookings, vouchers, and GPS sit in the same system — so you are not starting from scratch on every new tour.',
    },
    {
      q: 'Does KEKE Manager take a commission on trips?',
      a: 'No — the platform is free for tour companies. KEKE Manager does not take a cut from trip prices.',
    },
  ],
};

function faqHtml(faq, title) {
  const items = faq
    .map((item) => `<dt>${escapeHtml(item.q)}</dt><dd>${escapeHtml(item.a)}</dd>`)
    .join('');
  return `<h2>${escapeHtml(title)}</h2><dl class="keke-faq">${items}</dl>`;
}

function schemas(cfg) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: cfg.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: cfg.h1,
    datePublished: DATE,
    dateModified: DATE,
    author: { '@type': 'Organization', name: 'KEKE Manager' },
    publisher: { '@type': 'Organization', name: 'KEKE Manager', url: SITE_URL },
    inLanguage: cfg.lang,
    url: cfg.canonical,
    image: [COVER],
    description: cfg.description,
  };
  return [faqSchema, blogSchema];
}

function buildPage(cfg) {
  const jsonLd = schemas(cfg)
    .map((s, i) => `<script type="application/ld+json" id="keke-schema-${i}">${JSON.stringify(s)}</script>`)
    .join('\n    ');

  const related = `<p><strong>${escapeHtml(cfg.relatedLabel)}</strong> <a href="${escapeHtml(cfg.relatedHref)}">${escapeHtml(cfg.relatedText)}</a> · <a href="/">${escapeHtml(cfg.nav.home)}</a></p>`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(cfg.lang)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(cfg.title)}</title>
  <meta name="description" content="${escapeHtml(cfg.description)}" />
  <meta name="author" content="KEKE Manager" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(cfg.canonical)}" />
  <link rel="alternate" hreflang="ka" href="${escapeHtml(cfg.hrefKa)}" />
  <link rel="alternate" hreflang="en" href="${escapeHtml(cfg.hrefEn)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(cfg.canonical)}" />
  <meta property="og:title" content="${escapeHtml(cfg.title)}" />
  <meta property="og:description" content="${escapeHtml(cfg.description)}" />
  <meta property="og:image" content="${escapeHtml(COVER)}" />
  <meta property="og:site_name" content="KEKE Manager" />
  <meta property="og:locale" content="${escapeHtml(cfg.locale)}" />
  <meta property="article:published_time" content="${DATE}" />
  <meta property="article:modified_time" content="${DATE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(cfg.title)}" />
  <meta name="twitter:description" content="${escapeHtml(cfg.description)}" />
  <meta name="twitter:image" content="${escapeHtml(COVER)}" />
  ${jsonLd}
  <link rel="icon" href="/favicon.ico" />
  <style>${PRERENDER_CSS}</style>
</head>
<body>
  ${buildMarketingHeaderHtml(cfg.lang, {
    langKaHref: cfg.hrefKa,
    langEnHref: cfg.hrefEn,
  })}
  <main class="keke-main">
    <h1>${escapeHtml(cfg.h1)}</h1>
    ${cfg.body}
    ${related}
    ${faqHtml(cfg.faq, cfg.faqTitle)}
    <div class="keke-cta">
      <strong>${escapeHtml(cfg.ctaTitle)}</strong>
      <p style="margin:8px 0 0">${escapeHtml(cfg.ctaSub)}</p>
      <a href="/sign-up">${escapeHtml(cfg.ctaBtn)}</a>
    </div>
  </main>
  <footer class="keke-footer">${escapeHtml(cfg.footer)}</footer>
</body>
</html>`;
}

function writeLocale(cfg, localeDir) {
  const out = path.join(ROOT, 'public', 'blog', localeDir, SLUG, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildPage(cfg), 'utf8');
  console.log('Wrote', out);
}

// Cover placeholder
const coverPath = path.join(ROOT, 'public', 'blog', `${SLUG}-cover.svg`);
if (!fs.existsSync(coverPath)) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect x="0" y="520" width="1200" height="110" fill="#EF9F27"/>
  <text x="60" y="280" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800">KEKE Manager Blog</text>
  <text x="60" y="360" fill="#EF9F27" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="600">Driver importance on tour &amp; transfer</text>
</svg>`;
  fs.writeFileSync(coverPath, svg, 'utf8');
}

writeLocale(KA, 'ka');
writeLocale(EN, 'en');
