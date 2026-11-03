#!/usr/bin/env node
// Admin-panel photos, the app side: lib/storageImage.ts turns a stored photo
// address into Storage's resized copy, and leaves everything else alone.
// Compiled on the fly; nothing is sent anywhere.
//
//   node supabase/tests/storage_image_client_check.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

function load(rel) {
  const file = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m._compile(js, file);
  return m.exports;
}
const { storageImageUrl, isPublicStorageUrl } = load('lib/storageImage.ts');

let ok = 0;
let failed = 0;
const check = (name, cond, detail) => {
  if (cond) { ok += 1; console.log(`ok ${ok + failed} - ${name}`); }
  else { failed += 1; console.log(`not ok ${ok + failed} - ${name}${detail ? `\n  # ${detail}` : ''}`); }
};

const P = 'https://brrjuxgxmpgvkddcuaad.supabase.co/storage/v1/object/public/media/vehicles/abc/front.jpg';
const R = 'https://brrjuxgxmpgvkddcuaad.supabase.co/storage/v1/render/image/public/media/vehicles/abc/front.jpg';

const thumb = storageImageUrl(P, { width: 320, height: 320, quality: 70 });
check('S1 a public photo becomes its resized copy', thumb === `${R}?width=320&height=320&resize=cover&quality=70`, thumb);
const versioned = storageImageUrl(`${P}?v=1793690000000`, { width: 320, height: 320 });
check('S2 the version mark is kept, so a new upload shows at once and an old one stays cached',
  versioned === `${R}?v=1793690000000&width=320&height=320&resize=cover&quality=70`, versioned);
const preview = storageImageUrl(P, { width: 1600, quality: 80, resize: 'contain' });
check('S3 the big preview keeps the shape of the photo', preview === `${R}?width=1600&resize=contain&quality=80`, preview);
check('S4 sizes are kept inside what Storage accepts',
  storageImageUrl(P, { width: 9000, height: 0.2, quality: 5 }) === `${R}?width=2500&height=1&resize=cover&quality=20`);
for (const [name, u] of [
  ['a signed link to a private document', 'https://brrjuxgxmpgvkddcuaad.supabase.co/storage/v1/object/sign/media/verification/x/id_front.jpg?token=abc'],
  ['a photo on another site', 'https://example.com/a.jpg'],
  ['a local file', 'file:///var/mobile/photo.jpg'],
  ['a data address', 'data:image/png;base64,AAAA'],
]) {
  check(`S5 ${name} is left as it is`, storageImageUrl(u, { width: 320 }) === u && !isPublicStorageUrl(u));
}
check('S6 nothing in, nothing out', storageImageUrl(null, { width: 320 }) === null && storageImageUrl('  ', { width: 320 }) === null);
check('S7 an address already resized is not resized twice', storageImageUrl(R, { width: 320 }) === R);

console.log(`\n${ok} ok, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
