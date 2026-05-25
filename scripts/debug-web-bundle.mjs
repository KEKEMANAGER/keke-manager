import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

try {
  const out = execSync('npx expo export -p web --clear', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' },
    maxBuffer: 50 * 1024 * 1024,
  });
  writeFileSync('bundle-debug-out.txt', out);
  console.log('OK');
} catch (e) {
  const text =
    (e.stdout || '') + '\n---STDERR---\n' + (e.stderr || '') + '\n---MSG---\n' + (e.message || '');
  writeFileSync('bundle-debug-err.txt', text);
  console.error('FAIL', e.status);
  process.exit(1);
}
