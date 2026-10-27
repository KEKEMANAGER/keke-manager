// One-off: move drivers' document photos (ID card, driving licence, tech
// passport) from the public `media` bucket to the private `documents` bucket.
//
// Called by the database only (net.http_post), with the secret it keeps in
// app_settings under `documents_move_secret`, and a batch of object names in
// the body. A move is one storage operation: the file changes buckets, nothing
// is copied or lost. If the storage service cannot move across buckets, the
// file is copied, the copy is checked, and only then the public original is
// taken away — so a document is never in neither place.
//
// Answers 200 with `{ ok: true }` to anything without the secret, so a prober
// learns nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const FROM = 'media';
const TO = 'documents';
const MAX_NAMES = 80;

/** Only what is a document: the verification folders and the tech passport photos. */
function isDocumentPath(name: string): boolean {
  return (
    // A few date from the app's first sign-in system and carry its user ids.
    /^verifications?\/[A-Za-z0-9_-]+\/[^/]+$/.test(name) ||
    /^vehicles\/[0-9a-f-]{36}\/tech_passport_(front|back)\.[a-z0-9]+$/i.test(name)
  );
}

Deno.serve(async (req) => {
  const ok = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (req.method !== 'POST') return ok({ ok: true });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return ok({ ok: false, error: 'server_misconfigured' }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: setting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'documents_move_secret')
    .maybeSingle();
  const secret = (setting as { value?: string } | null)?.value ?? '';
  if (!secret || req.headers.get('x-keke-move-secret') !== secret) return ok({ ok: true });

  const payload = (await req.json().catch(() => ({}))) as { names?: unknown };
  const names = (Array.isArray(payload.names) ? payload.names : [])
    .filter((n): n is string => typeof n === 'string' && isDocumentPath(n))
    .slice(0, MAX_NAMES);

  const results: { name: string; result: 'moved' | 'copied' | 'already' | 'failed'; error?: string }[] = [];
  const from = admin.storage.from(FROM);

  for (const name of names) {
    // Moved by an earlier run?
    const folder = name.slice(0, name.lastIndexOf('/'));
    const file = name.slice(name.lastIndexOf('/') + 1);
    const { data: there } = await admin.storage.from(TO).list(folder, { search: file, limit: 10 });
    const privateCopy = (there ?? []).find((o) => o.name === file);
    const alreadyThere = !!privateCopy;

    if (!alreadyThere) {
      const moved = await from.move(name, name, { destinationBucket: TO });
      if (!moved.error) {
        results.push({ name, result: 'moved' });
        continue;
      }
      // Fallback: copy, confirm the copy, then remove the public original.
      const copied = await from.copy(name, name, { destinationBucket: TO });
      if (copied.error) {
        results.push({ name, result: 'failed', error: `${moved.error.message} / ${copied.error.message}` });
        continue;
      }
      const { data: check } = await admin.storage.from(TO).list(folder, { search: file, limit: 10 });
      if (!(check ?? []).some((o) => o.name === file)) {
        results.push({ name, result: 'failed', error: 'copy not found after copying' });
        continue;
      }
      const removed = await from.remove([name]);
      results.push(
        removed.error
          ? { name, result: 'failed', error: `copied, public original kept: ${removed.error.message}` }
          : { name, result: 'copied' },
      );
      continue;
    }

    // Already in the private bucket; make sure no public copy is left behind —
    // unless the public one is newer (a re-upload from an app version that
    // still writes to the public bucket): that one is kept and reported.
    const { data: still } = await from.list(folder, { search: file, limit: 10 });
    const publicCopy = (still ?? []).find((o) => o.name === file);
    if (publicCopy) {
      const stamp = (o: { updated_at?: string | null; created_at?: string | null } | undefined) =>
        Date.parse(o?.updated_at ?? o?.created_at ?? '') || 0;
      if (stamp(publicCopy) > stamp(privateCopy)) {
        results.push({ name, result: 'failed', error: 'public copy is newer than the private one; kept' });
        continue;
      }
      const removed = await from.remove([name]);
      results.push(
        removed.error
          ? { name, result: 'failed', error: `public copy kept: ${removed.error.message}` }
          : { name, result: 'already' },
      );
    } else {
      results.push({ name, result: 'already' });
    }
  }

  // The moved files' stored addresses now point at the private bucket
  // (public.rewrite_moved_document_refs: only where the file is really there).
  const { data: rewritten, error: rewriteErr } = await admin.rpc('rewrite_moved_document_refs');

  const count = (r: string) => results.filter((x) => x.result === r).length;
  console.log(
    `move-documents: ${names.length} names, moved ${count('moved')}, copied ${count('copied')}, already ${count('already')}, failed ${count('failed')}`,
  );
  return ok({
    ok: true,
    total: names.length,
    moved: count('moved'),
    copied: count('copied'),
    already: count('already'),
    failed: results.filter((r) => r.result === 'failed'),
    rewritten: rewriteErr ? { error: rewriteErr.message } : rewritten,
  });
});
