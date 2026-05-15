-- Driver KYC on public.users (Clerk id = clerk_id).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS license_photo text,
  ADD COLUMN IF NOT EXISTS id_photo text,
  ADD COLUMN IF NOT EXISTS vehicle_registration_photo text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- verification_status: 'pending' | 'submitted' | 'approved' | 'rejected'
