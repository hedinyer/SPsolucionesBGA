-- Login admin: valida credenciales y exige users.status = 'admin'
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_user text, p_password text)
RETURNS TABLE(id bigint, "user" text, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u."user", u.status
  FROM public.users u
  WHERE u."user" = p_user
    AND u.password = p_password
    AND u.status = 'admin'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_login(text, text) TO anon, authenticated, service_role;
