# booking-import

Turns whatever a tour operator sent — a file, a message pasted from WhatsApp /
Viber / Telegram / email, or screenshots and photos — into a **booking draft**.

## Why it is built this way

A tour operator will not learn our form. They already have a file they send by
email. This function reads that file so nobody retypes anything — without ever
letting a bad parse reach the database.

Three rules, in order of importance:

1. **Nothing is written to the database here.** The function returns a draft.
   The company reviews it on screen and the normal booking-creation path runs,
   so every existing validation, the review gate and the availability check
   still apply.
2. **The deterministic template parser runs first and always wins** on the
   fields it recognises. The model only fills what the template could not find.
3. **If the model is unavailable, misconfigured, or returns nonsense, the
   function still succeeds** with whatever the template found, plus warnings.
   The feature degrades; it never breaks booking creation.

## Deploy

```bash
supabase functions deploy booking-import
```

## Secrets

```bash
# Optional. Without it the template parser still works; free-form documents
# simply come back with fewer fields filled and a warning saying so.
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Optional. Only set this if the API reports the default model is unavailable.
supabase secrets set BOOKING_IMPORT_MODEL=claude-sonnet-4-5
```

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

## Adding a label

`LABELS` maps a label to a field. Exact matches win; otherwise the longest
known label found as a whole word inside the cell text wins, so
`"თარიღი / Date"` and `"Pickup date (dd/mm)"` both resolve. Add the Georgian,
English and Russian spellings together.
