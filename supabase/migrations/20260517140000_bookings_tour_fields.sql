-- Tour / day tour: structured itinerary and airport transfer legs (JSON)

alter table public.bookings
  add column if not exists tour_days jsonb,
  add column if not exists transfer_in jsonb,
  add column if not exists transfer_out jsonb;
