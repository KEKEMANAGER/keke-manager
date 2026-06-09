import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const termsPath = path.join(root, 'docs', 'terms-of-service-ka.md');
const lines = fs.readFileSync(termsPath, 'utf8').split(/\n/);

const licenseLine = lines[135];
const usageRaw = licenseLine.split('ლიცენზია ')[1].replace(/\.$/, '');
const servWord = usageRaw.split(' ')[0];
const gamoWord = usageRaw.split(' ')[1].replace(/ze$/, 'ა').replace(/ზe$/, 'ა');
lines[203] =
  'აკრძალულია **' +
  servWord +
  '** ' +
  gamoWord +
  ', სადაც ეს ეწესება **სანქციების ან ექსპორტ-კონტროლის** კანონმდებლობას.';

const s22Lines = [
  '## 22. App Store / Google Play',
  '',
  'Apple Inc. და Google LLC **არ არიან** ამ ხელშეკრულების მხარეები და **არ არიან პასუხისმგებელი** აპის მხარდაჭერაზე.',
  'კითხვები, საჩივრები და პრეტენზიები — **ჩვენთან** ზემოთ მითითებულ ელფოსტაზე, არა Apple-თან ან Google-თან.',
  'დაიცავით მაღაზიის პოლიტიკა და ექსპორტის კანონები.',
  'თუ აპი **Apple App Store**-დან ჩამოტვირთეთ, აღიარებთ, რომ Apple არის მესამე მხარის ბენეფიციარი Apple-ის მოთხოვნების შესაბამისად.',
];
const s22 = s22Lines.join('\n');

const appStoreIdx = lines.findIndex((l) => l.startsWith('## 20. App Store'));
if (appStoreIdx >= 0) {
  let end = appStoreIdx + 1;
  while (end < lines.length && lines[end] !== '---') end++;
  lines.splice(appStoreIdx, end - appStoreIdx, s22);
}

lines[74] =
  '- **ფოტოების გალერეა** — **მხოლოდ** ვერიფიკაციისა და პროფილის/ავტომობილის ფოტოების ასატვირთად; **კამერის ნებართვა არ ვითხოვთ**';

fs.writeFileSync(termsPath, lines.join('\n'), 'utf8');
console.log('204:', lines[203]);
console.log('75:', lines[74]);
