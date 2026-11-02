#!/usr/bin/env node
// The company-profile-fix form, the app side: checks lib/companyProfileFix.ts
// without a device, a server or a test framework. The TypeScript is compiled
// on the fly and the Supabase client is a recorder; nothing is sent anywhere.
//
//   node supabase/tests/company_profile_fix_client_check.cjs
//
// Covers parseProfileFix, profileFixMissing (the same cases the SQL suite
// puts to the server, so the form never says "done" where the server would
// not let the company in), fetchProfileFix (no request, and no crash, before
// the column exists), saveCompanyName, and that every text the form uses
// exists in all four languages.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

// --- a Supabase client that records and answers ------------------------------
const calls = [];
let answers = [];
function builder(table) {
  const q = { table, ops: [] };
  const chain = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        const answer = answers.shift() || { data: null, error: null };
        calls.push(q);
        return (resolve) => resolve(answer);
      }
      return (...args) => { q.ops.push([prop, ...args]); return chain; };
    },
  });
  return chain;
}
const supabaseStub = { supabase: { from: (table) => builder(table) } };

// --- compile the module, with ./supabase resolved to the recorder ------------
function load(rel) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => (id === './supabase' ? supabaseStub : require(id));
  m._compile(js, file);
  return m.exports;
}
const fixLib = load('lib/companyProfileFix.ts');

// --- a tiny runner -----------------------------------------------------------
let ok = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) { ok += 1; console.log(`ok ${ok + failed} - ${name}`); }
  else { failed += 1; console.log(`not ok ${ok + failed} - ${name}${detail ? `\n  # ${detail}` : ''}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const { parseProfileFix, profileFixMissing, fetchProfileFix, saveCompanyName } = fixLib;

  // 1. reading the request
  for (const raw of [null, undefined, 'x', 42, [], ['logo'], {}, { fields: [] }, { fields: ['phone'] }, { fields: 'logo' }]) {
    check(`C1 no request from ${JSON.stringify(raw)}`, parseProfileFix(raw) === null);
  }
  const both = parseProfileFix({ fields: ['logo', 'company_name', 'phone'], name_was: '  Nini rogava ' });
  check('C2 the request: both fields, in a fixed order, unknown ones dropped, old name trimmed',
    same(both, { fields: ['company_name', 'logo'], nameWas: 'Nini rogava' }), JSON.stringify(both));
  check('C3 a blank old name reads as none', parseProfileFix({ fields: ['logo'], name_was: '  ' }).nameWas === null);

  // 2. what is still missing — the SQL suite's cases, put to the form
  const LOGO = 'https://brrjuxgxmpgvkddcuaad.supabase.co/storage/v1/object/public/media/avatars/x.jpg';
  const cases = [
    ['nothing done yet', 'Nini rogava', null, ['company_name', 'logo']],
    ['a logo alone is not enough (P9)', 'Nini rogava', LOGO, ['company_name']],
    ['the same name in other letters is not a correction (P11)', '  NINI ROGAVA ', LOGO, ['company_name']],
    ['one letter is not a company name (P13)', 'G', LOGO, ['company_name']],
    ['one emoji is one letter, as the server counts it', '\u{1F68C}', LOGO, ['company_name']],
    ['a logo that is not a picture link does not count (P19)', 'Real Tours', 'logo.png', ['logo']],
    ['a blank logo does not count', 'Real Tours', '   ', ['logo']],
    ['corrected: nothing missing (P15)', 'Geo Travel Club', LOGO, []],
    ['a two-letter name is enough', 'GT', 'http://x.test/l.png', []],
  ];
  for (const [name, companyName, logo, want] of cases) {
    const got = profileFixMissing(both, companyName, logo);
    check(`C4 ${name}`, same(got, want), JSON.stringify(got));
  }
  const logoOnly = parseProfileFix({ fields: ['logo'] });
  check('C5 asked for a logo only: the name is not looked at',
    same(profileFixMissing(logoOnly, '', LOGO), []) && same(profileFixMissing(logoOnly, 'Nini rogava', null), ['logo']));

  // 3. fetching the request
  calls.length = 0;
  answers = [{ data: null, error: { message: 'column users.profile_fix does not exist' } }];
  check('C6 before the column exists: no request, no crash', (await fetchProfileFix('u-1')) === null);
  check('C7 it reads only profile_fix, for this account',
    calls.length === 1 && calls[0].table === 'users'
      && same(calls[0].ops, [['select', 'profile_fix'], ['eq', 'id', 'u-1'], ['maybeSingle']]), JSON.stringify(calls));
  answers = [{ data: { profile_fix: { fields: ['company_name', 'logo'], name_was: 'Nini rogava' } }, error: null }];
  check('C8 a request on the account is read', same(await fetchProfileFix('u-1'), both));
  answers = [{ data: { profile_fix: null }, error: null }];
  check('C9 no request on the account', (await fetchProfileFix('u-1')) === null);
  calls.length = 0;
  check('C10 no account: nothing is asked', (await fetchProfileFix('  ')) === null && calls.length === 0);

  // 4. saving the name
  calls.length = 0;
  answers = [{ data: null, error: null }];
  const saved = await saveCompanyName('u-1', '  Geo Travel Club ');
  check('C11 the name is saved trimmed, to users.full_name only, for this account',
    saved.error === null && calls.length === 1 && calls[0].table === 'users'
      && same(calls[0].ops, [['update', { full_name: 'Geo Travel Club' }], ['eq', 'id', 'u-1']]), JSON.stringify(calls));
  answers = [{ data: null, error: { message: 'denied' } }];
  const refused = await saveCompanyName('u-1', 'X Co');
  check('C12 a refusal comes back as an error', refused.error instanceof Error && refused.error.message === 'denied');

  // 5. every text the form uses, in all four languages
  const form = fs.readFileSync(path.join(ROOT, 'components/company/CompanyProfileFixForm.tsx'), 'utf8');
  const used = new Set([...form.matchAll(/t\('([A-Za-z.]+)'/g)].map((m) => m[1]));
  for (const f of ['company_name', 'logo']) used.add(`companyProfileFix.missing.${f}`);
  for (const lang of ['ka', 'en', 'ru', 'hy']) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, `src/locales/${lang}.json`), 'utf8'));
    const get = (k) => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), dict);
    const missing = [...used].filter((k) => typeof get(k) !== 'string' || !get(k).trim());
    check(`C13 ${lang}: all ${used.size} texts of the form exist`, missing.length === 0, missing.join(', '));
    check(`C14 ${lang}: the old name is shown in the hint`, /\{\{name\}\}/.test(get('companyProfileFix.nameWas') || ''));
  }

  console.log(`\n${ok} ok, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
