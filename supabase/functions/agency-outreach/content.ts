/**
 * The introduction letter to Georgian tour companies, as Akaki approved it
 * (30 October 2026). The logo is an inline attachment: cid:keke-logo.
 */

export const SUBJECT = 'KEKE Manager: ინსტრუმენტი ტურისტული კომპანიებისთვის და არა კონკურენტი';

const INTRO =
  'მე ვარ აკაკი ქაჩიბაია, KEKE Manager-ის დამფუძნებელი. ოთხი წელი ტურისტული ' +
  'ტრანსპორტის მართვაში ვიმუშავე და კარგად ვიცი, რამდენ დროს და ენერგიას ' +
  'ართმევს კომპანიას მძღოლის მოძებნა, დაუსრულებელი ზარები და ბოლო წუთის ' +
  'ცვლილებები. KEKE Manager სწორედ ამ პრობლემის გადასაჭრელად შევქმენით.';

const WHAT =
  'B2B ტურისტული სატრანსპორტო პლატფორმა, რომელიც ტურისტულ კომპანიებს ' +
  'ვერიფიცირებულ მძღოლებთან პირდაპირ აკავშირებს. ჩვენ არ გვყავს ავტოპარკი და ' +
  'არ ვყიდით ტრანსფერს ან ტურს. გთავაზობთ სისტემას, სადაც თქვენი კომპანიის ' +
  'ტრანსპორტი ერთ ადგილას იმართება.';

const TOOL = [
  'ტურებს არ ვყიდით და ტურისტებთან პირდაპირ არ ვმუშაობთ.',
  'თქვენს კლიენტებს არ ვუკავშირდებით. კლიენტი, ფასი და პირობები ყოველთვის თქვენია.',
  'პლატფორმით მხოლოდ საქართველოში რეგისტრირებული ტურისტული კომპანიები სარგებლობენ. ' +
    'უცხოელ ტუროპერატორებს პირდაპირ არ ვემსახურებით და ქართულ კომპანიებთან ვამისამართებთ.',
  'კომპანიისთვის რეგისტრაცია და სარგებლობა უფასოა. მძღოლის ჰონორარიდან საკომისიოს არ ვიღებთ.',
];

const HOW = [
  'ქმნით ჯავშანს: ტრანსფერს, ერთდღიან ან მრავალდღიან ტურს. შეგიძლიათ უბრალოდ ' +
    'ჩასვათ კლიენტის წერილი, PDF ან WhatsApp-ის მიმოწერა და ჯავშანს სისტემა თავად შეავსებს.',
  'ჯავშანი მიდის მხოლოდ ვერიფიცირებულ, თავისუფალ და შესაფერისი მანქანის მქონე მძღოლებთან.',
  'მძღოლი ადასტურებს და ხედავთ, ვინ შეასრულებს, რა მანქანით და რა ნომრით.',
  'კლიენტს უგზავნით მზა ვაუჩერს, მგზავრობისას კი მანქანას რუკაზე ადევნებთ თვალს.',
];

const GET = [
  'მხოლოდ შემოწმებული მძღოლები: მართვის მოწმობა, პირადობა, ტექპასპორტი და მანქანის ფოტოები ხელით მოწმდება.',
  'GPS რეალურ დროში მთელი მგზავრობის განმავლობაში.',
  'ციფრული ვაუჩერი და აეროპორტისთვის დასაბეჭდი დასახვედრი ნიშანი თქვენი ლოგოთი.',
  'ჩატი მძღოლთან და ჯავშნის სტატუსი რეალურ დროში.',
  'რამდენიმე მანქანა ერთ ჯავშანზე დიდი ჯგუფებისთვის.',
  'ყველა ჯავშნის ისტორია ერთ ადგილას.',
];

const NOW =
  'დღეს პლატფორმაზე 130 მძღოლია დარეგისტრირებული, აქედან 93 ვერიფიცირებულია. ' +
  'ტურისტული კომპანიებიდან უკვე 19 შემოგვიერთდა. აპლიკაცია ხელმისაწვდომია ' +
  'App Store-სა და Google Play-ზე, ვებ-ვერსია კი kekemanager.com-ზე.';

const START =
  'დაწყება მარტივია: დარეგისტრირდით kekemanager.com-ზე როგორც ტურისტული კომპანია. ' +
  'დადასტურების შემდეგ პირველი ჯავშნის შექმნას რამდენიმე წუთი სჭირდება. ' +
  'დეტალები დანართ პრეზენტაციაშია.';

const DEMO =
  'სიამოვნებით გაჩვენებთ სისტემას ცოცხლად, ამას 20 წუთი ეყოფა. ' +
  'უპასუხეთ ამ წერილს ან დაგვირეკეთ.';

const OPT_OUT = 'თუ მსგავსი წერილების მიღება არ გსურთ, უპასუხეთ სიტყვით „არა“ და აღარ შეგაწუხებთ.';

const SIGN_URL = 'https://kekemanager.com/sign-up';

const GOLD = '#F5A623';
const GOLD_DARK = '#B9790A';
const INK = '#1A1A2E';
const MUTED = '#5F6472';

const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${t}</p>`;
const h = (t: string) =>
  `<h2 style="margin:22px 0 10px;font-size:16px;line-height:1.4;color:${GOLD_DARK};font-weight:800">${t}</h2>`;
const li = (t: string) => `<li style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${INK}">${t}</li>`;
const ul = (items: string[]) => `<ul style="margin:0 0 6px;padding-left:20px">${items.map(li).join('')}</ul>`;
const ol = (items: string[]) => `<ol style="margin:0 0 6px;padding-left:20px">${items.map(li).join('')}</ol>`;

export function renderOutreach(logoSrc: string): { subject: string; html: string; text: string } {
  const html = `<!doctype html>
<html lang="ka"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Noto Sans Georgian','BPG Arial',Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;border-top:4px solid ${GOLD}">
<tr><td style="padding:28px 30px 8px">
  <img src="${logoSrc}" width="64" height="72" alt="KEKE Manager" style="display:block;margin:0 0 18px">
  ${p('მოგესალმებით,')}
  ${p(INTRO)}
  ${h('რა არის KEKE Manager')}
  ${p(WHAT)}
  ${h('მთავარი: ჩვენ თქვენი ინსტრუმენტი ვართ და არა კონკურენტი')}
  ${ul(TOOL)}
  ${h('როგორ მუშაობს')}
  ${ol(HOW)}
  ${h('რას იღებთ')}
  ${ul(GET)}
  <div style="height:8px"></div>
  ${p(NOW)}
  ${p(START)}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:${GOLD};border-radius:10px">
    <a href="${SIGN_URL}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:800;color:#111111;text-decoration:none">კომპანიის რეგისტრაცია</a>
  </td></tr></table>
  ${p(DEMO)}
  <p style="margin:18px 0 4px;font-size:15px;line-height:1.6;color:${INK}">პატივისცემით,<br>
  <strong>აკაკი ქაჩიბაია</strong><br>
  <span style="color:${MUTED}">დამფუძნებელი, KEKE Manager</span></p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${MUTED}">
    +995 551 003 411 · <a href="mailto:info@kekemanager.com" style="color:${GOLD_DARK};text-decoration:none">info@kekemanager.com</a> ·
    <a href="https://kekemanager.com" style="color:${GOLD_DARK};text-decoration:none">kekemanager.com</a>
  </p>
</td></tr>
</table>
<p style="max-width:600px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#8A8F99;text-align:center">${OPT_OUT}<br>
შპს „კეკე მენეჯერი“ · ს/კ 402371189 · თბილისი</p>
</td></tr></table>
</body></html>`;

  const lines = [
    'მოგესალმებით,', '', INTRO, '', 'რა არის KEKE Manager', WHAT, '',
    'მთავარი: ჩვენ თქვენი ინსტრუმენტი ვართ და არა კონკურენტი',
    ...TOOL.map((t) => `• ${t}`),
    '', 'როგორ მუშაობს',
    ...HOW.map((t, i) => `${i + 1}. ${t}`),
    '', 'რას იღებთ',
    ...GET.map((t) => `• ${t}`),
    '', NOW, '', START, `რეგისტრაცია: ${SIGN_URL}`, '', DEMO, '',
    'პატივისცემით,', 'აკაკი ქაჩიბაია', 'დამფუძნებელი, KEKE Manager',
    '+995 551 003 411 · info@kekemanager.com · kekemanager.com', '', '—', OPT_OUT,
    'შპს „კეკე მენეჯერი“ · ს/კ 402371189 · თბილისი',
  ];
  return { subject: SUBJECT, html, text: lines.join('\n') };
}
