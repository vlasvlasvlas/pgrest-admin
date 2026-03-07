# 01 — Arquitectura General

## Visión General

**pgrest-admin** es un framework declarativo para construir interfaces CRUD (ABMs) sobre PostgreSQL. La idea central es: **definir entidades en YAML y que el sistema genere todo lo demás**.

## Filosofía

1. **Declarativo sobre imperativo** — No escribís código para cada ABM, declarás la estructura
2. **PostgreSQL es el backend** — Validaciones, permisos, y lógica de negocio viven en la base de datos
3. **PostgREST elimina el backend** — API REST automática, zero code
4. **Frontend genérico** — Un engine lee YAMLs y genera UI dinámicamente
5. **Escalabilidad lineal** — Agregar una entidad nueva = 1 YAML + 1 tabla SQL

## Diagrama de Arquitectura

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND                           │
│                                                       │
│  ┌─────────┐  ┌───────────┐  ┌────────────────────┐ │
│  │  Auth    │  │  Engine   │  │    Componentes     │ │
│  │ (JWT)    │  │ (YAML→UI) │  │ (Select, Table,   │ │
│  │         │  │           │  │  Form, Fields...)  │ │
│  └────┬────┘  └─────┬─────┘  └────────┬───────────┘ │
│       │             │                  │              │
│       └─────────────┼──────────────────┘              │
│                     │                                 │
└─────────────────────┼─────────────────────────────────┘
                      │ HTTP (fetch)
                      ▼
┌──────────────────────────────────────────────────────┐
│                  POSTGREST                            │
│           (API REST automática)                       │
│                                                       │
│  GET /tabla        → SELECT * FROM tabla              │
│  POST /tabla       → INSERT INTO tabla                │
│  PATCH /tabla?id=  → UPDATE tabla SET ... WHERE       │
│  DELETE /tabla?id= → DELETE FROM tabla WHERE          │
│  POST /rpc/fn      → SELECT fn(...)                   │
│                                                       │
└─────────────────────┼─────────────────────────────────┘
                      │ SQL
                      ▼
┌──────────────────────────────────────────────────────┐
│                  POSTGRESQL                           │
│                                                       │
│  ┌───────────┐ ┌───────────┐ ┌─────────────────────┐│
│  │  Tablas   │ │  Vistas   │ │  Funciones          ││
│  │  de datos │ │  (joins,  │ │  (login, lógica     ││
│  │  y        │ │  distinct)│ │   de negocio)       ││
│  │  catálogos│ │           │ │                     ││
│  └───────────┘ └───────────┘ └─────────────────────┘│
│                                                       │
│  ┌───────────┐ ┌───────────────────────────────────┐ │
│  │  Roles    │ │  Row Level Security (RLS)         │ │
│  │  (permisos│ │  (permisos por fila/usuario)      │ │
│  │  por tabla│ │                                   │ │
│  └───────────┘ └───────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Flujo de Datos

### Lectura (GET)

```
Usuario abre "Proyectos"
  → Engine lee entities/proyecto.yaml
  → Sabe qué campos mostrar, qué columnas tiene la tabla
  → fetch("postgrest/proyectos?select=*,departamento:departamentos(nombre)")
  → PostgREST ejecuta SELECT con el ROL del JWT
  → RLS filtra las filas que el usuario puede ver
  → Frontend renderiza DataTable
```

### Escritura (POST/PATCH)

```
Usuario llena formulario
  → Engine valida campos según YAML (required, min, max, type)
  → Arma payload JSON con IDs de los selects
  → fetch("postgrest/proyectos", { method: "POST", body: payload })
  → PostgREST ejecuta INSERT con el ROL del JWT
  → PostgreSQL valida con CHECK constraints
  → RLS verifica que el usuario tiene permiso
  → Si ok → 201 Created / Si error → 400/403 con mensaje
```

### Dropdowns Anidados (Cascada)

```
Usuario selecciona Departamento = "Cortés" (id: 5)
  → onChange dispara recarga del select "Municipio"
  → fetch("postgrest/municipios?departamento_id=eq.5&select=id,nombre")
  → Se recargan las opciones de Municipio
  → Si hay un tercer nivel (ej: Aldea), se encadena igual
```

## Stack Tecnológico

| Componente | Tecnología | Justificación |
|-----------|-----------|---------------|
| Base de datos | PostgreSQL 16+ | Robusta, RLS, funciones, estándar |
| API REST | PostgREST | Zero code, automática, performante (C) |
| Frontend | Vanilla JS + CSS | Sin dependencias, rápido, mantenible |
| Configuración | YAML | Legible, versionable, simple |
| Auth | JWT + pg roles | Estándar, todo en Postgres |
| Deploy | Docker Compose | Reproducible, portable |

## Decisiones de Diseño

### ¿Por qué no un backend (Express/FastAPI)?

PostgREST genera el 100% del CRUD, filtros, paginación, y relaciones. Un backend custom agregaría complejidad sin beneficio para este caso de uso. Si en el futuro se necesita lógica que no se puede resolver en SQL, se puede agregar un microservicio al lado.

### ¿Por qué YAML y no JSON?

- Más legible para humanos (sin llaves ni comillas obligatorias)
- Soporta comentarios
- Ideal para configuración declarativa
- Se parsea fácilmente en JS con librerías livianas (~5KB)

### ¿Por qué Vanilla JS y no React/Vue?

- Cero dependencias = cero builds = cero breaking changes
- El engine es suficientemente simple para no necesitar un framework
- Más rápido de cargar y ejecutar
- Fácil de entender y mantener
- Si en el futuro se quiere migrar a un framework, los componentes son fácilmente adaptables

### ¿Por qué RLS en vez de permisos en código?

- Los permisos son **imposibles de bypasear** — viven en el motor de la DB
- Un bug en el frontend NO puede exponer datos de otro usuario
- Se definen una vez y aplican para cualquier acceso (PostgREST, psql, otro servicio)
