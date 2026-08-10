-- PostgREST returns [] when RETURNS TABLE includes a column named "user" (reserved).
-- Rename to username and allow case-insensitive login usernames.

DROP FUNCTION IF EXISTS public.verify_admin_login(text, text);
CREATE FUNCTION public.verify_admin_login(p_user text, p_password text)
RETURNS TABLE(id bigint, username text, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u."user" AS username, u.status
  FROM public.users u
  WHERE lower(u."user") = lower(p_user)
    AND u.password = p_password
    AND u.status = 'admin'
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.verify_admin_login(text, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.verify_visitador_login(text, text);
CREATE FUNCTION public.verify_visitador_login(p_user text, p_password text)
RETURNS TABLE(id bigint, username text, status text, visitador_id bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u."user" AS username, u.status, v.id AS visitador_id
  FROM public.users u
  INNER JOIN public.visitadores v ON v.user_id = u.id
  WHERE lower(u."user") = lower(p_user)
    AND u.password = p_password
    AND u.status = 'visitador'
    AND v.activo = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.verify_visitador_login(text, text) TO anon, authenticated, service_role;
