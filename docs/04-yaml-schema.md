# 04 — YAML Schema: Definición Declarativa de Entidades

## Concepto

Cada entidad (tabla de datos) se define en un archivo YAML dentro de la carpeta `entities/`. El engine frontend lee estos archivos y genera automáticamente:

- La tabla de datos (grid/lista)
- El formulario de creación/edición
- Los dropdowns y validaciones
- Los filtros y búsqueda

## Estructura Base de un YAML

```yaml
# ─── Metadatos ───
entity: proyecto              # Identificador único
table: proyectos              # Nombre de la tabla en PostgreSQL
label: "Proyectos"            # Label para mostrar en la UI
label_singular: "Proyecto"    # Label singular (para "Nuevo Proyecto")
icon: "📁"                    # Emoji o clase de ícono

# ─── Permisos de UI ───
# (los permisos reales están en PostgreSQL, esto es para ocultar botones)
permissions:
  create: [app_user, app_admin]
  edit: [app_user, app_admin]
  delete: [app_admin]

# ─── Opciones de listado ───
list:
  default_sort: created_at.desc
  page_size: 25
  searchable: [nombre]             # Campos en los que buscar
  columns:                          # Columnas visibles en la tabla
    - field: nombre
    - field: departamento_id
      display: departamento.nombre  # Muestra el nombre via embedding
    - field: estado_id
      display: estado.nombre
      badge: true                   # Renderizar como badge con color
      color_field: estado.color
    - field: monto
      format: currency
    - field: created_at
      format: date

# ─── Definición de campos ───
fields:
  - name: nombre
    type: text
    label: "Nombre del Proyecto"
    required: true
    max_length: 200
    placeholder: "Ingrese el nombre del proyecto"

  - name: descripcion
    type: textarea
    label: "Descripción"
    rows: 4

  - name: departamento_id
    type: select
    label: "Departamento"
    required: true
    source:
      endpoint: /departamentos?select=id,nombre&order=nombre
      value_field: id
      display_field: nombre

  - name: municipio_id
    type: select
    label: "Municipio"
    required: true
    depends_on: departamento_id
    source:
      endpoint: /municipios?select=id,nombre&departamento_id=eq.{departamento_id}&order=nombre
      value_field: id
      display_field: nombre

  - name: estado_id
    type: select
    label: "Estado"
    required: true
    default: 1
    source:
      endpoint: /estados_proyecto?select=id,nombre,color&order=orden
      value_field: id
      display_field: nombre

  - name: monto
    type: decimal
    label: "Monto (L)"
    required: true
    min: 0
    step: 0.01

  - name: fecha_inicio
    type: date
    label: "Fecha de Inicio"

  - name: fecha_fin
    type: date
    label: "Fecha de Fin"
    validate:
      gte_field: fecha_inicio
      message: "Debe ser posterior a la fecha de inicio"

  - name: observaciones
    type: textarea
    label: "Observaciones"
    rows: 3
```

## Tipos de Campo Soportados

### Campos básicos

| Tipo | HTML | Opciones |
|------|------|----------|
| `text` | `<input type="text">` | `required`, `max_length`, `min_length`, `pattern`, `placeholder` |
| `textarea` | `<textarea>` | `required`, `rows`, `max_length` |
| `integer` | `<input type="number">` | `required`, `min`, `max`, `step` (default: 1) |
| `decimal` | `<input type="number">` | `required`, `min`, `max`, `step` (default: 0.01) |
| `date` | `<input type="date">` | `required`, `min`, `max` |
| `datetime` | `<input type="datetime-local">` | `required` |
| `boolean` | `<input type="checkbox">` | `default` |
| `email` | `<input type="email">` | `required` |
| `url` | `<input type="url">` | `required` |
| `hidden` | `<input type="hidden">` | `default`, `auto` (ej: `user_id` from JWT) |

### Campos de selección

#### `select` — Dropdown desde endpoint

```yaml
- name: departamento_id
  type: select
  label: "Departamento"
  source:
    endpoint: /departamentos?select=id,nombre&order=nombre
    value_field: id
    display_field: nombre
```

#### `select` con `depends_on` — Dropdown anidado (cascada)

```yaml
- name: municipio_id
  type: select
  label: "Municipio"
  depends_on: departamento_id
  source:
    endpoint: /municipios?select=id,nombre&departamento_id=eq.{departamento_id}&order=nombre
    value_field: id
    display_field: nombre
```

La sintaxis `{departamento_id}` se reemplaza con el valor actual del campo padre. Cuando el padre cambia, el hijo se recarga automáticamente.

#### Cadena de 3+ niveles

```yaml
- name: pais_id
  type: select
  source:
    endpoint: /paises?select=id,nombre&order=nombre

- name: departamento_id
  type: select
  depends_on: pais_id
  source:
    endpoint: /departamentos?select=id,nombre&pais_id=eq.{pais_id}&order=nombre

- name: municipio_id
  type: select
  depends_on: departamento_id
  source:
    endpoint: /municipios?select=id,nombre&departamento_id=eq.{departamento_id}&order=nombre

- name: aldea_id
  type: select
  depends_on: municipio_id
  source:
    endpoint: /aldeas?select=id,nombre&municipio_id=eq.{municipio_id}&order=nombre
```

#### `select_distinct` — Valores únicos de una columna

```yaml
- name: categoria
  type: select_distinct
  label: "Categoría"
  source:
    # Requiere una vista: CREATE VIEW v_categorias AS SELECT DISTINCT categoria FROM proyectos;
    endpoint: /v_categorias?select=categoria&order=categoria
    value_field: categoria
    display_field: categoria
```

### Campo con valores fijos (sin endpoint)

```yaml
- name: prioridad
  type: select
  label: "Prioridad"
  options:
    - value: alta
      label: "🔴 Alta"
    - value: media
      label: "🟡 Media"
    - value: baja
      label: "🟢 Baja"
```

### Campo automático (se llena solo)

```yaml
- name: creado_por
  type: hidden
  auto: jwt.user_id    # Se llena con el user_id del JWT al crear
```

## Validaciones

### Validaciones por campo

```yaml
- name: monto
  type: decimal
  required: true           # No puede ser vacío
  min: 0                   # Mínimo 0
  max: 999999999.99        # Máximo
  step: 0.01               # Incremento

- name: email
  type: email
  required: true
  pattern: "^[^@]+@[^@]+$"  # Regex custom

- name: fecha_fin
  type: date
  validate:
    gte_field: fecha_inicio          # >= otro campo
    message: "Debe ser posterior al inicio"
```

### Validaciones disponibles

| Validación | Aplica a | Descripción |
|-----------|---------|-------------|
| `required: true` | todos | Campo obligatorio |
| `min` / `max` | number, date | Valor mínimo/máximo |
| `min_length` / `max_length` | text, textarea | Largo de texto |
| `pattern` | text | Regex |
| `gte_field` / `lte_field` | date, number | Comparar con otro campo |

> **Nota:** Estas validaciones se aplican en el **frontend** para UX. Las validaciones **reales** (seguras) deben estar en PostgreSQL como `CHECK` constraints.

## Opciones de Listado

```yaml
list:
  default_sort: created_at.desc    # Orden por defecto
  page_size: 25                     # Filas por página
  searchable: [nombre, descripcion] # Campos donde buscar

  # Las columnas definen qué se muestra en la tabla
  columns:
    - field: nombre
      width: 30%

    - field: departamento_id
      display: departamento.nombre   # PostgREST embedding
      header: "Depto."               # Header custom

    - field: estado_id
      display: estado.nombre
      badge: true                    # Mostrar como badge con color
      color_field: estado.color

    - field: monto
      format: currency               # Formatear como moneda
      align: right

    - field: created_at
      format: date                   # Solo fecha (sin hora)
      header: "Creado"

  # Filtros disponibles arriba de la tabla
  filters:
    - field: departamento_id
      type: select
      source:
        endpoint: /departamentos?select=id,nombre&order=nombre
    - field: estado_id
      type: select
      source:
        endpoint: /estados_proyecto?select=id,nombre&order=orden
    - field: fecha_inicio
      type: date_range
```

## Ejemplo Completo: Catálogo Simple

```yaml
# entities/departamento.yaml
entity: departamento
table: departamentos
label: "Departamentos"
label_singular: "Departamento"
icon: "🗺️"

permissions:
  create: [app_admin]
  edit: [app_admin]
  delete: [app_admin]

list:
  default_sort: nombre.asc
  page_size: 50
  columns:
    - field: nombre

fields:
  - name: nombre
    type: text
    label: "Nombre del Departamento"
    required: true
    max_length: 100
```

## Registro de Entidades

Para que el engine sepa qué entidades existen, se usa un archivo `entities/index.yaml`:

```yaml
# entities/index.yaml
entities:
  # ─── Catálogos ───
  - name: departamento
    group: "Catálogos"
    icon: "🗺️"

  - name: municipio
    group: "Catálogos"
    icon: "📍"

  - name: estado_proyecto
    group: "Catálogos"
    icon: "🏷️"

  # ─── Datos ───
  - name: proyecto
    group: "Gestión"
    icon: "📁"

  - name: beneficiario
    group: "Gestión"
    icon: "👤"

  # ─── Administración ───
  - name: usuario
    group: "Admin"
    icon: "🔐"
    roles: [app_admin]       # Solo visible para admins
```

Este índice se usa para generar el **menú lateral** de navegación automáticamente.
