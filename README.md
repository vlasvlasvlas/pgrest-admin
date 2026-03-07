# pgrest-admin

**Framework declarativo para ABMs sobre PostgreSQL**

Motor de CRUD automático basado en **YAML + PostgREST + PostgreSQL**, con componentes frontend reutilizables, dropdowns anidados, validaciones, y permisos por rol.

## ¿Qué es?

Un sistema que permite definir entidades en archivos YAML y automáticamente genera:

- 🔄 **API REST** completa (via PostgREST, zero backend code)
- 📋 **Tablas de datos** con filtros, búsqueda y paginación
- 📝 **Formularios dinámicos** con dropdowns anidados, validaciones, y campos tipados
- 🔐 **Auth y permisos** con JWT + Row Level Security de PostgreSQL
- 🎨 **UI moderna** generada automáticamente desde la declaración YAML

## Stack

| Capa | Tecnología |
|------|-----------|
| Base de datos | PostgreSQL 16 |
| API REST | PostgREST (auto-generado) |
| Frontend | Vanilla JS + HTML + CSS |
| Configuración | YAML por entidad |
| Auth | JWT + RLS de PostgreSQL |
| Deploy | Docker Compose |

## Ejemplo rápido

```yaml
# entities/proyecto.yaml
entity: proyecto
table: proyectos
label: "Proyectos"
icon: "📁"

fields:
  - name: nombre
    type: text
    required: true

  - name: departamento_id
    type: select
    source:
      endpoint: /departamentos?select=id,nombre
      value_field: id
      display_field: nombre

  - name: municipio_id
    type: select
    depends_on: departamento_id
    source:
      endpoint: /municipios?select=id,nombre&departamento_id=eq.{departamento_id}
      value_field: id
      display_field: nombre
```

Con esto, el engine genera la tabla, el formulario, y los dropdowns anidados automáticamente.

## Estructura del proyecto

```
pgrest-admin/
├── docker-compose.yml
├── docs/                    # Documentación completa
├── sql/                     # Scripts SQL (roles, tablas, RLS)
├── entities/                # Un YAML por entidad
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── app.js           # Router + init
│       ├── engine.js        # Motor YAML → UI
│       ├── components/      # Componentes reutilizables
│       └── auth.js          # Login + JWT
```

## Documentación

| Doc | Contenido |
|-----|-----------|
| [01 — Arquitectura](docs/01-arquitectura.md) | Visión general, stack, flujo de datos |
| [02 — PostgREST Setup](docs/02-postgrest-setup.md) | Docker, configuración, primeros pasos |
| [03 — Permisos y Auth](docs/03-permisos-auth.md) | Roles, JWT, Row Level Security |
| [04 — YAML Schema](docs/04-yaml-schema.md) | Formato declarativo de entidades |
| [05 — Componentes Frontend](docs/05-componentes-frontend.md) | Componentes reutilizables UI |
| [06 — Engine](docs/06-engine.md) | Motor central de renderizado |

## Quickstart

```bash
# 1. Levantar Postgres + PostgREST
docker compose up -d

# 2. Inicializar base de datos
docker exec -i pgrest-admin-db-1 psql -U postgres -d pgrest_admin < sql/00_roles.sql
docker exec -i pgrest-admin-db-1 psql -U postgres -d pgrest_admin < sql/01_catalogos.sql

# 3. Abrir frontend
open frontend/index.html
# (o servir con cualquier server estático)
```

---

> *"La entidad 1 cuesta esfuerzo. La entidad 2 a la 50 es solo YAML + SQL."*
