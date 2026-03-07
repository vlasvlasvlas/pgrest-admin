# 03 — Permisos y Autenticación

## Modelo de Seguridad

pgrest-admin usa el modelo de seguridad **nativo de PostgreSQL**. No hay middleware ni lógica de permisos en el frontend o en PostgREST — todo se resuelve en la base de datos.

```
JWT (quién sos) → PostgreSQL Role (qué podés) → RLS (qué filas ves)
```

## Roles

### Estructura de roles

```sql
-- =============================================================
-- ROL AUTHENTICATOR
-- Es el usuario con el que PostgREST se conecta a Postgres.
-- No tiene permisos propios, pero puede "cambiar" a otros roles.
-- =============================================================
CREATE ROLE authenticator LOGIN PASSWORD 'auth123' NOINHERIT;

-- =============================================================
-- ROL WEB_ANON
-- Representa requests sin JWT (usuario no logueado).
-- Permisos mínimos: solo lectura de catálogos y login.
-- =============================================================
CREATE ROLE web_anon NOLOGIN;
GRANT web_anon TO authenticator;

-- =============================================================
-- ROL APP_USER
-- Representa un usuario autenticado con JWT.
-- Puede leer catálogos y hacer CRUD en sus datos.
-- =============================================================
CREATE ROLE app_user NOLOGIN;
GRANT app_user TO authenticator;

-- =============================================================
-- ROL APP_ADMIN
-- Administrador. Puede ver y modificar todos los datos.
-- =============================================================
CREATE ROLE app_admin NOLOGIN;
GRANT app_admin TO authenticator;
```

### Permisos por tabla

```sql
-- ─── Catálogos (solo lectura para todos) ───
GRANT USAGE ON SCHEMA public TO web_anon, app_user, app_admin;

GRANT SELECT ON
  departamentos,
  municipios,
  estados_proyecto
TO web_anon, app_user, app_admin;

-- ─── Tablas de datos (CRUD para usuarios autenticados) ───
GRANT SELECT, INSERT, UPDATE ON proyectos TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ─── Admin: todo ───
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_admin;
```

### Permisos por columna (opcional, granular)

```sql
-- Un usuario puede ver estas columnas pero no modificar monto_aprobado
GRANT SELECT (id, nombre, departamento_id, municipio_id, monto, estado_id) ON proyectos TO app_user;
GRANT UPDATE (nombre, departamento_id, municipio_id, monto) ON proyectos TO app_user;
-- monto_aprobado solo lo puede cambiar un admin
GRANT UPDATE (monto_aprobado) ON proyectos TO app_admin;
```

## JWT (JSON Web Tokens)

### Estructura del token

```json
{
  "role": "app_user",
  "user_id": 42,
  "email": "juan@ejemplo.com",
  "nombre": "Juan Pérez",
  "exp": 1735689600
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `role` | string | **Obligatorio.** Nombre del rol de Postgres (`app_user`, `app_admin`) |
| `user_id` | integer | ID del usuario en la tabla `usuarios` |
| `email` | string | Email del usuario |
| `nombre` | string | Nombre para mostrar en UI |
| `exp` | integer | Timestamp Unix de expiración |

### Cómo PostgREST usa el JWT

1. El frontend envía el JWT en el header `Authorization: Bearer <token>`
2. PostgREST **verifica la firma** con `PGRST_JWT_SECRET`
3. PostgREST ejecuta:
   ```sql
   SET LOCAL ROLE app_user;  -- cambia al rol del JWT
   SET LOCAL request.jwt.claims TO '{"user_id":42,"email":"juan@ejemplo.com"}';
   ```
4. Todas las queries se ejecutan **con los permisos de ese rol**
5. Las políticas RLS pueden acceder a los claims via `current_setting()`

### Sin JWT → web_anon

Si el request no tiene JWT, PostgREST usa el rol `web_anon` (configurado en `PGRST_DB_ANON_ROLE`).

## Tabla de Usuarios

```sql
-- Extensión para hashing de passwords
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'app_user'
                CHECK (rol IN ('app_user', 'app_admin')),
  activo        BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT now(),
  updated_at    TIMESTAMP DEFAULT now()
);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_updated
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

### Crear usuarios

```sql
INSERT INTO usuarios (email, password_hash, nombre, rol)
VALUES (
  'admin@ejemplo.com',
  crypt('admin123', gen_salt('bf')),  -- bcrypt hash
  'Administrador',
  'app_admin'
);

INSERT INTO usuarios (email, password_hash, nombre, rol)
VALUES (
  'juan@ejemplo.com',
  crypt('juan123', gen_salt('bf')),
  'Juan Pérez',
  'app_user'
);
```

## Función de Login

```sql
CREATE TYPE jwt_token AS (token JSON);

CREATE OR REPLACE FUNCTION login(p_email TEXT, p_password TEXT)
RETURNS jwt_token AS $$
DECLARE
  usr RECORD;
  result jwt_token;
BEGIN
  -- Buscar usuario activo
  SELECT id, email, nombre, rol, password_hash
  INTO usr
  FROM usuarios
  WHERE email = p_email AND activo = true;

  -- Verificar que existe
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email o contraseña incorrectos'
      USING ERRCODE = '28000';  -- invalid_authorization_specification
  END IF;

  -- Verificar password
  IF usr.password_hash != crypt(p_password, usr.password_hash) THEN
    RAISE EXCEPTION 'Email o contraseña incorrectos'
      USING ERRCODE = '28000';
  END IF;

  -- Construir JWT payload
  -- PostgREST firma esto automáticamente con PGRST_JWT_SECRET
  SELECT json_build_object(
    'role',    usr.rol,
    'user_id', usr.id,
    'email',   usr.email,
    'nombre',  usr.nombre,
    'exp',     extract(epoch FROM now() + interval '12 hours')::integer
  )::jwt_token INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- web_anon puede llamar a login (obvio, no está logueado aún)
GRANT EXECUTE ON FUNCTION login TO web_anon;
```

### Usar desde el frontend

```javascript
async function login(email, password) {
  const res = await fetch(`${API_URL}/rpc/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email: email, p_password: password })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Error de login');
  }

  const data = await res.json();
  // PostgREST devuelve: [{ "token": { "role": "app_user", ... } }]
  const payload = data[0].token;

  // Firmar el JWT en el frontend NO es necesario si usás
  // el tipo jwt_token — PostgREST lo firma por vos
  localStorage.setItem('jwt', data[0].token);

  return payload;
}
```

## Row Level Security (RLS)

RLS permite controlar qué **filas** puede ver o modificar cada usuario.

### Habilitar RLS

```sql
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;

-- IMPORTANTE: Forzar RLS incluso para el dueño de la tabla
ALTER TABLE proyectos FORCE ROW LEVEL SECURITY;
```

### Políticas comunes

#### Patrón 1: "Cada usuario ve solo sus registros"

```sql
CREATE POLICY "usuarios ven sus proyectos"
  ON proyectos
  FOR SELECT
  TO app_user
  USING (
    creado_por = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer
  );

CREATE POLICY "usuarios crean con su id"
  ON proyectos
  FOR INSERT
  TO app_user
  WITH CHECK (
    creado_por = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer
  );

CREATE POLICY "usuarios editan sus proyectos"
  ON proyectos
  FOR UPDATE
  TO app_user
  USING (
    creado_por = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer
  );
```

#### Patrón 2: "Admin ve todo"

```sql
CREATE POLICY "admin acceso total"
  ON proyectos
  FOR ALL
  TO app_admin
  USING (true)
  WITH CHECK (true);
```

#### Patrón 3: "Usuarios ven registros de su departamento"

```sql
CREATE POLICY "usuarios ven su departamento"
  ON proyectos
  FOR SELECT
  TO app_user
  USING (
    departamento_id IN (
      SELECT departamento_id FROM usuario_departamentos
      WHERE usuario_id = (current_setting('request.jwt.claims', true)::json->>'user_id')::integer
    )
  );
```

#### Patrón 4: "Solo se pueden editar registros en estado borrador"

```sql
CREATE POLICY "solo editar borradores"
  ON proyectos
  FOR UPDATE
  TO app_user
  USING (estado_id = 1)  -- 1 = borrador
  WITH CHECK (true);
```

### Combinar políticas

Las políticas del **mismo tipo (SELECT, INSERT, etc.)** para el **mismo rol** se combinan con **OR**. Es decir, si cualquiera de las políticas permite la operación, se ejecuta.

```sql
-- Un app_user puede ver un proyecto si:
-- 1. Lo creó él  OR
-- 2. Pertenece a su departamento
-- Ambas políticas están activas simultáneamente
```

## Resumen de Seguridad

```
┌────────────────────────────────────────────────────┐
│                    CAPAS DE SEGURIDAD              │
│                                                    │
│  1. JWT → ¿Quién sos? (role, user_id)             │
│  2. GRANT → ¿Podés acceder a esta tabla?          │
│  3. RLS → ¿Podés ver/editar esta fila?            │
│  4. CHECK → ¿El dato es válido?                   │
│  5. FK → ¿La referencia existe?                   │
│                                                    │
│  Todo en PostgreSQL. Imposible de bypasear desde   │
│  el frontend.                                      │
└────────────────────────────────────────────────────┘
```
