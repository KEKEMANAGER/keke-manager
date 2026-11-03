# booking-import

Turns whatever a tour operator sent — a file, a message pasted from WhatsApp /
Viber / Telegram / email, or screenshots and photos — into a **booking draft**.

## Why it is built this way

A tour operator will not learn our form. They already have a file they send by
email. This function reads that file so nobody retypes anything — without ever
letting a bad parse reach the database.

Three rules, in order of importance:

1. **No booking is written here.** The function returns a draft. The company
   reviews it on screen and the normal booking-creation path runs, so every
   existing validation, the review gate and the availability check still
   apply. The only row it writes besides its log is an approval (see
   "Review and approval"), which holds no guest name or phone.
2. **The deterministic template parser runs first** and its value stays in the
   draft on the fields it recognises; the model fills what the template could
   not find. Where the two read a critical value differently, the value is a
   **conflict** that a person resolves — neither reader wins silently.
3. **If the model is unavailable, misconfigured, or returns nonsense, the
   function still succeeds** with whatever the template found, plus warnings.
   The feature degrades; it never breaks booking creation.
4. **A critical value nobody confirmed is never treated as confirmed.** It is
   kept in the draft so the company can check and correct it, but the booking
   cannot be created until a person has confirmed or changed it — checked on
   the server and in the database, not only by the app's button.

## Deploy

```bash
supabase functions deploy booking-import
```

## Secrets

```bash
# Optional. Without it the template parser still works; free-form documents
# simply come back with fewer fields filled and a warning saying so.
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Optional. The model; default claude-sonnet-4-6 (claude-sonnet-4-5 retires
# on 30 November 2026). A 4.x id uses the classic request (forced tool call);
# a 5.x id (claude-sonnet-5-5) the 5.x request (tool call left to the model,
# thinking between tools, effort, room for thinking, no temperature) — see
# ai.ts. Change it only after the paid evaluation; the 5.x request has not
# yet been tried against the real API. Read on every request.
supabase secrets set BOOKING_IMPORT_MODEL=claude-sonnet-4-6

# Optional. Tried once when the model above is gone (404, or a 400 saying it
# is retired or unknown). Default claude-sonnet-4-6; set it empty for none.
supabase secrets set BOOKING_IMPORT_FALLBACK_MODEL=claude-sonnet-4-6

# Optional, 5.x models only: low | medium | high (default medium).
supabase secrets set BOOKING_IMPORT_EFFORT=medium

# Optional. Reads a company may start in 24 hours (default 300; 0 = no ceiling).
supabase secrets set BOOKING_IMPORT_DAILY_LIMIT=300
```

`SUPABASE_SERVICE_ROLE_KEY` (set by the platform) is also used to sign each
review: the signing key is derived from it, so a review cannot be forged or
moved to another company.

Only a company account (or KEKE's admin) may use the function; any other
account gets a 403 before anything is read.

## Request

```http
POST /functions/v1/booking-import
Authorization: Bearer <the signed-in user's access token>

{ "fileName": "booking.docx", "contentBase64": "UEsDBBQ..." }   // a file
{ "text": "[25/10/2026, 14:03] Nino: ხვალ 10-ზე აეროპორტი…" }    // a pasted message
{ "images": [{ "base64": "iVBORw0…" }, { "base64": "/9j/4AAQ…" }] } // up to 5 photos, in order
```

A **conversation** (two or more `[date, time] Name:` lines) — pasted, or a
WhatsApp "Export chat" file (`.txt`, or the `.zip` an iPhone makes, read from
its `_chat.txt`) — is read by the model alone: the template takes the first
value under a label, and in a chat the answer is the latest message ("5 people,
not 4"). The model is told that the stamp in front of a message is when it was
sent, not the service date, and is given today's Tbilisi date for "ხვალ" /
"on Saturday" / dates without a year. A long chat is read from its **end**
(the last ~24,000 characters, cut at a message boundary): the request being
booked is the latest one, and a service in the chat dated before today is
history.

**PDFs** are read twice: the template reads the text layer, and the model
reads the PDF as the page itself (up to 30 pages), so a table, two columns or a
stamp are seen as printed. If that page read is refused, the model reads the
text instead; a read that timed out is not repeated (the platform ends a
request at 150 s, and the template's answer must still arrive). A PDF the text
reader cannot open at all is still offered to the model before the company is
told why it failed.

**Pictures** — photos, screenshots, a picture uploaded as a file, and a PDF
with no text layer (a scan) — are read by the model as images. Their real
format is read from the first bytes; HEIC is refused with a message (the app
already hands over JPEG). Nothing is learned from a picture.

### Times, places and links — the booking form's rules

* `time` is always the **pickup**. On an arrival that is the landing time (the
  driver waits at arrivals). On a departure the flight's own time is kept
  separately (`flight_at`, an ISO instant) and is never used as the pickup —
  if the request only gives the flight, the pickup is left for the company,
  with the flight's time in the question. A flight that reads earlier than a
  known pickup is the next day's (22:30 pickup, 01:30 flight). A form's
  "Departure time" that turns out to be the flight's is not taken as the pickup.
* Each place gets the form's type — `airport`, `train_station`, `hotel`,
  `address` — from the model, or from unmistakable words in its name. A
  transfer with an airport or station at exactly one end is an arrival or a
  departure accordingly.
* A Google Maps link is kept only if it appears in the request character for
  character and really opens Google Maps. None is ever kept from a picture.
* A tour's arrival and departure get the group's hotel only when the
  programme has exactly one hotel; a leg outside the tour's days is flagged.
* A "Service: transfer" heading over several dated sightseeing days does not
  turn the programme into a transfer: the days win, with a warning.

A pasted message or a picture with nothing bookable in it is answered with a
422 and a plain message rather than an empty form.

## Response

```jsonc
{
  "ok": true,
  "draft": { "kind": "transfer", "date_display": "2026-05-15T05:30:00.000Z", ... },
  "sources": { "date_display": "template", "comment": "ai" },  // per field
  "warnings": ["თარიღი წარსულშია — გადაამოწმე"],
  "usedAi": false,
  "fileName": "booking.docx",
  "textPreview": "…first 1500 characters of the extracted text…"
}
```

`sources` is what the review screen uses to mark which fields were read
straight from the document and which the model inferred — the company should
look hardest at the `ai` ones.

## Errors

Every failure answer is `{ "ok": false, "error": "<Georgian sentence>", "code": "<reason>" }`.
The app words the reason in the agency's language (`importBooking.errors.<code>`
in `src/locales/*.json`) and falls back to the sentence. Reasons: `bad_request`,
`auth_required`, `not_company`, `daily_limit`, `try_again`; for what was sent
`text_too_short`, `text_too_long`, `no_file`, `file_too_big`, `file_damaged`,
`no_text`, `old_doc`, `pdf_scan`, `pdf_broken`, `zip_no_chat`,
`unsupported_format`, `too_many_photos`, `photo_empty`, `photo_too_big`,
`photo_unsupported`; for the model `ai_timeout`, `ai_refused`, `ai_incomplete`,
`ai_busy` (overloaded, rate-limited, a dropped connection — try again),
`ai_unavailable` (no key, credit, a retired model with no fallback),
`nothing_found`, `read_failed`; for approval `approve_issues`,
`possible_duplicate`, `already_created`. A model call is retried once on
408/429/5xx/529 or a dropped connection, and only while time remains.

## Transfer, day tour, tour

The model says which kind each service is; the server holds it to one rule:
sightseeing on two or more days (not all the same date) is a **tour** —
whatever the label over it says, "Service: Transfer" or the model's own
kind — so no day is ever lost by booking a programme as a transfer or a day
tour. When the label said otherwise, the kind is flagged (`several_days`) and
a person confirms it. A day the request does not date stays undated.

## Review and approval

Every service in `services` carries a `review` of its critical values — kind,
date, time, from, to, passengers, vehicle, price, flight number and time, and
for a tour its days, arrival and departure:

```jsonc
"review": {
  "fields": { "client_price": { "status": "unconfirmed", "reasons": ["currency_foreign"], "value": 140, "required": true },
              "time": { "status": "conflict", "reasons": ["readers_disagree"], "value": "10:00", "candidates": ["10:00", "11:00"], "required": true }, ... },
  "blocking": ["client_price", "time"],   // a person must confirm or change these
  "ready": false,
  "token": "…"                            // signed: company, time, each field's status and value
}
```

A value is **confirmed** only when it was found in the request and nothing
argues against it (a vehicle, a kind of service or a place the model chose
must be named in the request; a written date is never read as a time); **conflict** when the template and the model read it
differently (both readings are offered); **unconfirmed** when it needs a look —
the model was unsure, it was read off a picture, it is not in the request, the
answer was cut off, a chat's price, AM/PM unclear, a foreign currency or a
per-person price, an implausible value (a 2 lari price, more people than
seats, a past date); **missing** when there is none.

An app that shows the review sends `"clientGate": 2` with every read and gets
every value in the draft, flagged. To an older app, unconfirmed and
conflicting critical values are left out of the draft fields (they stay in
the review and the warnings), so its own required-field check makes a person
enter them.

Before creating the booking, the app sends the final draft back:

```http
POST /functions/v1/booking-import
{ "action": "approve", "reviewToken": "…", "draft": { … }, "insert": { … the booking row … }, "confirmed": ["time"] }
```

The function checks the token (this company, under 24 hours old), that every
blocking value was confirmed by a person as it now stands (a change is not a
confirmation — moving a tour's start moves its legs and days too), that every
value a change of service type added was confirmed, the form's required
fields, a departure picked up after its flight, and that the row to insert
carries the reviewed values (kind, date, time, passengers, vehicle, price,
flight, a tour's day and leg dates); then it writes the approved values to
`booking_import_approvals` and answers `{ "ok": true, "approvalId": "…" }`
(or 422 with `issues`). The app inserts the booking with
`import_approval_id`, and the trigger `bookings_verify_import_approval` lets
it in only with exactly the approved values, once, within 2 hours. A booking
typed into the form has no `import_approval_id` and is not touched.

**Duplicates.** Before approving, the function looks at the company's own
bookings around that day (cancelled and rejected ones aside). One with the
same flight, or the same kind of service between the same places within an
hour (a day tour: from the same place), or a tour starting the same day,
makes the answer `409 { "code": "possible_duplicate", "duplicates": [ … ] }`
— voucher, kind, day, time, places, head count, never a guest's name or
phone. The agency decides: the app asks, and sends the approval again with
`"allowDuplicate": true` to create it anyway.

**One approval per review.** The approval carries `review_key`, the SHA-256 of
the review token (never the token): "Create" pressed twice, or a request sent
again after a lost answer, gets the same approval; once that approval has made
a booking the answer is `409 { "code": "already_created", "voucher": … }`.

## Logs

`booking_import_log` and the function logs keep codes only: the file type and
a hash instead of the file name, the review's codes, and for a failed model
call a line like `ai_failed kind=http status=400 type=invalid_request_error
hint=… attempts=1 model=… req=req_…`, and for every model call its token use
(`ai_usage model=… in=… out=…`, with `fallback=1` when the fallback model
answered) — never the API key, the API's own text,
the request's content, a guest's name or phone. Text that does reach a log is
passed through `maskForLog` (keys, tokens, emails, links and digit runs
masked).

## Tests

```bash
cd supabase/functions/booking-import/tests
deno test --allow-read --allow-env --config deno.json   # no network permission: nothing can leave
```

`supabase/tests/run_import_safety_tests.sh` runs these together with the app
side, the database check and the cross-layer check (see
`supabase/tests/README.md`).

## Supported files

| Type | Notes |
|---|---|
| `.docx` | Tables are walked row by row; headers and footers are included |
| `.xlsx` | First three sheets, shared strings resolved |
| `.txt` `.csv` `.tsv` | Read as UTF-8; a WhatsApp chat export is read as a chat |
| `.zip` | A WhatsApp chat export (iPhone): its `_chat.txt` is read, media is ignored |
| `.doc` | Rejected with "save as .docx" |
| `.pdf` | Text layer read with unpdf for the template; the model reads the page itself; a scan goes to the model as a document |
| `.jpg` `.png` `.webp` | Read as a photo |

Limits: a file ~8 MB; photos 5 at a time, 9.5 MB of base64 each, 20 MB together.

## Dates

Documents from Georgian and Russian operators are **day-first**: `15/05/2026`
is 15 May. `YYYY-MM-DD` is also accepted. Times are read as local Tbilisi time
(UTC+4) and stored as an ISO instant, which is what `bookings.date_display`
holds.

A date counts as written in the request when it is there in any of the usual
ways — `20.11.2026`, `20/11`, `2026.11.20`, "20 ნოემბერს", "ნოემბრის 20-ში",
"20 ноября", "November 20th", `11/20/2026` (only when it cannot be day-first) —
or inside a span of days: "13-15.11.2026", "13.11-15.11", "29.11-02.12.2026",
"13–15 ноября", "с 13 по 15 ноября", "November 13-15", "13-დან 15-მდე ნოემბერი".

## Adding a label

`LABELS` maps a label to a field. Exact matches win; otherwise the longest
known label found as a whole word inside the cell text wins, so
`"თარიღი / Date"` and `"Pickup date (dd/mm)"` both resolve. Add the Georgian,
English and Russian spellings together.
