import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(root, 'docs', 'privacy-policy-ka.md');
const lines = fs.readFileSync(p, 'utf8').split(/\n/);

const verScreen = '**მძღოლის ვერიფიკაციის ეკრანი**';
lines[208] = lines[208].replace(/\*\*მძღოლის[^;]+;/, `${verScreen};`);

lines[225] = '**არ იყიდება** და **არ გამოიყენება რეკლამისთვის**. **Web:** browser local storage სესიისა და ენისთვის.';

lines[231] = 'სერვისი **არ არის** 18 წლამდე პირებისთვის. მინორის ანგარიშის შესახებ — დაგვიკავშირდით წაშლისთვის.';

lines[237] =
  'აკრძალულია სერვისის გამოყენება, სადაც ეს ეწესება **სანქციების ან ექსპორტ-კონტროლის** კანონმდებლობას (საქართველო, EU, აშშ, გაერო).';

lines[255] =
  '*იკითხეთ ერთად გამოყენების პირობებთან. App Store Connect-ის Privacy Policy URL უნდა მიუთითებდეს ამ დოკუმენტის აქტუალურ ვერსიაზე.*';

lines[133] =
  '**ავტომატიზაცია:** შერჩევა წესებით; სამართლებრივად მნიშვნელოვან გადაწყვეტილებებს არ ვანდობთ მხოლოდ ავტომატიზაციას.';

fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('Fixed privacy-policy-ka.md typos');
