import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const privacyPath = path.join(root, 'docs', 'privacy-policy-ka.md');
const tailPath = path.join(root, 'docs', '_privacy-ka-tail.md');

const lines = fs.readFileSync(privacyPath, 'utf8').split(/\n/);
const start = lines.findIndex((l) => l === '## 11. თქვენი უფლებები');
const head = lines.slice(0, start).join('\n');
const tail = fs.readFileSync(tailPath, 'utf8').trimEnd();

fs.writeFileSync(privacyPath, `${head}\n\n${tail}\n`, 'utf8');
console.log('Patched privacy-policy-ka.md from section 11');
