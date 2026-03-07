# 05 — Componentes Frontend Reutilizables

## Filosofía

Los componentes son **funciones puras** que reciben configuración (del YAML) y generan HTML dinámicamente. No usan frameworks — solo DOM API nativo. Cada componente es un módulo ES6 independiente.

## Inventario de Componentes

| Componente | Archivo | Responsabilidad |
|-----------|---------|----------------|
| `DataTable` | `data-table.js` | Tabla de datos con columnas, orden, paginación, búsqueda |
| `DynamicForm` | `form.js` | Formulario dinámico generado desde YAML fields |
| `FieldText` | `field-text.js` | Input de texto/email/url |
| `FieldNumber` | `field-number.js` | Input numérico (integer/decimal) |
| `FieldSelect` | `field-select.js` | Dropdown con carga desde endpoint o opciones fijas |
| `FieldDate` | `field-date.js` | Input de fecha/datetime |
| `FieldTextarea` | `field-textarea.js` | Textarea |
| `FieldBoolean` | `field-boolean.js` | Checkbox |
| `Modal` | `modal.js` | Modal genérico (para formularios, confirmaciones) |
| `Toast` | `toast.js` | Notificaciones tipo toast |
| `Sidebar` | `sidebar.js` | Menú lateral con grupos de entidades |
| `Toolbar` | `toolbar.js` | Barra superior (búsqueda, botón nuevo, filtros) |

---

## DataTable — Tabla de Datos

### Responsabilidades
- Renderiza una tabla HTML desde datos JSON
- Columnas configurables desde YAML (`list.columns`)
- Ordenamiento por click en header
- Paginación
- Búsqueda por texto
- Formato de celdas (currency, date, badge)
- Actions: editar, eliminar

### Interfaz

```javascript
// data-table.js
export class DataTable {
  /**
   * @param {HTMLElement} container - Donde renderizar
   * @param {Object} entityConfig - Configuración YAML parseada
   * @param {Object} options - Callbacks y config adicional
   */
  constructor(container, entityConfig, options = {}) {
    this.container = container;
    this.config = entityConfig;
    this.onEdit = options.onEdit || (() => {});
    this.onDelete = options.onDelete || (() => {});
    this.currentPage = 1;
    this.pageSize = entityConfig.list?.page_size || 25;
    this.sortField = entityConfig.list?.default_sort || 'id.desc';
    this.searchQuery = '';
  }

  /** Carga datos desde PostgREST y renderiza */
  async load() {
    const params = this.buildQueryParams();
    const response = await api.get(`/${this.config.table}?${params}`);
    this.data = response.data;
    this.totalCount = response.totalCount;
    this.render();
  }

  /** Construye los query params para PostgREST */
  buildQueryParams() {
    const params = new URLSearchParams();
    
    // Select con embeddings
    const select = this.buildSelect();
    params.set('select', select);
    
    // Orden
    params.set('order', this.sortField);
    
    // Paginación
    params.set('limit', this.pageSize);
    params.set('offset', (this.currentPage - 1) * this.pageSize);
    
    // Búsqueda
    if (this.searchQuery && this.config.list?.searchable) {
      const searchFields = this.config.list.searchable;
      const orClauses = searchFields.map(f => `${f}.ilike.*${this.searchQuery}*`);
      params.set('or', `(${orClauses.join(',')})`);
    }
    
    return params.toString();
  }

  /** Construye el select con embeddings para columnas con display */
  buildSelect() {
    const parts = ['*'];
    for (const col of this.config.list?.columns || []) {
      if (col.display) {
        // "departamento.nombre" → embedding PostgREST
        const [relation, field] = col.display.split('.');
        parts.push(`${relation}(${field})`);
      }
    }
    return parts.join(',');
  }

  /** Renderiza la tabla completa */
  render() {
    this.container.innerHTML = '';
    this.container.appendChild(this.renderTable());
    this.container.appendChild(this.renderPagination());
  }

  /** Renderiza el <table> con headers y filas */
  renderTable() {
    const table = document.createElement('table');
    table.className = 'data-table';
    
    // Headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of this.config.list?.columns || []) {
      const th = document.createElement('th');
      th.textContent = col.header || this.getFieldLabel(col.field);
      th.style.width = col.width || 'auto';
      th.style.textAlign = col.align || 'left';
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => this.toggleSort(col.field));
      headerRow.appendChild(th);
    }
    // Columna de acciones
    headerRow.appendChild(Object.assign(document.createElement('th'), {
      textContent: '', className: 'actions-col'
    }));
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    for (const row of this.data) {
      tbody.appendChild(this.renderRow(row));
    }
    table.appendChild(tbody);
    
    return table;
  }

  /** Renderiza una fila */
  renderRow(row) {
    const tr = document.createElement('tr');
    
    for (const col of this.config.list?.columns || []) {
      const td = document.createElement('td');
      td.style.textAlign = col.align || 'left';
      
      let value;
      if (col.display) {
        // Valor desde embedding: row.departamento.nombre
        const [relation, field] = col.display.split('.');
        value = row[relation]?.[field] || '';
      } else {
        value = row[col.field];
      }
      
      // Formateo
      td.innerHTML = this.formatCell(value, col);
      tr.appendChild(td);
    }
    
    // Acciones
    const actionsTd = document.createElement('td');
    actionsTd.className = 'actions-cell';
    actionsTd.innerHTML = `
      <button class="btn-icon btn-edit" title="Editar">✏️</button>
      <button class="btn-icon btn-delete" title="Eliminar">🗑️</button>
    `;
    actionsTd.querySelector('.btn-edit').addEventListener('click', () => this.onEdit(row));
    actionsTd.querySelector('.btn-delete').addEventListener('click', () => this.onDelete(row));
    tr.appendChild(actionsTd);
    
    return tr;
  }

  /** Formatea el valor de una celda según el formato especificado */
  formatCell(value, col) {
    if (value === null || value === undefined) return '<span class="null-value">—</span>';
    
    switch (col.format) {
      case 'currency':
        return `<span class="currency">L ${Number(value).toLocaleString('es-HN', { minimumFractionDigits: 2 })}</span>`;
      case 'date':
        return new Date(value).toLocaleDateString('es-HN');
      case 'datetime':
        return new Date(value).toLocaleString('es-HN');
      default:
        if (col.badge) {
          const color = col.color_field ? this.getNestedValue(value, col.color_field) : '#666';
          return `<span class="badge" style="background:${color}">${value}</span>`;
        }
        return String(value);
    }
  }
}
```

---

## FieldSelect — Dropdown con Cascada

### Este es el componente más importante del framework

```javascript
// field-select.js
export class FieldSelect {
  /**
   * @param {Object} fieldConfig - Configuración del campo desde YAML
   * @param {Object} formState - Estado actual del formulario (referencia compartida)
   * @param {Function} onFieldChange - Callback cuando cambia el valor
   */
  constructor(fieldConfig, formState, onFieldChange) {
    this.config = fieldConfig;
    this.formState = formState;
    this.onFieldChange = onFieldChange;
    this.element = null;
    this.selectEl = null;
  }

  /** Renderiza el campo completo (label + select) */
  render() {
    this.element = document.createElement('div');
    this.element.className = 'form-field';

    // Label
    const label = document.createElement('label');
    label.htmlFor = this.config.name;
    label.textContent = this.config.label;
    if (this.config.required) {
      label.innerHTML += ' <span class="required">*</span>';
    }
    this.element.appendChild(label);

    // Select
    this.selectEl = document.createElement('select');
    this.selectEl.id = this.config.name;
    this.selectEl.name = this.config.name;
    this.selectEl.required = this.config.required || false;

    this.selectEl.addEventListener('change', () => {
      const value = this.selectEl.value ? 
        (isNaN(this.selectEl.value) ? this.selectEl.value : Number(this.selectEl.value)) : 
        null;
      this.formState[this.config.name] = value;
      this.onFieldChange(this.config.name, value);
    });

    this.element.appendChild(this.selectEl);

    // Error message container
    const errorEl = document.createElement('span');
    errorEl.className = 'field-error';
    errorEl.id = `${this.config.name}-error`;
    this.element.appendChild(errorEl);

    return this.element;
  }

  /** Carga opciones: desde endpoint, opciones fijas, o dependencia */
  async loadOptions(parentValue = null) {
    this.selectEl.innerHTML = '<option value="">-- Seleccione --</option>';

    // Si tiene depends_on y el padre no tiene valor, deshabilitamos
    if (this.config.depends_on && !parentValue) {
      this.selectEl.disabled = true;
      this.selectEl.innerHTML = '<option value="">-- Seleccione primero ' + 
        this.config.depends_on.replace('_id', '') + ' --</option>';
      return;
    }

    this.selectEl.disabled = false;

    let options = [];

    if (this.config.options) {
      // Opciones fijas definidas en YAML
      options = this.config.options;
    } else if (this.config.source) {
      // Cargar desde PostgREST
      let endpoint = this.config.source.endpoint;
      
      // Reemplazar variables de dependencia
      if (this.config.depends_on && parentValue) {
        endpoint = endpoint.replace(`{${this.config.depends_on}}`, parentValue);
      }

      const data = await api.get(endpoint);
      options = data.map(row => ({
        value: row[this.config.source.value_field],
        label: row[this.config.source.display_field]
      }));
    }

    // Agregar opciones al select
    for (const opt of options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      this.selectEl.appendChild(optionEl);
    }

    // Si hay valor por defecto
    if (this.config.default && !this.formState[this.config.name]) {
      this.selectEl.value = this.config.default;
      this.formState[this.config.name] = this.config.default;
    }

    // Restaurar valor en modo edición
    if (this.formState[this.config.name]) {
      this.selectEl.value = this.formState[this.config.name];
    }
  }

  /** Valida el campo */
  validate() {
    const value = this.formState[this.config.name];
    const errorEl = this.element.querySelector('.field-error');

    if (this.config.required && (value === null || value === undefined || value === '')) {
      errorEl.textContent = `${this.config.label} es obligatorio`;
      this.selectEl.classList.add('invalid');
      return false;
    }

    errorEl.textContent = '';
    this.selectEl.classList.remove('invalid');
    return true;
  }

  /** Resetea el campo */
  reset() {
    this.selectEl.value = '';
    this.formState[this.config.name] = null;
    this.selectEl.classList.remove('invalid');
    this.element.querySelector('.field-error').textContent = '';
  }

  /** Devuelve el valor actual */
  getValue() {
    return this.formState[this.config.name];
  }

  /** Setea el valor */
  setValue(value) {
    this.formState[this.config.name] = value;
    this.selectEl.value = value;
  }
}
```

---

## DynamicForm — Formulario Dinámico

### Orquesta todos los campos y maneja la cascada de dependencias

```javascript
// form.js
export class DynamicForm {
  constructor(container, entityConfig, options = {}) {
    this.container = container;
    this.config = entityConfig;
    this.mode = options.mode || 'create';  // 'create' | 'edit'
    this.initialData = options.data || {};
    this.onSubmit = options.onSubmit || (() => {});
    this.onCancel = options.onCancel || (() => {});
    
    // Estado del formulario (todos los valores)
    this.state = { ...this.initialData };
    
    // Mapa de componentes de campo
    this.fields = new Map();
    
    // Mapa de dependencias: { municipio_id: "departamento_id" }
    this.dependencies = new Map();
  }

  /** Renderiza el formulario completo */
  async render() {
    this.container.innerHTML = '';
    
    const form = document.createElement('form');
    form.className = 'dynamic-form';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Crear cada campo según su tipo
    for (const fieldConfig of this.config.fields) {
      const field = this.createField(fieldConfig);
      this.fields.set(fieldConfig.name, field);
      form.appendChild(field.render());

      // Registrar dependencias
      if (fieldConfig.depends_on) {
        this.dependencies.set(fieldConfig.name, fieldConfig.depends_on);
      }
    }

    // Botones
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">
        ${this.mode === 'create' ? 'Crear' : 'Guardar'}
      </button>
    `;
    actions.querySelector('.btn-cancel').addEventListener('click', () => this.onCancel());
    form.appendChild(actions);

    this.container.appendChild(form);

    // Cargar datos iniciales de selects
    await this.loadInitialData();
  }

  /** Crea el componente correcto según el tipo de campo */
  createField(fieldConfig) {
    const onChange = (name, value) => this.handleFieldChange(name, value);

    switch (fieldConfig.type) {
      case 'select':
      case 'select_distinct':
        return new FieldSelect(fieldConfig, this.state, onChange);
      case 'text':
      case 'email':
      case 'url':
        return new FieldText(fieldConfig, this.state, onChange);
      case 'integer':
      case 'decimal':
        return new FieldNumber(fieldConfig, this.state, onChange);
      case 'date':
      case 'datetime':
        return new FieldDate(fieldConfig, this.state, onChange);
      case 'textarea':
        return new FieldTextarea(fieldConfig, this.state, onChange);
      case 'boolean':
        return new FieldBoolean(fieldConfig, this.state, onChange);
      default:
        return new FieldText(fieldConfig, this.state, onChange);
    }
  }

  /** Cuando un campo cambia, recarga los campos que dependen de él */
  async handleFieldChange(changedField, newValue) {
    // Buscar todos los campos que dependen de este
    for (const [childName, parentName] of this.dependencies) {
      if (parentName === changedField) {
        // Resetear el hijo
        const childField = this.fields.get(childName);
        childField.reset();
        
        // Recargar opciones del hijo con el nuevo valor del padre
        await childField.loadOptions(newValue);

        // Si el hijo a su vez tiene dependientes, resetearlos también (cascada)
        await this.handleFieldChange(childName, null);
      }
    }
  }

  /** Carga datos iniciales de todos los selects */
  async loadInitialData() {
    for (const fieldConfig of this.config.fields) {
      if (fieldConfig.type === 'select' || fieldConfig.type === 'select_distinct') {
        const field = this.fields.get(fieldConfig.name);
        if (!fieldConfig.depends_on) {
          // Cargar selects independientes
          await field.loadOptions();
        } else if (this.state[fieldConfig.depends_on]) {
          // En modo edit, cargar selects dependientes con el valor actual del padre
          await field.loadOptions(this.state[fieldConfig.depends_on]);
        }
      }
    }
  }

  /** Valida y envía el formulario */
  async handleSubmit() {
    let isValid = true;
    
    for (const [name, field] of this.fields) {
      if (!field.validate()) {
        isValid = false;
      }
    }

    if (!isValid) return;

    // Construir payload solo con los campos definidos en YAML
    const payload = {};
    for (const fieldConfig of this.config.fields) {
      if (fieldConfig.type !== 'hidden' || fieldConfig.auto) {
        const value = this.state[fieldConfig.name];
        if (value !== undefined && value !== null) {
          payload[fieldConfig.name] = value;
        }
      }
    }

    await this.onSubmit(payload);
  }
}
```

---

## Toast — Notificaciones

```javascript
// toast.js
export class Toast {
  static show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toast-container') || 
      (() => {
        const c = document.createElement('div');
        c.id = 'toast-container';
        document.body.appendChild(c);
        return c;
      })();
    
    container.appendChild(toast);
    
    // Animación de entrada
    requestAnimationFrame(() => toast.classList.add('show'));
    
    // Auto-remover
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  static success(msg) { Toast.show(msg, 'success'); }
  static error(msg) { Toast.show(msg, 'error', 5000); }
  static warning(msg) { Toast.show(msg, 'warning', 4000); }
  static info(msg) { Toast.show(msg, 'info'); }
}
```

---

## Modal — Diálogos

```javascript
// modal.js
export class Modal {
  constructor(options = {}) {
    this.title = options.title || '';
    this.size = options.size || 'medium'; // small, medium, large
    this.onClose = options.onClose || (() => {});
    this.element = null;
    this.contentContainer = null;
  }

  open() {
    this.element = document.createElement('div');
    this.element.className = 'modal-overlay';
    this.element.innerHTML = `
      <div class="modal modal-${this.size}">
        <div class="modal-header">
          <h2>${this.title}</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body"></div>
      </div>
    `;
    
    this.contentContainer = this.element.querySelector('.modal-body');
    this.element.querySelector('.modal-close').addEventListener('click', () => this.close());
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
    
    document.body.appendChild(this.element);
    requestAnimationFrame(() => this.element.classList.add('show'));
    
    return this.contentContainer;
  }

  close() {
    this.element.classList.remove('show');
    setTimeout(() => {
      this.element.remove();
      this.onClose();
    }, 200);
  }

  static confirm(message) {
    return new Promise((resolve) => {
      const modal = new Modal({ title: 'Confirmar', size: 'small' });
      const body = modal.open();
      body.innerHTML = `
        <p>${message}</p>
        <div class="form-actions">
          <button class="btn btn-secondary btn-no">Cancelar</button>
          <button class="btn btn-danger btn-yes">Eliminar</button>
        </div>
      `;
      body.querySelector('.btn-no').addEventListener('click', () => { modal.close(); resolve(false); });
      body.querySelector('.btn-yes').addEventListener('click', () => { modal.close(); resolve(true); });
    });
  }
}
```
