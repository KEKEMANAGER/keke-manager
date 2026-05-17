-- The multi-vehicle migration (20260518130000) replaced the single-vehicle-per-driver
-- primary key with a uuid PK but never dropped the old UNIQUE (driver_clerk_id/driver_id)
-- constraint. That leftover constraint prevents drivers from adding a second vehicle.

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_driver_clerk_id_key;
