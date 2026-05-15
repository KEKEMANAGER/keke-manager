-- Align vehicles table with app inserts (photos screen + type/class selectors).
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS class text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS plate text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
