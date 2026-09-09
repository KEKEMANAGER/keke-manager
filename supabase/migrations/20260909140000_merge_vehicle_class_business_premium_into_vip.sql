-- Merge the 'business' and 'premium' vehicle classes into a single 'vip' class.
-- App-level VEHICLE_CLASSES is now ['economy', 'comfort', 'vip'] (lib/vehicleCatalog.ts);
-- normalizeVehicleClass() already maps any legacy 'business'/'premium' string (and their
-- Georgian aliases) to 'vip', so this migration just brings the underlying data in line
-- with that so raw queries/admin views don't need to go through the app's alias mapping.

UPDATE public.profiles
SET vehicle_class = 'vip'
WHERE lower(trim(vehicle_class)) IN (
  'business', 'ბიზნესი', 'ბიზნეს',
  'premium', 'lux', 'პრემიუმი', 'პრემიუმ', 'ლუქსი', 'ლუქს'
);

UPDATE public.bookings
SET vehicle_class = 'vip'
WHERE lower(trim(vehicle_class)) IN (
  'business', 'ბიზნესი', 'ბიზნეს',
  'premium', 'lux', 'პრემიუმი', 'პრემიუმ', 'ლუქსი', 'ლუქს'
);

UPDATE public.vehicles
SET class = 'vip'
WHERE lower(trim(class)) IN (
  'business', 'ბიზნესი', 'ბიზნეს',
  'premium', 'lux', 'პრემიუმი', 'პრემიუმ', 'ლუქსი', 'ლუქს'
);
