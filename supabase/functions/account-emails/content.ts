/**
 * "Your company is registered" — the email a tour company gets right after
 * it signs up. Company details are the ones it typed in; everything that
 * came from a person is escaped. The logo is an inline attachment.
 */

export type CompanyWelcomeInput = {
  companyName: string;
  email: string;
  phone?: string | null;
  idCode?: string | null;
  director?: string | null;
};

export const WELCOME_SUBJECT = 'თქვენი კომპანია წარმატებით დარეგისტრირდა KEKE Manager-ზე';

const SIGN_IN_URL = 'https://kekemanager.com/sign-in';

const NEXT = [
  'ჩვენი გუნდი ამოწმებს კომპანიის მონაცემებს. დადასტურების შემდეგ სრული წვდომა გაიხსნება.',
  'შედით kekemanager.com-ზე ან KEKE Manager-ის აპლიკაციაში (App Store, Google Play) იმავე ელფოსტით და პაროლით.',
  'შექმენით პირველი ჯავშანი: ტრანსფერი, ერთდღიანი ან მრავალდღიანი ტური. შეგიძლიათ უბრალოდ ჩასვათ ' +
    'კლიენტის წერილი ან PDF და ჯავშანს სისტემა თავად შეავსებს.',
];

const CONTACT = 'კითხვების შემთხვევაში დაგვიკავშირდით: +995 551 003 411 · info@kekemanager.com';

const NOT_YOU =
  'ეს წერილი გამოიგზავნა, რადგან ამ ელფოსტით KEKE Manager-ზე კომპანია დარეგისტრირდა. ' +
  'თუ ეს თქვენ არ ყოფილხართ, მოგვწერეთ info@kekemanager.com-ზე.';

const GOLD = '#F5A623';
const GOLD_DARK = '#B9790A';
const INK = '#1A1A2E';
const MUTED = '#5F6472';
const LINE = '#E5E7EB';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rows(i: CompanyWelcomeInput): [string, string][] {
  const out: [string, string][] = [['კომპანია', i.companyName]];
  if (i.idCode?.trim()) out.push(['საიდენტიფიკაციო კოდი', i.idCode.trim()]);
  if (i.director?.trim()) out.push(['დირექტორი / მენეჯერი', i.director.trim()]);
  if (i.phone?.trim()) out.push(['ტელეფონი', i.phone.trim()]);
  out.push(['ელფოსტა (შესასვლელად)', i.email]);
  return out;
}

export function renderCompanyWelcome(
  input: CompanyWelcomeInput,
  logoSrc: string,
): { subject: string; html: string; text: string } {
  const name = input.companyName.trim() || input.email;
  const details = rows({ ...input, companyName: name });

  const detailRows = details
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;font-size:13px;color:${MUTED};border-bottom:1px solid ${LINE};white-space:nowrap">${k}</td>` +
        `<td style="padding:8px 12px;font-size:14px;font-weight:700;color:${INK};border-bottom:1px solid ${LINE}">${esc(v)}</td></tr>`,
    )
    .join('');
  const steps = NEXT.map(
    (t) => `<li style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${INK}">${t}</li>`,
  ).join('');

  const html = `<!doctype html>
<html lang="ka"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${WELCOME_SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Noto Sans Georgian','BPG Arial',Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;border-top:4px solid ${GOLD}">
<tr><td style="padding:28px 30px 10px">
  <img src="${logoSrc}" width="64" height="72" alt="KEKE Manager" style="display:block;margin:0 0 18px">
  <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">მოგესალმებით,</p>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${INK}"><strong>${esc(name)}</strong> წარმატებით დარეგისტრირდა KEKE Manager-ზე. მადლობა, რომ შემოგვიერთდით!</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;overflow:hidden;margin:0 0 20px">${detailRows}</table>
  <h2 style="margin:0 0 10px;font-size:16px;line-height:1.4;color:${GOLD_DARK};font-weight:800">რა ხდება შემდეგ</h2>
  <ol style="margin:0 0 12px;padding-left:20px">${steps}</ol>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:${GOLD};border-radius:10px">
    <a href="${SIGN_IN_URL}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:800;color:#111111;text-decoration:none">შესვლა</a>
  </td></tr></table>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${MUTED}">${CONTACT}</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${INK}">პატივისცემით,<br><strong>KEKE Manager-ის გუნდი</strong></p>
</td></tr>
</table>
<p style="max-width:600px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#8A8F99;text-align:center">${NOT_YOU}<br>
შპს „კეკე მენეჯერი“ · ს/კ 402371189 · თბილისი</p>
</td></tr></table>
</body></html>`;

  const text = [
    'მოგესალმებით,',
    '',
    `${name} წარმატებით დარეგისტრირდა KEKE Manager-ზე. მადლობა, რომ შემოგვიერთდით!`,
    '',
    ...details.map(([k, v]) => `${k}: ${v}`),
    '',
    'რა ხდება შემდეგ',
    ...NEXT.map((t, n) => `${n + 1}. ${t}`),
    '',
    `შესვლა: ${SIGN_IN_URL}`,
    '',
    CONTACT,
    '',
    'პატივისცემით,',
    'KEKE Manager-ის გუნდი',
    '',
    '—',
    NOT_YOU,
    'შპს „კეკე მენეჯერი“ · ს/კ 402371189 · თბილისი',
  ].join('\n');

  return { subject: WELCOME_SUBJECT, html, text };
}
