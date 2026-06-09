import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'privacy-policy.html');
let html = fs.readFileSync(htmlPath, 'utf8');

html = html.replace(
  '<li>ვერიფიკაციის დოკუმენტები (პირადობის მოწმობა, მართვის მოწმობა)</li>\n        <li>GPS მდებარეობა (მხოლოდ სამუშაო სესიის დროს)</li>',
  '<li>ვერიფიკაციის დოკუმენტები (პირადობის მოწმობა, მართვის მოწმობა) — მხოლოდ <strong>ფოტოების გალერეიდან</strong>; <strong>კამერის ნებართვა არ ვითხოვთ</strong></li>\n        <li>GPS მდებარეობა (მხოლოდ აქტიური სამუშაო სესიისას; კომპანია ხედავს ცოცხალ პინს მხოლოდ აქტიურ, გაუუქმებელ ჯავშანზე)</li>'
);

html = html.replace(
  '<li>Do not store GPS history after a work session ends</li>',
  '<li>Do not store GPS history after a work session ends</li>\n        <li>Companies see a driver live pin only on active, non-cancelled bookings</li>'
);

html = html.replace(
  '<li>არ ვინახავთ GPS ისტორიას სამუშაო სესიის დასრულების შემდეგ</li>',
  '<li>არ ვინახავთ GPS ისტორიას სამუშაო სესიის დასრულების შემდეგ</li>\n        <li>კომპანია ხედავს ცოცხალ პინს მხოლოდ აქტიურ, გაუუქმებელ ჯავშანზე</li>'
);

const securityKa = `
    <div class="card">
      <h2>13. უსაფრთხოების ინციდენტები</h2>
      <p>თუ პერსონალური მონაცემთა დარღვევა სავარაუდოდ საფრთხეს უქმნის თქვენს უფლებებს, შევატყობინებთ ზედამხედველობას (GDPR-ის შემთხვევაში <strong>72 საათში</strong>, სადაც საჭიროა) და დაზარალებულ მომხმარებლებს <strong>დიდი დაგვიანების გარეშე</strong>, სადაც კანონი ამას მოითხოვს.</p>
      <p>უსაფრთხოების საკითხები: <a href="mailto:akachibaia1410@gmail.com">akachibaia1410@gmail.com</a></p>
    </div>

    <div class="card">
      <h2>14. სანქციები</h2>
      <p>აკრძალულია სერვისის გამოყენება, სადაც ეს ეწესება სანქციების ან ექსპორტ-კონტროლის კანონმდებლობას.</p>
    </div>
`;

const securityEn = `
    <div class="card">
      <h2>13. Security Incidents</h2>
      <p>If we become aware of a personal data breach likely to risk your rights, we will notify supervisory authorities where required (including within <strong>72 hours</strong> under GDPR where applicable) and affected users without undue delay when required by law.</p>
      <p>Report security issues: <a href="mailto:akachibaia1410@gmail.com">akachibaia1410@gmail.com</a></p>
    </div>

    <div class="card">
      <h2>14. Sanctions</h2>
      <p>You may not use the Service where prohibited by applicable sanctions or export-control laws.</p>
    </div>
`;

html = html.replace(
  '      <h2>11. პოლიტიკის ცვლილებები</h2>',
  securityKa + '\n    <div class="card">\n      <h2>15. პოლიტიკის ცვლილებები</h2>'
);
html = html.replace('      <h2>12. კონტაქტი</h2>', '      <h2>16. კონტაქტი</h2>');

html = html.replace(
  '      <h2>11. Changes to This Policy</h2>',
  securityEn + '\n    <div class="card">\n      <h2>15. Changes to This Policy</h2>'
);
html = html.replace('      <h2>12. Contact Us</h2>', '      <h2>16. Contact Us</h2>');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Updated privacy-policy.html');
