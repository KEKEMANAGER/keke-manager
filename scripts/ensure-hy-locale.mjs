import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const enPath = join(root, 'src/locales/en.json');
const hyPath = join(root, 'src/locales/hy.json');

if (!existsSync(hyPath)) {
  copyFileSync(enPath, hyPath);
}

const hy = JSON.parse(readFileSync(hyPath, 'utf8'));
hy.common = {
  ...hy.common,
  signIn: 'Մուտք',
  signUp: 'Գրանցվել',
  dashboard: 'Վահանակ',
  booking: 'Ամրագրում',
  driver: 'Վարորդ',
  company: 'Ընկերություն',
  logout: 'Ելք',
  loading: 'Բեռնվում է…',
  close: 'Փակել',
  save: 'Պահպանել',
  cancel: 'Չեղարկել',
  language: 'Լեզու',
  error: 'Սխալ',
  success: 'Հաջող',
};
if (hy.settingsScreen) {
  hy.settingsScreen.language = 'Լեզու';
  hy.settingsScreen.title = hy.settingsScreen.title || 'Կարգավորումներ';
}
writeFileSync(hyPath, `${JSON.stringify(hy, null, 2)}\n`, 'utf8');
console.log('Updated src/locales/hy.json');
