-- Verification (run LAST)
SELECT COUNT(*) AS vehicle_makes_count FROM public.vehicle_makes;
SELECT COUNT(*) AS vehicle_models_count FROM public.vehicle_models;
COMMIT;
