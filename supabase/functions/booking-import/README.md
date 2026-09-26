# booking-import

Turns a company's own Word / Excel / text file into a **booking draft**.

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

{ "fileName": "booking.docx", "contentBase64": "UEsDBBQ..." }
```

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
| `.txt` `.csv` `.tsv` | Read as UTF-8 |
| `.doc` | Rejected with "save as .docx" |
| `.pdf` | Not supported yet |

Limit: ~4 MB.

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
