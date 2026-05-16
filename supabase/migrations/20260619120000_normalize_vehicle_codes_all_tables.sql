-- One-time: normalize vehicle type/class to English canonical codes (profiles, bookings, vehicles).
-- Georgian labels and legacy aliases → sedan, minivan, suv, microbus, bus, special | economy, comfort, business, premium, vip.

-- ── vehicle_type ─────────────────────────────────────────────────────────────

UPDATE public.profiles SET vehicle_type = 'sedan' WHERE lower(trim(vehicle_type)) IN ('sedan', 'სედანი');
UPDATE public.profiles SET vehicle_type = 'minivan' WHERE lower(trim(vehicle_type)) IN ('minivan', 'მინივენი');
UPDATE public.profiles SET vehicle_type = 'suv' WHERE lower(trim(vehicle_type)) IN ('suv');
UPDATE public.profiles SET vehicle_type = 'microbus' WHERE lower(trim(vehicle_type)) IN ('microbus', 'minibus', 'micro-bus', 'მიკროავტობუსი');
UPDATE public.profiles SET vehicle_type = 'bus' WHERE lower(trim(vehicle_type)) IN ('bus', 'ავტობუსი');
UPDATE public.profiles SET vehicle_type = 'special' WHERE lower(trim(vehicle_type)) IN ('special', 'სპეც. ტრანსპორტი', 'სპეციალური', 'special transport');

UPDATE public.bookings SET vehicle_type = 'sedan' WHERE lower(trim(vehicle_type)) IN ('sedan', 'სედანი');
UPDATE public.bookings SET vehicle_type = 'minivan' WHERE lower(trim(vehicle_type)) IN ('minivan', 'მინივენი');
UPDATE public.bookings SET vehicle_type = 'suv' WHERE lower(trim(vehicle_type)) IN ('suv');
UPDATE public.bookings SET vehicle_type = 'microbus' WHERE lower(trim(vehicle_type)) IN ('microbus', 'minibus', 'micro-bus', 'მიკროავტობუსი');
UPDATE public.bookings SET vehicle_type = 'bus' WHERE lower(trim(vehicle_type)) IN ('bus', 'ავტობუსი');
UPDATE public.bookings SET vehicle_type = 'special' WHERE lower(trim(vehicle_type)) IN ('special', 'სპეც. ტრანსპორტი', 'სპეციალური', 'special transport');

UPDATE public.vehicles SET type = 'sedan' WHERE lower(trim(type)) IN ('sedan', 'სედანი');
UPDATE public.vehicles SET type = 'minivan' WHERE lower(trim(type)) IN ('minivan', 'მინივენი');
UPDATE public.vehicles SET type = 'suv' WHERE lower(trim(type)) IN ('suv');
UPDATE public.vehicles SET type = 'microbus' WHERE lower(trim(type)) IN ('microbus', 'minibus', 'micro-bus', 'მიკროავტობუსი');
UPDATE public.vehicles SET type = 'bus' WHERE lower(trim(type)) IN ('bus', 'ავტობუსი');
UPDATE public.vehicles SET type = 'special' WHERE lower(trim(type)) IN ('special', 'სპეც. ტრანსპორტი', 'სპეციალური', 'special transport');

-- ── vehicle_class / class ────────────────────────────────────────────────────

UPDATE public.profiles SET vehicle_class = 'economy' WHERE lower(trim(vehicle_class)) IN ('economy', 'eco', 'ეკონომი', 'ეკო');
UPDATE public.profiles SET vehicle_class = 'comfort' WHERE lower(trim(vehicle_class)) IN ('comfort', 'კომფორტი');
UPDATE public.profiles SET vehicle_class = 'business' WHERE lower(trim(vehicle_class)) IN ('business', 'ბიზნესი', 'ბიზნეს');
UPDATE public.profiles SET vehicle_class = 'premium' WHERE lower(trim(vehicle_class)) IN ('premium', 'lux', 'პრემიუმი', 'პრემიუმ', 'ლუქსი', 'ლუქს');
UPDATE public.profiles SET vehicle_class = 'vip' WHERE lower(trim(vehicle_class)) IN ('vip');

UPDATE public.bookings SET vehicle_class = 'economy' WHERE lower(trim(vehicle_class)) IN ('economy', 'eco', 'ეკონომი', 'ეკო');
UPDATE public.bookings SET vehicle_class = 'comfort' WHERE lower(trim(vehicle_class)) IN ('comfort', 'კომფორტი');
UPDATE public.bookings SET vehicle_class = 'business' WHERE lower(trim(vehicle_class)) IN ('business', 'ბიზნესი', 'ბიზნეს');
UPDATE public.bookings SET vehicle_class = 'premium' WHERE lower(trim(vehicle_class)) IN ('premium', 'lux', 'პრემიუმი', 'პრემიუმ', 'ლუქსი', 'ლუქს');
UPDATE public.bookings SET vehicle_class = 'vip' WHERE lower(trim(vehicle_class)) IN ('vip');

UPDATE public.vehicles SET class = 'economy' WHERE lower(trim(class)) IN ('economy', 'eco', 'ეკონომი', 'ეკო');
UPDATE public.vehicles SET class = 'comfort' WHERE lower(trim(class)) IN ('comfort', 'კომფორტი');
UPDATE public.vehicles SET class = 'business' WHERE lower(trim(class)) IN ('business', 'ბიზნესი', 'ბიზნეს');
UPDATE public.vehicles SET class = 'premium' WHERE lower(trim(class)) IN ('premium', 'lux', 'პრემიუმი', 'პრემიუმ', 'ლუქსი', 'ლუქს');
UPDATE public.vehicles SET class = 'vip' WHERE lower(trim(class)) IN ('vip');
