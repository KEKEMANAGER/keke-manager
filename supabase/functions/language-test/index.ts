// language-test — a driver's spoken English/Russian, recorded on
// kekemanager.com/test and graded to a CEFR level.
//
// The page posts multipart form data: token, language, questions, duration_ms
// and three recordings (a1, a2, a3). The token comes from an SMS invite link,
// so the page needs no password and no Supabase session; this function is the
// only thing that may write tests, and it does so with the service role.
//
// Order of work, and why:
//   1. validate the invite and rate-limit, before anything is stored;
//   2. store the recordings and the attempt row, so nothing a driver said is
//      ever lost even if grading fails;
//   3. grade with Gemini (it hears audio; the Claude key the project already
//      has cannot), then write the level back to the driver's profile.
// When GEMINI_API_KEY is not set, step 3 is skipped and the attempt stays
// `recorded` for an admin to grade by ear.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Level = (typeof LEVELS)[number];
const LANGS = { en: 'English', ru: 'Russian' } as const;
type Lang = keyof typeof LANGS;

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 25 s of 16 kHz mono WAV is ~0.8 MB
const MAX_USES_PER_INVITE = 12;
const MAX_ATTEMPTS_PER_DAY = 3;
const BUCKET = 'language-tests';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function extFor(type: string): string {
  if (type.includes('wav')) return 'wav';
  if (type.includes('mp4') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg')) return 'mp3';
  return 'webm';
}

function geminiMime(type: string): string {
  if (type.includes('wav')) return 'audio/wav';
  if (type.includes('mp4') || type.includes('aac')) return 'audio/aac';
  if (type.includes('ogg')) return 'audio/ogg';
  if (type.includes('mpeg')) return 'audio/mp3';
  return type || 'audio/wav';
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Gemini: pick a model that exists today instead of hard-coding a name that
// Google may retire. GEMINI_MODEL wins when set.

let cachedModel: string | null = null;

async function pickModel(apiKey: string): Promise<string> {
  const forced = Deno.env.get('GEMINI_MODEL');
  if (forced) return forced;
  if (cachedModel) return cachedModel;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
    );
    const j = await r.json();
    const names: string[] = (j.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => !/preview|exp|tts|image|live|embedding|thinking|native-audio|robotics|computer/.test(n));
    const byVersionDesc = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });
    for (const re of [/flash-lite$/, /flash$/, /flash-lite/, /flash/]) {
      const hit = names.filter((n) => re.test(n)).sort(byVersionDesc)[0];
      if (hit) {
        cachedModel = hit;
        return hit;
      }
    }
  } catch {
    // fall through to a known name
  }
  cachedModel = 'gemini-2.5-flash-lite';
  return cachedModel;
}

type Grade = {
  level: Level;
  score: number;
  transcript: string;
  note_ka: string;
  flags: { suspicious?: boolean; wrong_language?: boolean; silent_answers?: number; read_aloud?: boolean };
  model: string;
};

function rubric(lang: Lang, questions: string[]): string {
  const name = LANGS[lang];
  return [
    `You are a certified CEFR examiner. You will hear three short spoken answers in ${name} from a professional driver who takes foreign tourists around Georgia (the country). Grade their SPOKEN ${name} for this job.`,
    '',
    'The questions were:',
    ...questions.map((q, i) => `Q${i + 1}: ${q}`),
    '',
    'Judge what you hear: fluency, range of vocabulary, grammatical accuracy, pronunciation and intelligibility, and whether each answer actually answers its question.',
    '',
    'Calibration for this job:',
    '- A1: isolated words or memorised phrases; no relevant answer.',
    '- A2: short simple sentences, frequent errors, but a tourist would get basic information.',
    '- B1: connected, relevant answers on familiar topics with noticeable errors; handles the lost-suitcase situation in simple terms.',
    '- B2: clear, fluent and relevant; handles the problem situation well; errors rarely get in the way.',
    '- C1: fluent and precise, wide range, few errors.',
    '- C2: near-native.',
    '',
    'Integrity rules:',
    `- An answer that is silent, unintelligible, or not in ${name} counts as no answer.`,
    '- If it sounds read aloud from text or played from a translator app, set read_aloud true and do not reward it.',
    '- If the answers are clearly spoken by different people, set suspicious true.',
    '- Do not give a level more than one band above what the weakest real answer supports.',
    '',
    'Return ONLY this JSON object:',
    '{"level":"A1|A2|B1|B2|C1|C2","score":0-100,"transcript":"Q1: ...\\nQ2: ...\\nQ3: ...","note_ka":"one or two short sentences IN GEORGIAN addressed to the driver: what was good and one thing to improve","suspicious":false,"wrong_language":false,"read_aloud":false,"silent_answers":0}',
  ].join('\n');
}

async function gradeWithGemini(
  apiKey: string,
  lang: Lang,
  questions: string[],
  files: { bytes: Uint8Array; type: string }[],
): Promise<Grade> {
  const model = await pickModel(apiKey);
  const parts: unknown[] = [{ text: rubric(lang, questions) }];
  files.forEach((f, i) => {
    parts.push({ text: `Answer to Q${i + 1}:` });
    parts.push({ inline_data: { mime_type: geminiMime(f.type), data: toBase64(f.bytes) } });
  });

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  );
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) cachedModel = null; // retired model: rediscover next time
    throw new Error(`gemini ${r.status}: ${body?.error?.message ?? 'no body'}`.slice(0, 400));
  }
  const text: string = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error(`gemini returned non-JSON: ${text.slice(0, 200)}`);
  }
  const level = String(parsed.level ?? '').toUpperCase() as Level;
  if (!LEVELS.includes(level)) throw new Error(`gemini returned an unknown level: ${parsed.level}`);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score ?? 0))));
  return {
    level,
    score,
    transcript: String(parsed.transcript ?? '').slice(0, 8000),
    note_ka: String(parsed.note_ka ?? '').slice(0, 600),
    flags: {
      suspicious: Boolean(parsed.suspicious),
      wrong_language: Boolean(parsed.wrong_language),
      read_aloud: Boolean(parsed.read_aloud),
      silent_answers: Number(parsed.silent_answers ?? 0) || 0,
    },
    model,
  };
}

// ---------------------------------------------------------------------------
// Profile write-back. `languages` (text[]) is what the app shows and what
// dispatch matches on; `spoken_languages` (jsonb) carries the verified levels.
// A2 and above counts as speaking the language; A1 does not.

async function applyLevel(db: SupabaseClient, driverId: string, lang: Lang, level: Level, score: number) {
  const { data: u } = await db
    .from('users')
    .select('languages, spoken_languages')
    .eq('id', driverId)
    .maybeSingle();

  const langs = new Set<string>((u?.languages as string[] | null) ?? []);
  if (level === 'A1') langs.delete(lang);
  else langs.add(lang);

  const prev = Array.isArray(u?.spoken_languages) ? (u!.spoken_languages as Record<string, unknown>[]) : [];
  const spoken = prev.filter((x) => x?.code !== lang);
  spoken.push({ code: lang, level, score, verified: true, tested_at: new Date().toISOString() });

  await db
    .from('users')
    .update({ languages: Array.from(langs), spoken_languages: spoken })
    .eq('id', driverId);
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'არასწორი მოთხოვნა.' }, 400);
  }

  const token = String(form.get('token') ?? '').trim();
  const lang = String(form.get('language') ?? '') as Lang;
  if (!token) return json({ error: 'ლინკი არასრულია.' }, 400);
  if (!(lang in LANGS)) return json({ error: 'ენა არ არის არჩეული.' }, 400);

  // 1. invite + limits --------------------------------------------------------
  const { data: invite } = await db
    .from('language_test_invites')
    .select('token, driver_id, language, expires_at, uses')
    .eq('token', token)
    .maybeSingle();
  if (!invite) return json({ error: 'ლინკი არასწორია. მოითხოვე ახალი KEKE Manager-ისგან.' }, 403);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: 'ლინკს ვადა გაუვიდა. მოითხოვე ახალი KEKE Manager-ისგან.' }, 403);
  }
  if (invite.language && invite.language !== lang) {
    return json({ error: 'ეს ლინკი სხვა ენის ტესტისთვისაა.' }, 403);
  }
  if ((invite.uses ?? 0) >= MAX_USES_PER_INVITE) {
    return json({ error: 'ამ ლინკით ტესტების ლიმიტი ამოიწურა. დაგვიკავშირდი.' }, 429);
  }

  const driverId: string = invite.driver_id;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: recent } = await db
    .from('language_tests')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .eq('language', lang)
    .gte('created_at', since);
  if ((recent ?? 0) >= MAX_ATTEMPTS_PER_DAY) {
    return json({ error: 'დღეში მაქსიმუმ 3 მცდელობაა. სცადე ხვალ.' }, 429);
  }

  const files: { bytes: Uint8Array; type: string }[] = [];
  for (const key of ['a1', 'a2', 'a3']) {
    const f = form.get(key);
    if (!(f instanceof File)) return json({ error: 'ყველა პასუხი არ ჩაიწერა.' }, 400);
    if (f.size === 0 || f.size > MAX_FILE_BYTES) return json({ error: 'ჩანაწერი ძალიან დიდია ან ცარიელია.' }, 413);
    files.push({ bytes: new Uint8Array(await f.arrayBuffer()), type: f.type || 'audio/wav' });
  }

  let questions: string[] = [];
  try {
    const q = JSON.parse(String(form.get('questions') ?? '[]'));
    if (Array.isArray(q)) questions = q.map((x) => String(x).slice(0, 400)).slice(0, 3);
  } catch {
    // questions are informational; grading still works without them
  }
  const durationMs = Number(form.get('duration_ms') ?? 0) || null;

  // 2. store first, grade second ---------------------------------------------
  const { count: prior } = await db
    .from('language_tests')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .eq('language', lang);

  const { data: row, error: insErr } = await db
    .from('language_tests')
    .insert({
      driver_id: driverId,
      language: lang,
      attempt: (prior ?? 0) + 1,
      status: 'recorded',
      questions,
      duration_ms: durationMs,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    })
    .select('id')
    .single();
  if (insErr || !row) return json({ error: 'შენახვა ვერ მოხერხდა. სცადე ხელახლა.' }, 500);

  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = `${driverId}/${row.id}/a${i + 1}.${extFor(files[i].type)}`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, files[i].bytes, { contentType: files[i].type, upsert: true });
    if (upErr) {
      await db.from('language_tests').update({ status: 'failed', error: `upload: ${upErr.message}` }).eq('id', row.id);
      return json({ error: 'ჩანაწერი ვერ აიტვირთა. სცადე ხელახლა.' }, 500);
    }
    paths.push(path);
  }
  await db.from('language_tests').update({ audio_paths: paths }).eq('id', row.id);
  await db
    .from('language_test_invites')
    .update({ uses: (invite.uses ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq('token', token);

  // 3. grade -------------------------------------------------------------------
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ ok: true, pending: true, test_id: row.id });

  await db.from('language_tests').update({ status: 'grading' }).eq('id', row.id);
  try {
    const g = await gradeWithGemini(apiKey, lang, questions, files);
    await db
      .from('language_tests')
      .update({
        status: 'graded',
        level: g.level,
        score: g.score,
        transcript: g.transcript,
        ai_notes: g.note_ka,
        ai_flags: g.flags,
        ai_model: g.model,
        graded_by: 'ai',
        graded_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', row.id);

    // A take the grader flagged is kept for an admin to hear, not published.
    const flagged = g.flags.suspicious || g.flags.read_aloud;
    if (!flagged) await applyLevel(db, driverId, lang, g.level, g.score);

    return json({
      ok: true,
      test_id: row.id,
      level: flagged ? null : g.level,
      pending: flagged,
      note: flagged ? null : g.note_ka,
    });
  } catch (e) {
    await db
      .from('language_tests')
      .update({ status: 'recorded', error: String((e as Error)?.message ?? e).slice(0, 500) })
      .eq('id', row.id);
    return json({ ok: true, pending: true, test_id: row.id });
  }
});
