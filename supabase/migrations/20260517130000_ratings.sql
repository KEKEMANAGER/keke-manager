CREATE TABLE IF NOT EXISTS public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  company_clerk_id text NOT NULL,
  driver_clerk_id text NOT NULL,
  stars integer CHECK (stars >= 1 AND stars <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can insert ratings" ON public.ratings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can read ratings" ON public.ratings FOR SELECT TO anon USING (true);
