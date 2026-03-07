# 06 — Engine: Motor Central de Renderizado

## Concepto

El Engine es el **corazón del framework**. Lee los YAMLs de entidades y orquesta los componentes para generar la interfaz completa. Es el único punto donde se conecta configuración con UI.

## Responsabilidades

1. **Cargar y parsear YAMLs** de entidades
2. **Generar el menú lateral** desde `entities/index.yaml`
3. **Renderizar DataTable** cuando se selecciona una entidad
4. **Abrir formularios** (crear/editar) en modal
5. **Ejecutar CRUD** contra PostgREST
6. **Manejar refresh** después de operaciones

## Arquitectura del Engine

```
Engine
  ├── loadIndex()        → Carga entities/index.yaml, genera menú
  ├── navigate(entity)   → Carga YAML de la entidad, muestra DataTable
  ├── openCreate()       → Abre modal con formulario vacío
  ├── openEdit(row)      → Abre modal con formulario pre-llenado
  ├── handleCreate(data) → POST a PostgREST
  ├── handleUpdate(data) → PATCH a PostgREST
  ├── handleDelete(row)  → DELETE a PostgREST
  └── refresh()          → Recarga DataTable actual
```

## Implementación

```javascript
// engine.js
import { DataTable } from './components/data-table.js';
import { DynamicForm } from './components/form.js';
import { Modal } from './components/modal.js';
import { Toast } from './components/toast.js';
import { api } from './api.js';
import { auth } from './auth.js';

export class Engine {
  constructor() {
    this.currentEntity = null;      // Entidad actualmente visible
    this.currentConfig = null;      // YAML parseado de la entidad actual
    this.dataTable = null;          // Instancia de DataTable actual
    this.entityCache = new Map();   // Cache de YAMLs parseados
    
    // Contenedores DOM
    this.sidebarEl = document.getElementById('sidebar');
    this.mainEl = document.getElementById('main-content');
    this.headerEl = document.getElementById('header-title');
  }

  // ──────────────────────────────────────────────
  //  INICIALIZACIÓN
  // ──────────────────────────────────────────────

  async init() {
    // Verificar autenticación
    if (!auth.isLoggedIn()) {
      this.showLogin();
      return;
    }

    // Cargar índice de entidades y generar menú
    await this.loadIndex();

    // Navegar a la primera entidad del menú
    const firstEntity = this.menuItems[0]?.name;
    if (firstEntity) {
      this.navigate(firstEntity);
    }
  }

  /** Carga entities/index.yaml y genera el sidebar */
  async loadIndex() {
    const indexYaml = await fetch('/entities/index.yaml').then(r => r.text());
    const index = jsyaml.load(indexYaml);
    
    this.menuItems = index.entities.filter(e => {
      // Filtrar por rol del usuario
      if (e.roles && !e.roles.includes(auth.getRole())) return false;
      return true;
    });

    this.renderSidebar();
  }

  /** Renderiza el menú lateral agrupado */
  renderSidebar() {
    const groups = {};
    for (const item of this.menuItems) {
      const group = item.group || 'General';
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    }

    this.sidebarEl.innerHTML = '';
    for (const [groupName, items] of Object.entries(groups)) {
      const groupEl = document.createElement('div');
      groupEl.className = 'sidebar-group';
      groupEl.innerHTML = `<h3 class="sidebar-group-title">${groupName}</h3>`;
      
      for (const item of items) {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'sidebar-item';
        link.dataset.entity = item.name;
        link.innerHTML = `<span class="sidebar-icon">${item.icon || '📄'}</span> ${item.label || item.name}`;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigate(item.name);
        });
        groupEl.appendChild(link);
      }
      
      this.sidebarEl.appendChild(groupEl);
    }
  }

  // ──────────────────────────────────────────────
  //  NAVEGACIÓN
  // ──────────────────────────────────────────────

  /** Navega a una entidad: carga config y muestra DataTable */
  async navigate(entityName) {
    // Highlight en menú
    this.sidebarEl.querySelectorAll('.sidebar-item').forEach(el => {
      el.classList.toggle('active', el.dataset.entity === entityName);
    });

    // Cargar configuración YAML (con cache)
    this.currentEntity = entityName;
    this.currentConfig = await this.loadEntityConfig(entityName);

    // Actualizar header
    this.headerEl.textContent = this.currentConfig.label || entityName;

    // Renderizar vista
    this.mainEl.innerHTML = '';

    // Toolbar (buscar + nuevo)
    const toolbar = this.renderToolbar();
    this.mainEl.appendChild(toolbar);

    // DataTable
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    this.mainEl.appendChild(tableContainer);

    this.dataTable = new DataTable(tableContainer, this.currentConfig, {
      onEdit: (row) => this.openEdit(row),
      onDelete: (row) => this.handleDelete(row)
    });

    await this.dataTable.load();
  }

  /** Carga y cachea el YAML de una entidad */
  async loadEntityConfig(entityName) {
    if (this.entityCache.has(entityName)) {
      return this.entityCache.get(entityName);
    }

    const yamlText = await fetch(`/entities/${entityName}.yaml`).then(r => r.text());
    const config = jsyaml.load(yamlText);
    this.entityCache.set(entityName, config);
    return config;
  }

  // ──────────────────────────────────────────────
  //  TOOLBAR
  // ──────────────────────────────────────────────

  renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    
    const canCreate = this.currentConfig.permissions?.create?.includes(auth.getRole());
    
    toolbar.innerHTML = `
      <div class="toolbar-left">
        <input type="search" 
               class="search-input" 
               placeholder="Buscar..."
               id="search-input">
      </div>
      <div class="toolbar-right">
        ${canCreate ? 
          `<button class="btn btn-primary btn-new" id="btn-new">
            + Nuevo ${this.currentConfig.label_singular || ''}
          </button>` : ''
        }
      </div>
    `;

    // Búsqueda con debounce
    let searchTimeout;
    toolbar.querySelector('#search-input')?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.dataTable.searchQuery = e.target.value;
        this.dataTable.currentPage = 1;
        this.dataTable.load();
      }, 300);
    });

    // Botón nuevo
    toolbar.querySelector('#btn-new')?.addEventListener('click', () => this.openCreate());

    return toolbar;
  }

  // ──────────────────────────────────────────────
  //  CRUD OPERATIONS
  // ──────────────────────────────────────────────

  /** Abre modal para crear un nuevo registro */
  openCreate() {
    const modal = new Modal({
      title: `Nuevo ${this.currentConfig.label_singular || this.currentConfig.label}`,
      size: 'large'
    });
    
    const body = modal.open();
    
    const form = new DynamicForm(body, this.currentConfig, {
      mode: 'create',
      onSubmit: async (data) => {
        await this.handleCreate(data);
        modal.close();
      },
      onCancel: () => modal.close()
    });
    
    form.render();
  }

  /** Abre modal para editar un registro existente */
  openEdit(row) {
    const canEdit = this.currentConfig.permissions?.edit?.includes(auth.getRole());
    if (!canEdit) {
      Toast.warning('No tenés permisos para editar');
      return;
    }

    const modal = new Modal({
      title: `Editar ${this.currentConfig.label_singular || ''}`,
      size: 'large'
    });
    
    const body = modal.open();
    
    const form = new DynamicForm(body, this.currentConfig, {
      mode: 'edit',
      data: row,
      onSubmit: async (data) => {
        await this.handleUpdate(row.id, data);
        modal.close();
      },
      onCancel: () => modal.close()
    });
    
    form.render();
  }

  /** Crear registro → POST a PostgREST */
  async handleCreate(data) {
    try {
      // Agregar campos automáticos
      for (const field of this.currentConfig.fields) {
        if (field.auto === 'jwt.user_id') {
          data[field.name] = auth.getUserId();
        }
      }

      await api.post(`/${this.currentConfig.table}`, data);
      Toast.success(`${this.currentConfig.label_singular || 'Registro'} creado correctamente`);
      await this.dataTable.load();
    } catch (err) {
      Toast.error(`Error al crear: ${err.message}`);
    }
  }

  /** Actualizar registro → PATCH a PostgREST */
  async handleUpdate(id, data) {
    try {
      await api.patch(`/${this.currentConfig.table}?id=eq.${id}`, data);
      Toast.success(`${this.currentConfig.label_singular || 'Registro'} actualizado correctamente`);
      await this.dataTable.load();
    } catch (err) {
      Toast.error(`Error al actualizar: ${err.message}`);
    }
  }

  /** Eliminar registro → DELETE a PostgREST */
  async handleDelete(row) {
    const canDelete = this.currentConfig.permissions?.delete?.includes(auth.getRole());
    if (!canDelete) {
      Toast.warning('No tenés permisos para eliminar');
      return;
    }

    const confirmed = await Modal.confirm(
      `¿Eliminar "${row.nombre || row.id}"? Esta acción no se puede deshacer.`
    );
    
    if (!confirmed) return;

    try {
      await api.delete(`/${this.currentConfig.table}?id=eq.${row.id}`);
      Toast.success('Registro eliminado');
      await this.dataTable.load();
    } catch (err) {
      Toast.error(`Error al eliminar: ${err.message}`);
    }
  }

  // ──────────────────────────────────────────────
  //  LOGIN
  // ──────────────────────────────────────────────

  showLogin() {
    this.mainEl.innerHTML = `
      <div class="login-container">
        <form class="login-form" id="login-form">
          <h1>🔐 pgrest-admin</h1>
          <div class="form-field">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" required>
          </div>
          <div class="form-field">
            <label for="login-password">Contraseña</label>
            <input type="password" id="login-password" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Ingresar</button>
          <p class="login-error" id="login-error"></p>
        </form>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      
      try {
        await auth.login(email, password);
        this.init(); // Reiniciar con sesión
      } catch (err) {
        document.getElementById('login-error').textContent = err.message;
      }
    });
  }
}
```

## API Helper

```javascript
// api.js
const API_URL = window.API_URL || 'http://localhost:3000';

export const api = {
  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    
    const jwt = localStorage.getItem('jwt');
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    // Para que PostgREST devuelva el registro creado/actualizado
    if (method === 'POST' || method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }

    // Para obtener el count total
    if (method === 'GET') {
      headers['Prefer'] = 'count=exact';
    }

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.details || 'Error en la operación');
    }

    if (method === 'DELETE') return null;

    const data = await response.json();
    
    // Para GET, extraer count del header
    if (method === 'GET') {
      const contentRange = response.headers.get('Content-Range');
      const totalCount = contentRange ? parseInt(contentRange.split('/')[1]) : data.length;
      return { data, totalCount };
    }

    return data;
  },

  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  patch: (path, body) => api.request('PATCH', path, body),
  delete: (path) => api.request('DELETE', path)
};
```

## Auth Helper

```javascript
// auth.js
import { api } from './api.js';

export const auth = {
  /** Login via PostgREST RPC */
  async login(email, password) {
    const result = await api.post('/rpc/login', { p_email: email, p_password: password });
    const token = result[0]?.token || result;
    
    // Decodificar JWT (sin verificar, solo para leer claims)
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    localStorage.setItem('jwt', token);
    localStorage.setItem('user', JSON.stringify(payload));
    
    return payload;
  },

  logout() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
    window.location.reload();
  },

  isLoggedIn() {
    const jwt = localStorage.getItem('jwt');
    if (!jwt) return false;
    
    // Verificar expiración
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]));
      return payload.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  },

  getRole() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.role || 'web_anon';
  },

  getUserId() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.user_id;
  },

  getUserName() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.nombre || user.email;
  }
};
```

## Flujo Completo

```
1. Usuario abre la app
   └── Engine.init()
       ├── ¿Logueado? → No → showLogin()
       └── ¿Logueado? → Sí
           ├── loadIndex() → Carga entities/index.yaml
           │   └── renderSidebar() → Menú lateral con links
           └── navigate('proyecto')
               ├── loadEntityConfig('proyecto') → Carga entities/proyecto.yaml
               ├── renderToolbar() → Búsqueda + Botón Nuevo
               └── DataTable.load() → GET /proyectos → Renderiza tabla

2. Usuario hace click en "Nuevo Proyecto"
   └── Engine.openCreate()
       └── Modal + DynamicForm
           ├── Renderiza campos del YAML
           ├── Carga selects independientes (departamento, estado)
           └── Al seleccionar departamento → recarga municipios

3. Usuario guarda el formulario
   └── DynamicForm.handleSubmit()
       ├── Valida todos los campos
       ├── Arma payload JSON con IDs
       └── Engine.handleCreate(payload)
           ├── api.post('/proyectos', payload) → PostgREST → INSERT
           ├── Toast.success('Proyecto creado')
           └── DataTable.load() → Recarga tabla

4. Usuario hace click en editar
   └── Engine.openEdit(row)
       └── Modal + DynamicForm (mode: 'edit', data: row)
           ├── Campos pre-llenados
           ├── Selects cargados con valores actuales
           └── Submit → PATCH /proyectos?id=eq.42
```
