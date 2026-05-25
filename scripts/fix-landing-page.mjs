import fs from 'fs';

const path = 'components/landing/LandingPage.tsx';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('{false && <View nativeID="hero"'));
if (start < 0) {
  console.error('start not found');
  process.exit(1);
}
let endIdx = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i].trim() === '</View>}') {
    endIdx = i;
    break;
  }
}
if (endIdx < 0) {
  console.error('end not found');
  process.exit(1);
}
const before = lines.slice(0, start);
const after = lines.slice(endIdx + 1).filter((l) => !l.includes('KEKE Manager</Text>'));
const mid = ['        <Text style={{ padding: 24, color: LANDING.text }}>KEKE Manager</Text>'];
fs.writeFileSync(path, [...before, ...mid, ...after].join('\n'));
console.log('fixed lines', start, endIdx);
