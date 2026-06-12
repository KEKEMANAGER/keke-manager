-- Allow any signed-in user to resolve the support desk admin id (RLS blocks direct users SELECT).

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
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_support_admin_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_support_admin_user_id() TO authenticated;

COMMENT ON FUNCTION public.get_support_admin_user_id IS
  'Returns primary admin user id for in-app support chat (thread_type = support).';
