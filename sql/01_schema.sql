-- 01_schema.sql
-- Esquema principal, seguridad, RLS y funciones de auth.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO web_anon, app_user, app_admin;
GRANT USAGE ON SCHEMA public TO web_anon, app_user, app_admin;

CREATE TABLE IF NOT EXISTS public.departamentos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.municipios (
  id BIGSERIAL PRIMARY KEY,
  departamento_id BIGINT NOT NULL REFERENCES public.departamentos(id),
  nombre TEXT NOT NULL,
  UNIQUE (departamento_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.estados_proyecto (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#64748b',
  orden INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.usuarios (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'app_user' CHECK (rol IN ('app_user', 'app_admin')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proyectos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  departamento_id BIGINT NOT NULL REFERENCES public.departamentos(id),
  municipio_id BIGINT REFERENCES public.municipios(id),
  estado_id BIGINT NOT NULL REFERENCES public.estados_proyecto(id) DEFAULT 1,
  monto NUMERIC(14, 2) NOT NULL CHECK (monto >= 0),
  fecha_inicio DATE,
  fecha_fin DATE,
  creado_por BIGINT NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_proyectos_fechas
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_proyectos_departamento_id ON public.proyectos (departamento_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_municipio_id ON public.proyectos (municipio_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_estado_id ON public.proyectos (estado_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_creado_por ON public.proyectos (creado_por);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER trg_usuarios_updated_at
BEFORE UPDATE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_proyectos_updated_at ON public.proyectos;
CREATE TRIGGER trg_proyectos_updated_at
BEFORE UPDATE ON public.proyectos
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION auth.current_user_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('request.jwt.claims', true) IS NULL THEN NULL
    ELSE (current_setting('request.jwt.claims', true)::jsonb ->> 'user_id')::BIGINT
  END;
$$;

CREATE OR REPLACE FUNCTION auth.base64url_encode(data BYTEA)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT translate(
    trim(trailing '=' FROM replace(encode(data, 'base64'), E'\n', '')),
    '+/',
    '-_'
  );
$$;

CREATE OR REPLACE FUNCTION auth.sign_jwt(payload JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  header TEXT := '{"alg":"HS256","typ":"JWT"}';
  -- Mantener este valor en sync con JWT_SECRET de PostgREST.
  secret TEXT := 'dev-secret-change-me-please-32-chars';
  header_b64 TEXT;
  payload_b64 TEXT;
  signature BYTEA;
BEGIN
  header_b64 := auth.base64url_encode(convert_to(header, 'UTF8'));
  payload_b64 := auth.base64url_encode(convert_to(payload::TEXT, 'UTF8'));
  signature := hmac(header_b64 || '.' || payload_b64, secret, 'sha256');

  RETURN header_b64 || '.' || payload_b64 || '.' || auth.base64url_encode(signature);
END;
$$;

CREATE OR REPLACE FUNCTION auth.login(p_email TEXT, p_password TEXT)
RETURNS TABLE(token TEXT, user_data JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_catalog
AS $$
DECLARE
  usr public.usuarios%ROWTYPE;
  claims JSONB;
BEGIN
  SELECT *
  INTO usr
  FROM public.usuarios
  WHERE email = lower(trim(p_email))
    AND activo = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credenciales invalidas' USING ERRCODE = '28000';
  END IF;

  IF usr.password_hash <> crypt(p_password, usr.password_hash) THEN
    RAISE EXCEPTION 'Credenciales invalidas' USING ERRCODE = '28000';
  END IF;

  claims := jsonb_build_object(
    'role', usr.rol,
    'user_id', usr.id,
    'email', usr.email,
    'nombre', usr.nombre,
    'exp', floor(extract(epoch FROM NOW() + interval '12 hours'))::BIGINT
  );

  token := auth.sign_jwt(claims);
  user_data := claims - 'exp';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.login(p_email TEXT, p_password TEXT)
RETURNS TABLE(token TEXT, user_data JSONB)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT token, user_data
  FROM auth.login(p_email, p_password);
$$;

GRANT EXECUTE ON FUNCTION auth.login(TEXT, TEXT) TO web_anon;
GRANT EXECUTE ON FUNCTION public.login(TEXT, TEXT) TO web_anon;
GRANT EXECUTE ON FUNCTION auth.current_user_id() TO app_user, app_admin;

GRANT SELECT ON public.departamentos, public.municipios, public.estados_proyecto TO web_anon, app_user, app_admin;
GRANT INSERT, UPDATE, DELETE ON public.departamentos, public.municipios, public.estados_proyecto TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyectos TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyectos TO app_admin;
GRANT SELECT ON public.usuarios TO app_admin;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_admin;

ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proyectos_admin_all ON public.proyectos;
CREATE POLICY proyectos_admin_all
ON public.proyectos
FOR ALL
TO app_admin
USING (TRUE)
WITH CHECK (TRUE);

DROP POLICY IF EXISTS proyectos_user_select ON public.proyectos;
CREATE POLICY proyectos_user_select
ON public.proyectos
FOR SELECT
TO app_user
USING (creado_por = auth.current_user_id());

DROP POLICY IF EXISTS proyectos_user_insert ON public.proyectos;
CREATE POLICY proyectos_user_insert
ON public.proyectos
FOR INSERT
TO app_user
WITH CHECK (creado_por = auth.current_user_id());

DROP POLICY IF EXISTS proyectos_user_update ON public.proyectos;
CREATE POLICY proyectos_user_update
ON public.proyectos
FOR UPDATE
TO app_user
USING (creado_por = auth.current_user_id())
WITH CHECK (creado_por = auth.current_user_id());

DROP POLICY IF EXISTS proyectos_user_delete ON public.proyectos;
CREATE POLICY proyectos_user_delete
ON public.proyectos
FOR DELETE
TO app_user
USING (creado_por = auth.current_user_id());
