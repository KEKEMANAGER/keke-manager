// Cross-layer check (supabase/tests/run_import_e2e.sh), step 2 of 3: the
// server reviews each draft (as it would after reading the request), signs
// the review, and approves the app's final booking. Writes the approved
// values for the database step. Not a test file of its own: deno test does
// not pick it up.
import { approveService, reviewService, signReview } from '../review.ts';

const [inPath, outPath, company] = Deno.args;
const cases = JSON.parse(await Deno.readTextFile(inPath));
const secret = 'e2e-secret';
const now = Date.parse('2026-11-01T10:00:00Z');
const out = [];
for (const c of cases) {
  let token: string;
  let confirmed: string[];
  if (c.real) {
    // A real read: the review the server returned, signed over the values it
    // read; the operator's confirmations as the app sent them.
    token = await signReview(company, c.review, c.readDraft, secret, now);
    confirmed = c.confirmed;
  } else {
    const review = reviewService({ draft: c.draft, sources: {}, templateDraft: c.draft, aiDraft: c.draft, aiUncertain: [], aiEvidence: null, flags: {}, inputKind: 'form', sourceText: null, truncated: false, now });
    token = await signReview(company, review, c.draft, secret, now);
    confirmed = review.blocking;
  }
  const r = await approveService({ token, secret, companyId: company, draft: c.draft, insert: c.insert, confirmed, now });
  if (!r.ok) {
    console.error(`${c.name}: the server refused: ${JSON.stringify(r.issues)}`);
    Deno.exit(1);
  } else {
    out.push({ name: c.name, body: c.body, approved: r.approved });
  }
}
await Deno.writeTextFile(outPath, JSON.stringify(out, null, 1));
console.log(`server side: ${out.length} bookings approved`);
