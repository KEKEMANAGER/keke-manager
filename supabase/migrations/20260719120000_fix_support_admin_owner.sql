-- Support desk: owner admin (not Victor); demote mistaken admin assignment.

-- AKAKI / kekemanager owner accounts receive support; Victor excluded.
CREATE OR REPLACE FUNCTION public.get_support_admin_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE role = 'admin'
    AND lower(trim(email)) <> 'viktorasatiani@gmail.com'
  ORDER BY
    CASE
      WHEN lower(trim(email)) = 'akachibaia1410@gmail.com' THEN 0
      WHEN lower(trim(email)) LIKE '%kekemanager%' THEN 1
      WHEN lower(trim(email)) LIKE '%keke.ge' THEN 2
      ELSE 10
    END,
    created_at ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_support_admin_user_id IS
  'Primary platform admin for support chat (excludes viktorasatiani@gmail.com).';

-- Platform owner → admin (admin panel + support inbox).
UPDATE public.users
SET role = 'admin'
WHERE lower(trim(email)) IN ('akachibaia1410@gmail.com', 'kekemanager@icloud.com')
  AND role IS DISTINCT FROM 'admin';

-- Victor should not have admin access.
UPDATE public.users
SET role = 'driver'
WHERE lower(trim(email)) = 'viktorasatiani@gmail.com'
  AND role = 'admin';

-- Re-tag misrouted support messages (null thread) sent to Victor → current support admin.
UPDATE public.messages m
SET
  thread_type = 'support',
  receiver_id = public.get_support_admin_user_id()
WHERE lower(trim((
  SELECT u.email FROM public.users u WHERE u.id = m.receiver_id
))) = 'viktorasatiani@gmail.com'
  AND m.thread_type IS DISTINCT FROM 'support'
  AND public.get_support_admin_user_id() IS NOT NULL
  AND m.receiver_id <> public.get_support_admin_user_id();
