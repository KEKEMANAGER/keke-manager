-- Align legacy profile/booking/vehicle vehicle_class codes with app canonical keys (economy | comfort | premium).
UPDATE public.profiles
SET vehicle_class = 'economy'
WHERE vehicle_class IS NOT NULL AND lower(trim(vehicle_class)) IN ('eco');

UPDATE public.profiles
SET vehicle_class = 'premium'
WHERE vehicle_class IS NOT NULL AND lower(trim(vehicle_class)) IN ('lux');

UPDATE public.bookings
SET vehicle_class = 'economy'
WHERE vehicle_class IS NOT NULL AND lower(trim(vehicle_class)) IN ('eco');

UPDATE public.bookings
SET vehicle_class = 'premium'
WHERE vehicle_class IS NOT NULL AND lower(trim(vehicle_class)) IN ('lux');

UPDATE public.vehicles
SET class = 'economy'
WHERE class IS NOT NULL AND lower(trim(class)) IN ('eco');

UPDATE public.vehicles
SET class = 'premium'
WHERE class IS NOT NULL AND lower(trim(class)) IN ('lux');
