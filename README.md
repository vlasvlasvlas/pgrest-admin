# pgrest-admin

`pgrest-admin` es un framework declarativo para construir ABMs sobre PostgreSQL sin backend custom.

La idea central:
- describis entidades en YAML,
- PostgREST expone CRUD automaticamente,
- el frontend dinamico renderiza tabla + formulario + validaciones + permisos de UI.

## Estado del proyecto

Este repositorio esta en estado **MVP funcional** y ya corre end-to-end.

Incluye:
- PostgreSQL + PostgREST con Docker Compose.
- Roles, JWT, login RPC y RLS en SQL.
- Entidades YAML de ejemplo.
- Frontend vanilla JS con login, listado, alta, edicion y baja.

## Stack

- PostgreSQL 16
- PostgREST 12
- Frontend: HTML + CSS + Vanilla JS (ES Modules)
- Config declarativa: YAML
- Infra local: Docker Compose

## Arquitectura (resumen)

1. El usuario inicia sesion en el frontend.
2. El frontend llama `POST /rpc/login` y recibe JWT.
3. El frontend usa el JWT en requests a PostgREST.
4. PostgREST aplica rol PostgreSQL segun claim `role`.
5. PostgreSQL aplica `GRANT` + `RLS` para filtrar operaciones y filas.
6. El engine carga `entities/*.yaml` y genera UI dinamicamente.

## Requisitos

- Docker y Docker Compose
- Python 3 (para servir frontend estatico)
- `curl` para chequeos rapidos opcionales

## Quickstart

### 1) Configuracion

```bash
cp .env.example .env
```

### 2) Levantar DB + API

```bash
docker compose up -d
```

### 3) Levantar frontend (desde la raiz del repo)

```bash
python3 -m http.server 8080
```

### 4) Abrir app

- Frontend: `http://localhost:8080/frontend/`
- OpenAPI PostgREST: `http://localhost:3000/`

## Credenciales demo

- Admin
  - email: `admin@pgrest.local`
  - password: `admin123`
- Usuario
  - email: `user@pgrest.local`
  - password: `user123`

## Verificacion rapida

### Health de servicios

```bash
docker compose ps
```

### Leer catalogo (sin JWT)

```bash
curl -sS http://localhost:3000/departamentos
```

### Login (genera JWT)

```bash
curl -sS -X POST http://localhost:3000/rpc/login \
  -H 'Content-Type: application/json' \
  -d '{"p_email":"user@pgrest.local","p_password":"user123"}'
```

### Leer proyectos con JWT

```bash
TOKEN=$(curl -sS -X POST http://localhost:3000/rpc/login \
  -H 'Content-Type: application/json' \
  -d '{"p_email":"user@pgrest.local","p_password":"user123"}' \
  | ruby -rjson -e 'j=JSON.parse(STDIN.read); print j[0]["token"]')

curl -sS http://localhost:3000/proyectos -H "Authorization: Bearer $TOKEN"
```

## Estructura del repositorio

```text
pgrest-admin/
|- docker-compose.yml
|- .env.example
|- sql/
|  |- 00_roles.sql
|  |- 01_schema.sql
|  `- 02_seed.sql
|- entities/
|  |- index.yaml
|  |- proyecto.yaml
|  |- departamento.yaml
|  |- municipio.yaml
|  `- estado_proyecto.yaml
|- frontend/
|  |- index.html
|  |- css/styles.css
|  `- js/
|     |- app.js
|     |- api.js
|     |- auth.js
|     |- engine.js
|     `- components/
|        |- data-table.js
|        |- form.js
|        |- modal.js
|        `- toast.js
`- docs/
   |- 01-arquitectura.md
   |- 02-postgrest-setup.md
   |- 03-permisos-auth.md
   |- 04-yaml-schema.md
   |- 05-componentes-frontend.md
   |- 06-engine.md
   `- 07-comite-expertos.md
```

## Seguridad actual

- Roles usados: `web_anon`, `app_user`, `app_admin`, `authenticator`.
- Login implementado en SQL via `public.login(...)` -> `auth.login(...)`.
- JWT firmado en DB (`auth.sign_jwt`) y validado por PostgREST.
- RLS activo y forzado en `public.proyectos`.

Importante:
- El secreto en `sql/01_schema.sql` (`auth.sign_jwt`) debe coincidir con `JWT_SECRET` de `.env`.
- Este baseline es para entorno local/demo. Antes de produccion hay que externalizar y rotar secretos.

## Como agregar una entidad nueva

1. Crear tabla, constraints, grants y politicas RLS en SQL.
2. Crear `entities/<entidad>.yaml` con `list`, `fields` y `permissions`.
3. Registrar entidad en `entities/index.yaml`.
4. Reiniciar PostgREST para refrescar schema cache:

```bash
docker compose restart postgrest
```

## Operacion diaria

### Ver logs

```bash
docker compose logs -f db
docker compose logs -f postgrest
```

### Reiniciar servicios

```bash
docker compose restart
```

### Resetear base de datos (destructivo)

```bash
docker compose down -v
docker compose up -d
```

## Troubleshooting rapido

- `PGRST202 ... function ... not found`:
  - revisar schema expuesto y firma de la funcion;
  - reiniciar PostgREST (`docker compose restart postgrest`).
- `JWSError`:
  - revisar que el secret de `auth.sign_jwt` y `JWT_SECRET` coincidan.
- El frontend abre pero no carga entidades:
  - asegurar que el servidor estatico corre desde la raiz del repo, no desde `frontend/`.

## Gobierno tecnico

Se incluye el enfoque de comite de 3 expertos en:
- `docs/07-comite-expertos.md`

Resumen de perfiles:
1. Arquitectura de datos
2. Seguridad y cumplimiento
3. Producto/UX operativa

## Checklist para publicar en Git

- [ ] `docker compose up -d` funciona sin errores.
- [ ] Login demo funciona para `admin` y `user`.
- [ ] CRUD de `proyectos` probado desde UI.
- [ ] README y docs alineados a implementacion real.
- [ ] Secretos de desarrollo no reutilizados en produccion.
- [ ] Definir licencia del repositorio (`LICENSE`) antes de abrir contribuciones externas.

## Proximos pasos recomendados

1. Migraciones versionadas (ej. `sql/migrations`) en lugar de solo init scripts.
2. Suite de pruebas automatizadas (API + RLS + smoke frontend).
3. Manejo de secretos fuera de SQL hardcoded.
4. Pipeline CI para validar compose, SQL y lint basico.
