-- Track per-angle vehicle photo freshness (content hash + timestamp) so we can:
--   1) require drivers to re-upload all 5 vehicle photos periodically, and
--   2) detect when a driver re-submits the exact same old photo instead of
--      taking a new one (the timestamp alone would reset either way).
--
-- Shape: { "photo_front": { "hash": "...", "updatedAt": "2026-09-10T12:00:00.000Z" }, ... }
-- Keys are the vehicles.photo_* column names. Populated going forward as photos
-- are (re)uploaded; older photos with no entry here are treated as overdue by
-- the app (lib/vehicleVerification.ts: vehiclePhotosOverdue), which is the
-- correct behavior on rollout — everyone does one fresh camera re-upload.
alter table public.vehicles
  add column if not exists photo_meta jsonb not null default '{}'::jsonb;

comment on column public.vehicles.photo_meta is
  'Per-angle vehicle photo freshness tracking: { "<photo_column>": { "hash": string, "updatedAt": ISO8601 } }. Used to enforce periodic (2-month) re-upload and to detect duplicate re-submission of an old photo.';
