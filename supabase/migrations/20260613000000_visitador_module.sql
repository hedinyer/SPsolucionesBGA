-- Módulo visitador: rol en users, vínculo visitadores↔users, evidencias de visita, RPCs

-- 1. Ampliar users.status para incluir 'visitador'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('normal', 'admin', 'visitador'));

COMMENT ON COLUMN public.users.status IS
  'normal = app cliente. admin = panel spappweb. visitador = app/portal visitador.';

CREATE INDEX IF NOT EXISTS idx_users_status_visitador
  ON public.users (status)
  WHERE status = 'visitador';

-- 2. Vincular visitadores con cuenta de login
ALTER TABLE public.visitadores
  ADD COLUMN IF NOT EXISTS user_id bigint UNIQUE REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitadores_user_id ON public.visitadores(user_id);

-- 3. Evidencias de visita domiciliaria
ALTER TABLE public.visitas
  ADD COLUMN IF NOT EXISTS evidencia_fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidencia_videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ubicacion_verificada jsonb,
  ADD COLUMN IF NOT EXISTS fecha_completada timestamptz,
  ADD COLUMN IF NOT EXISTS notas_visita text;

-- 4. Bucket para evidencias (fotos y videos de visita)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visita-evidencias',
  'visita-evidencias',
  true,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read visita evidencias'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read visita evidencias"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'visita-evidencias');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow upload visita evidencias'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow upload visita evidencias"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'visita-evidencias');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow update visita evidencias'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow update visita evidencias"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'visita-evidencias');
  END IF;
END $$;

-- 5. Login app móvil (clientes y visitadores; excluye admin)
CREATE OR REPLACE FUNCTION public.verify_login(p_user text, p_password text)
RETURNS TABLE(id bigint, "user" text, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u."user", u.status
  FROM public.users u
  WHERE u."user" = p_user
    AND u.password = p_password
    AND u.status IN ('normal', 'visitador')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon, authenticated, service_role;

-- 6. Login visitador (app y portal web)
CREATE OR REPLACE FUNCTION public.verify_visitador_login(p_user text, p_password text)
RETURNS TABLE(id bigint, "user" text, status text, visitador_id bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, u."user", u.status, v.id AS visitador_id
  FROM public.users u
  INNER JOIN public.visitadores v ON v.user_id = u.id
  WHERE u."user" = p_user
    AND u.password = p_password
    AND u.status = 'visitador'
    AND v.activo = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_visitador_login(text, text) TO anon, authenticated, service_role;

-- 7. Listar visitas asignadas a un visitador
CREATE OR REPLACE FUNCTION public.get_visitas_asignadas(p_visitador_id bigint)
RETURNS TABLE(
  id uuid,
  user_id bigint,
  digital_contract_id uuid,
  visitador_id bigint,
  estado text,
  cliente_nombre text,
  cliente_celular text,
  direccion_visita text,
  barrio text,
  fecha_programada timestamptz,
  notas text,
  evidencia_fotos jsonb,
  evidencia_videos jsonb,
  ubicacion_verificada jsonb,
  fecha_completada timestamptz,
  notas_visita text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $$
  SELECT
    vis.id,
    vis.user_id,
    vis.digital_contract_id,
    vis.visitador_id,
    vis.estado,
    vis.cliente_nombre,
    vis.cliente_celular,
    vis.direccion_visita,
    vis.barrio,
    vis.fecha_programada,
    vis.notas,
    vis.evidencia_fotos,
    vis.evidencia_videos,
    vis.ubicacion_verificada,
    vis.fecha_completada,
    vis.notas_visita,
    vis.created_at,
    vis.updated_at
  FROM public.visitas vis
  WHERE vis.visitador_id = p_visitador_id
    AND vis.estado = 'asignada'
  ORDER BY vis.fecha_programada ASC NULLS LAST, vis.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_visitas_asignadas(bigint) TO anon, authenticated, service_role;

-- 8. Completar visita con evidencias obligatorias
CREATE OR REPLACE FUNCTION public.complete_visita_visitador(
  p_visitador_id bigint,
  p_visita_id uuid,
  p_evidencia_fotos jsonb,
  p_evidencia_videos jsonb,
  p_ubicacion_verificada jsonb,
  p_notas_visita text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_estado text;
  v_visitador_id bigint;
  v_foto_count int;
  v_video_count int;
  v_lat double precision;
  v_lng double precision;
BEGIN
  SELECT estado, visitador_id
  INTO v_estado, v_visitador_id
  FROM public.visitas
  WHERE id = p_visita_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  IF v_visitador_id IS DISTINCT FROM p_visitador_id THEN
    RAISE EXCEPTION 'Esta visita no está asignada a ti';
  END IF;

  IF v_estado <> 'asignada' THEN
    RAISE EXCEPTION 'La visita no está en estado asignada';
  END IF;

  v_foto_count := COALESCE(jsonb_array_length(p_evidencia_fotos), 0);
  v_video_count := COALESCE(jsonb_array_length(p_evidencia_videos), 0);

  IF v_foto_count < 1 THEN
    RAISE EXCEPTION 'Debes subir al menos una foto de evidencia';
  END IF;

  IF v_video_count < 1 THEN
    RAISE EXCEPTION 'Debes subir al menos un video de evidencia';
  END IF;

  v_lat := (p_ubicacion_verificada->>'lat')::double precision;
  v_lng := (p_ubicacion_verificada->>'lng')::double precision;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    RAISE EXCEPTION 'Debes capturar la ubicación exacta (lat/lng)';
  END IF;

  UPDATE public.visitas
  SET
    estado = 'completada',
    evidencia_fotos = p_evidencia_fotos,
    evidencia_videos = p_evidencia_videos,
    ubicacion_verificada = p_ubicacion_verificada,
    fecha_completada = now(),
    notas_visita = NULLIF(trim(p_notas_visita), ''),
    updated_at = now()
  WHERE id = p_visita_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_visita_visitador(
  bigint, uuid, jsonb, jsonb, jsonb, text
) TO anon, authenticated, service_role;

-- Migración legacy: vincular visitadores existentes manualmente, por ejemplo:
-- INSERT INTO users ("user", password, status) VALUES ('visitador1', 'clave', 'visitador');
-- UPDATE visitadores SET user_id = <user_id> WHERE id = <visitador_id>;
