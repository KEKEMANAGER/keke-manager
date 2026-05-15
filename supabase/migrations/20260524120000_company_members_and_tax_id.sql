-- Company profile: tax id on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tax_id text;

-- Tour operators (company staff names for booking attribution)
CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id text NOT NULL,
  name text NOT NULL,
  CONSTRAINT company_members_company_name_unique UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS company_members_company_id_idx ON public.company_members (company_id);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_anon_all" ON public.company_members;
CREATE POLICY "company_members_anon_select" ON public.company_members
  FOR SELECT TO anon USING (true);
CREATE POLICY "company_members_anon_insert" ON public.company_members
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "company_members_anon_delete" ON public.company_members
  FOR DELETE TO anon USING (true);

-- Booking: who created the order (tour operator display name)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS created_by_name text;
