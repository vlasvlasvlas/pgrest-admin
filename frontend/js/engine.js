import { api } from './api.js';
import { auth } from './auth.js';
import { DataTable } from './components/data-table.js';
import { DynamicForm } from './components/form.js';
import { Modal } from './components/modal.js';
import { Toast } from './components/toast.js';

export class Engine {
  constructor() {
    this.entityCache = new Map();
    this.menuItems = [];

    this.currentEntity = null;
    this.currentConfig = null;
    this.dataTable = null;

    this.entityRoot = '/entities';

    this.appEl = document.getElementById('app');
    this.sidebarEl = document.getElementById('sidebar');
    this.headerEl = document.getElementById('header-title');
    this.mainEl = document.getElementById('main-content');
    this.loginRootEl = document.getElementById('login-root');
    this.userBadgeEl = document.getElementById('user-badge');

    const logoutBtn = document.getElementById('btn-logout');
    logoutBtn?.addEventListener('click', () => {
      auth.logout();
      this.init();
    });
  }

  async init() {
    if (!window.jsyaml) {
      throw new Error('Falta cargar js-yaml para parsear entidades.');
    }

    if (!auth.isLoggedIn()) {
      this.hideApp();
      this.showLogin();
      return;
    }

    this.showApp();
    this.loginRootEl.innerHTML = '';
    this.userBadgeEl.textContent = `${auth.getUserName()} (${auth.getRole()})`;

    await this.loadIndex();

    const firstEntity = this.menuItems[0]?.name;
    if (firstEntity) {
      await this.navigate(firstEntity);
    } else {
      this.mainEl.textContent = 'No hay entidades visibles para el rol actual.';
    }
  }

  hideApp() {
    this.appEl.classList.add('hidden');
  }

  showApp() {
    this.appEl.classList.remove('hidden');
  }

  showLogin() {
    this.loginRootEl.innerHTML = '';

    const page = document.createElement('div');
    page.className = 'login-page';

    const card = document.createElement('div');
    card.className = 'login-card';

    const title = document.createElement('h1');
    title.textContent = 'pgrest-admin';

    const form = document.createElement('form');

    const emailWrapper = this.buildLoginField('Email', 'email', 'email');
    const passwordWrapper = this.buildLoginField('Contrasena', 'password', 'password');

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary';
    submit.textContent = 'Ingresar';

    const error = document.createElement('p');
    error.className = 'login-error';

    form.appendChild(emailWrapper);
    form.appendChild(passwordWrapper);
    form.appendChild(submit);
    form.appendChild(error);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';

      const email = form.elements.email.value;
      const password = form.elements.password.value;

      try {
        await auth.login(email, password);
        Toast.success('Sesion iniciada');
        await this.init();
      } catch (err) {
        error.textContent = err.message;
      }
    });

    card.appendChild(title);
    card.appendChild(form);
    page.appendChild(card);
    this.loginRootEl.appendChild(page);
  }

  buildLoginField(labelText, name, type) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.htmlFor = `login-${name}`;

    const input = document.createElement('input');
    input.className = 'field-input';
    input.id = `login-${name}`;
    input.name = name;
    input.type = type;
    input.required = true;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  async loadIndex() {
    const response = await fetch(`${this.entityRoot}/index.yaml`);
    const yamlText = await response.text();
    const parsed = window.jsyaml.load(yamlText);

    const role = auth.getRole();
    this.menuItems = (parsed.entities || []).filter((item) => {
      if (!item.roles) {
        return true;
      }
      return item.roles.includes(role);
    });

    this.renderSidebar();
  }

  renderSidebar() {
    this.sidebarEl.innerHTML = '';

    const grouped = {};
    for (const item of this.menuItems) {
      const group = item.group || 'General';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(item);
    }

    for (const [groupName, items] of Object.entries(grouped)) {
      const groupEl = document.createElement('div');
      groupEl.className = 'sidebar-group';

      const title = document.createElement('h3');
      title.className = 'sidebar-group-title';
      title.textContent = groupName;
      groupEl.appendChild(title);

      for (const item of items) {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'sidebar-item';
        link.dataset.entity = item.name;
        link.textContent = item.label || item.name;
        link.addEventListener('click', async (event) => {
          event.preventDefault();
          await this.navigate(item.name);
        });
        groupEl.appendChild(link);
      }

      this.sidebarEl.appendChild(groupEl);
    }
  }

  async navigate(entityName) {
    this.currentEntity = entityName;
    this.currentConfig = await this.loadEntityConfig(entityName);

    this.sidebarEl.querySelectorAll('.sidebar-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.entity === entityName);
    });

    this.headerEl.textContent = this.currentConfig.label || entityName;

    this.mainEl.innerHTML = '';
    this.mainEl.appendChild(this.renderToolbar());

    const tableContainer = document.createElement('div');
    this.mainEl.appendChild(tableContainer);

    this.dataTable = new DataTable(tableContainer, this.currentConfig, {
      onEdit: (row) => this.openEdit(row),
      onDelete: (row) => this.handleDelete(row),
      canEdit: this.can('edit'),
      canDelete: this.can('delete')
    });

    await this.dataTable.load();
  }

  async loadEntityConfig(entityName) {
    if (this.entityCache.has(entityName)) {
      return this.entityCache.get(entityName);
    }

    const response = await fetch(`${this.entityRoot}/${entityName}.yaml`);
    const yamlText = await response.text();
    const config = window.jsyaml.load(yamlText);

    this.entityCache.set(entityName, config);
    return config;
  }

  can(action) {
    const allowedRoles = this.currentConfig.permissions?.[action];
    if (!allowedRoles) {
      return true;
    }
    return allowedRoles.includes(auth.getRole());
  }

  renderToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    const left = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'search-input';
    search.placeholder = 'Buscar...';

    let timeout;
    search.addEventListener('input', (event) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.dataTable.searchQuery = event.target.value.trim();
        this.dataTable.currentPage = 1;
        this.dataTable.load();
      }, 300);
    });

    left.appendChild(search);

    const right = document.createElement('div');
    if (this.can('create')) {
      const createButton = document.createElement('button');
      createButton.type = 'button';
      createButton.className = 'btn btn-primary';
      createButton.textContent = `Nuevo ${this.currentConfig.label_singular || 'Registro'}`;
      createButton.addEventListener('click', () => this.openCreate());
      right.appendChild(createButton);
    }

    toolbar.appendChild(left);
    toolbar.appendChild(right);
    return toolbar;
  }

  openCreate() {
    if (!this.can('create')) {
      Toast.warning('No tiene permisos para crear.');
      return;
    }

    const modal = new Modal({
      title: `Nuevo ${this.currentConfig.label_singular || 'Registro'}`,
      size: 'large'
    });
    const body = modal.open();

    const form = new DynamicForm(body, this.currentConfig, {
      mode: 'create',
      autoValues: {
        'jwt.user_id': auth.getUserId()
      },
      onSubmit: async (payload) => {
        await this.handleCreate(payload);
        modal.close();
      },
      onCancel: () => modal.close()
    });

    form.render();
  }

  openEdit(row) {
    if (!this.can('edit')) {
      Toast.warning('No tiene permisos para editar.');
      return;
    }

    const modal = new Modal({
      title: `Editar ${this.currentConfig.label_singular || 'Registro'}`,
      size: 'large'
    });
    const body = modal.open();

    const form = new DynamicForm(body, this.currentConfig, {
      mode: 'edit',
      data: row,
      autoValues: {
        'jwt.user_id': auth.getUserId()
      },
      onSubmit: async (payload) => {
        await this.handleUpdate(row.id, payload);
        modal.close();
      },
      onCancel: () => modal.close()
    });

    form.render();
  }

  async handleCreate(payload) {
    try {
      await api.post(`/${this.currentConfig.table}`, payload);
      Toast.success('Registro creado correctamente.');
      await this.dataTable.load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  async handleUpdate(id, payload) {
    try {
      await api.patch(`/${this.currentConfig.table}?id=eq.${id}`, payload);
      Toast.success('Registro actualizado correctamente.');
      await this.dataTable.load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  async handleDelete(row) {
    if (!this.can('delete')) {
      Toast.warning('No tiene permisos para eliminar.');
      return;
    }

    const confirm = await Modal.confirm(`Eliminar "${row.nombre || row.id}"? Esta accion no se puede deshacer.`);
    if (!confirm) {
      return;
    }

    try {
      await api.delete(`/${this.currentConfig.table}?id=eq.${row.id}`);
      Toast.success('Registro eliminado.');
      await this.dataTable.load();
    } catch (err) {
      Toast.error(err.message);
    }
  }
}
