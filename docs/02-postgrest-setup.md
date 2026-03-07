# 02 — PostgREST Setup

## ¿Qué es PostgREST?

PostgREST es un servidor standalone que convierte tu base de datos PostgreSQL en una API REST automáticamente. Está escrito en Haskell, compilado a binario nativo, y es extremadamente performante.

- **No necesita código backend**
- **Lee el esquema de Postgres y genera endpoints**
- **Respeta roles y permisos de PostgreSQL**
- **~15MB de imagen Docker**

## Docker Compose

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    container_name: pgrest-admin-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: pgrest_admin
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres123}
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql:/docker-entrypoint-initdb.d    # Auto-ejecuta SQLs al crear la DB
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  postgrest:
    image: postgrest/postgrest
    container_name: pgrest-admin-api
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:${AUTHENTICATOR_PASSWORD:-auth123}@db:5432/pgrest_admin
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: web_anon
      PGRST_JWT_SECRET: ${JWT_SECRET:-your-secret-key-minimum-32-characters-long!!}
      PGRST_DB_MAX_ROWS: 1000
      PGRST_OPENAPI_MODE: follow-privileges
    ports:
      - "${API_PORT:-3000}:3000"

volumes:
  pgdata:
```

## Variables de Entorno

Crear un archivo `.env` en la raíz:

```env
# Base de datos
DB_PASSWORD=postgres123
DB_PORT=5432

# PostgREST
AUTHENTICATOR_PASSWORD=auth123
API_PORT=3000

# JWT - IMPORTANTE: cambiar en producción
# Mínimo 32 caracteres
JWT_SECRET=mi-secreto-super-seguro-de-32-caracteres-minimo!!
```

## Comandos Básicos

### Levantar todo

```bash
docker compose up -d
```

### Ver logs

```bash
# Todos los servicios
docker compose logs -f

# Solo PostgREST
docker compose logs -f postgrest

# Solo Postgres
docker compose logs -f db
```

### Ejecutar SQL manualmente

```bash
# Conectarse a psql
docker exec -it pgrest-admin-db psql -U postgres -d pgrest_admin

# Ejecutar un archivo SQL
docker exec -i pgrest-admin-db psql -U postgres -d pgrest_admin < sql/mi_script.sql
```

### Reiniciar PostgREST (para que recargue el esquema)

```bash
# Después de cambios en tablas/vistas/funciones:
docker compose restart postgrest

# O enviar señal SIGUSR1 para reload sin downtime:
docker kill -s SIGUSR1 pgrest-admin-api
```

### Destruir y recrear todo

```bash
docker compose down -v   # -v elimina los volúmenes (datos)
docker compose up -d
```

## Verificar que funciona

### 1. Verificar que Postgres está corriendo

```bash
docker exec pgrest-admin-db pg_isready -U postgres
# Debe decir: accepting connections
```

### 2. Verificar que PostgREST responde

```bash
curl http://localhost:3000/
# Devuelve la lista de endpoints disponibles (OpenAPI spec)
```

### 3. Consultar una tabla

```bash
curl http://localhost:3000/departamentos
# Devuelve JSON con los datos
```

## Operaciones REST de PostgREST

### SELECT (leer)

```bash
# Todos los registros
GET /proyectos

# Filtrar con operadores
GET /proyectos?estado_id=eq.1                    # igual a
GET /proyectos?monto=gt.1000000                  # mayor que
GET /proyectos?nombre=like.*puente*               # LIKE
GET /proyectos?estado_id=in.(1,2,3)              # IN
GET /proyectos?created_at=gte.2024-01-01         # mayor o igual

# Seleccionar columnas específicas
GET /proyectos?select=id,nombre,monto

# Embedding (JOINs automáticos via FK)
GET /proyectos?select=*,departamento:departamentos(nombre),estado:estados_proyecto(nombre,color)

# Ordenar
GET /proyectos?order=created_at.desc

# Paginar
GET /proyectos?limit=20&offset=40
# O con headers Range:
# Range: 0-19  (primeros 20)
# Range: 20-39 (siguientes 20)

# Contar total
GET /proyectos?select=count()
# O con header: Prefer: count=exact
```

### INSERT (crear)

```bash
POST /proyectos
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "nombre": "Puente Río Lindo",
  "departamento_id": 5,
  "municipio_id": 23,
  "estado_id": 1,
  "monto": 1500000.00
}

# Respuesta: 201 Created
# Para que devuelva el registro creado:
# Header: Prefer: return=representation
```

### UPDATE (modificar)

```bash
PATCH /proyectos?id=eq.42
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "estado_id": 2,
  "monto": 2000000.00
}
```

### DELETE (eliminar)

```bash
DELETE /proyectos?id=eq.42
Authorization: Bearer <jwt>
```

### Llamar funciones (RPC)

```bash
POST /rpc/login
Content-Type: application/json

{
  "email": "admin@ejemplo.com",
  "password": "1234"
}
```

## Conectar PostgREST a un Postgres Existente

Si ya tenés Postgres corriendo fuera de Docker:

```yaml
services:
  postgrest:
    image: postgrest/postgrest
    environment:
      PGRST_DB_URI: postgres://authenticator:auth123@host.docker.internal:5432/mi_db
      # host.docker.internal = tu máquina host (macOS/Windows)
      # En Linux: usar network_mode: host o la IP del host
    ports:
      - "3000:3000"
```

## Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| `connection refused` | DB no está corriendo | `docker compose up db` |
| `role "web_anon" does not exist` | No se ejecutaron los SQLs iniciales | Ejecutar `sql/00_roles.sql` |
| `permission denied for table X` | Faltan GRANTs | `GRANT SELECT ON X TO web_anon;` |
| `JWT invalid` | Secreto no coincide | Verificar `PGRST_JWT_SECRET` |
| Tabla nueva no aparece | PostgREST no recargó esquema | `docker compose restart postgrest` |
