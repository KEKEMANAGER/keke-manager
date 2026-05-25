import fs from 'fs';
import path from 'path';

const src = fs.readFileSync('supabase/seed/vehicles_makes_models_safe.sql', 'utf8');
const lines = src.split(/\r?\n/);

const makesStart = lines.findIndex((l) => l.includes('INSERT INTO public.vehicle_makes'));
const makesEnd = lines.findIndex((l, i) => i > makesStart && l.startsWith('ON CONFLICT (name)'));
const modelsInsertStart = lines.findIndex((l) => l.includes('INSERT INTO public.vehicle_models'));
const valuesStart = lines.findIndex((l, i) => i > modelsInsertStart && l.trim() === 'FROM (VALUES');
const valuesEnd = lines.findIndex((l, i) => i > valuesStart && l.trim().startsWith(') AS v'));

const modelRows = lines.slice(valuesStart + 1, valuesEnd).filter((l) => l.trim().startsWith('('));
const footer = lines.slice(valuesEnd).join('\n');
const makesBlock = lines.slice(makesStart, makesEnd + 1).join('\n');

const dir = 'supabase/seed/parts';
fs.mkdirSync(dir, { recursive: true });

const CHUNK = 250;
const chunks = [];
for (let i = 0; i < modelRows.length; i += CHUNK) {
  chunks.push(modelRows.slice(i, i + CHUNK));
}

const header = `INSERT INTO public.vehicle_models (make_id, name, body_type)
SELECT vm.id, v.model_name, v.body_type
FROM (VALUES`;

const midFooter = `) AS v(make_name, model_name, body_type)
JOIN public.vehicle_makes vm ON vm.name = v.make_name
ON CONFLICT (make_id, name) DO NOTHING;`;

fs.writeFileSync(
  path.join(dir, 'part01_makes.sql'),
  `-- Part 1/${chunks.length + 1} — vehicle_makes (run FIRST)\nBEGIN;\n\n${makesBlock}\n`,
);

chunks.forEach((chunk, idx) => {
  const partNum = idx + 2;
  const isLast = idx === chunks.length - 1;
  const rows = chunk.map((line, i) =>
    i === chunk.length - 1 ? line.replace(/,\s*$/, '') : line,
  );
  let body = `${header}\n${rows.join('\n')}`;
  if (isLast) {
    body += `\n${footer}`;
  } else {
    body += `\n${midFooter}`;
  }
  const firstMake = chunk[0]?.match(/^\s*\('([^']+)'/)?.[1] ?? '';
  const lastMake = chunk[chunk.length - 1]?.match(/^\s*\('([^']+)'/)?.[1] ?? '';
  const label =
    firstMake === lastMake ? firstMake : `${firstMake} … ${lastMake}`;
  fs.writeFileSync(
    path.join(dir, `part${String(partNum).padStart(2, '0')}_models.sql`),
    `-- Part ${partNum}/${chunks.length + 1} — Models (${label}, ${chunk.length} rows)\n${body}\n`,
  );
});

fs.writeFileSync(
  path.join(dir, 'part99_verify.sql'),
  `-- Verification (run LAST)\nSELECT COUNT(*) AS vehicle_makes_count FROM public.vehicle_makes;\nSELECT COUNT(*) AS vehicle_models_count FROM public.vehicle_models;\nCOMMIT;\n`,
);

console.log(
  JSON.stringify({
    totalParts: chunks.length + 1,
    makesLines: makesEnd - makesStart + 1,
    modelRows: modelRows.length,
    chunkCount: chunks.length,
    dir,
  }),
);
