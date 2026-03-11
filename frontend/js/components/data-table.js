import { api } from '../api.js';

function getNestedValue(source, path) {
  if (!source || !path) {
    return null;
  }

  return path.split('.').reduce((acc, part) => {
    if (acc === null || acc === undefined) {
      return null;
    }
    return acc[part];
  }, source);
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return withTime
    ? date.toLocaleString('es-HN')
    : date.toLocaleDateString('es-HN');
}

function formatCurrency(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return new Intl.NumberFormat('es-HN', {
    style: 'currency',
    currency: 'HNL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
}

export class DataTable {
  constructor(container, entityConfig, options = {}) {
    this.container = container;
    this.config = entityConfig;

    this.onEdit = options.onEdit || (() => {});
    this.onDelete = options.onDelete || (() => {});
    this.canEdit = options.canEdit ?? true;
    this.canDelete = options.canDelete ?? true;

    this.currentPage = 1;
    this.pageSize = entityConfig.list?.page_size || 25;
    this.sortField = entityConfig.list?.default_sort || 'id.desc';
    this.searchQuery = '';

    this.data = [];
    this.totalCount = 0;
  }

  async load() {
    const query = this.buildQuery();
    const { data, totalCount } = await api.get(`/${this.config.table}?${query}`);
    this.data = data;
    this.totalCount = totalCount;
    this.render();
  }

  buildQuery() {
    const params = new URLSearchParams();

    params.set('select', this.buildSelect());
    params.set('order', this.sortField);
    params.set('limit', String(this.pageSize));
    params.set('offset', String((this.currentPage - 1) * this.pageSize));

    if (this.searchQuery && Array.isArray(this.config.list?.searchable) && this.config.list.searchable.length > 0) {
      const safeTerm = this.searchQuery.replace(/[(),]/g, ' ').trim();
      if (safeTerm) {
        const filters = this.config.list.searchable.map((field) => `${field}.ilike.*${safeTerm}*`);
        params.set('or', `(${filters.join(',')})`);
      }
    }

    return params.toString();
  }

  buildSelect() {
    const parts = ['*'];
    const seen = new Set(parts);

    for (const column of this.config.list?.columns || []) {
      if (column.embed && !seen.has(column.embed)) {
        parts.push(column.embed);
        seen.add(column.embed);
      } else if (!column.embed && column.display && column.display.includes('.')) {
        const [relation, field] = column.display.split('.');
        const inferred = `${relation}(${field})`;
        if (!seen.has(inferred)) {
          parts.push(inferred);
          seen.add(inferred);
        }
      }
    }

    return parts.join(',');
  }

  toggleSort(field) {
    const [activeField, direction = 'asc'] = this.sortField.split('.');
    if (activeField === field) {
      this.sortField = `${field}.${direction === 'asc' ? 'desc' : 'asc'}`;
    } else {
      this.sortField = `${field}.asc`;
    }
    this.currentPage = 1;
    this.load();
  }

  render() {
    this.container.innerHTML = '';

    if (!this.data.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No hay registros para mostrar.';
      this.container.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.appendChild(this.renderTable());

    this.container.appendChild(wrap);
    this.container.appendChild(this.renderPagination());
  }

  renderTable() {
    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    for (const column of this.config.list?.columns || []) {
      const th = document.createElement('th');
      th.textContent = column.header || column.field;
      th.style.width = column.width || 'auto';
      th.style.textAlign = column.align || 'left';
      th.addEventListener('click', () => this.toggleSort(column.field));
      headerRow.appendChild(th);
    }

    if (this.canEdit || this.canDelete) {
      const actionsTh = document.createElement('th');
      actionsTh.textContent = 'Acciones';
      actionsTh.style.width = '140px';
      headerRow.appendChild(actionsTh);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.data) {
      tbody.appendChild(this.renderRow(row));
    }

    table.appendChild(tbody);
    return table;
  }

  renderRow(row) {
    const tr = document.createElement('tr');

    for (const column of this.config.list?.columns || []) {
      tr.appendChild(this.renderCell(row, column));
    }

    if (this.canEdit || this.canDelete) {
      const actionsTd = document.createElement('td');
      actionsTd.className = 'actions-cell';

      if (this.canEdit) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-icon';
        editBtn.type = 'button';
        editBtn.textContent = 'Editar';
        editBtn.addEventListener('click', () => this.onEdit(row));
        actionsTd.appendChild(editBtn);
      }

      if (this.canDelete) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon';
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Eliminar';
        deleteBtn.addEventListener('click', () => this.onDelete(row));
        actionsTd.appendChild(deleteBtn);
      }

      tr.appendChild(actionsTd);
    }

    return tr;
  }

  renderCell(row, column) {
    const td = document.createElement('td');
    td.style.textAlign = column.align || 'left';

    const rawValue = column.display ? getNestedValue(row, column.display) : row[column.field];

    if (rawValue === null || rawValue === undefined || rawValue === '') {
      td.textContent = '-';
      return td;
    }

    if (column.badge) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(rawValue);

      const colorValue = column.color_field ? getNestedValue(row, column.color_field) : null;
      if (colorValue) {
        badge.style.backgroundColor = String(colorValue);
      }

      td.appendChild(badge);
      return td;
    }

    switch (column.format) {
      case 'currency':
        td.textContent = formatCurrency(rawValue);
        return td;
      case 'date':
        td.textContent = formatDate(rawValue, false);
        return td;
      case 'datetime':
        td.textContent = formatDate(rawValue, true);
        return td;
      default:
        td.textContent = String(rawValue);
        return td;
    }
  }

  renderPagination() {
    const pagination = document.createElement('div');
    pagination.className = 'pagination';

    const totalPages = Math.max(1, Math.ceil(this.totalCount / this.pageSize));

    const info = document.createElement('span');
    info.textContent = `Pagina ${this.currentPage} de ${totalPages}`;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-secondary';
    prevBtn.textContent = 'Anterior';
    prevBtn.disabled = this.currentPage <= 1;
    prevBtn.addEventListener('click', () => {
      this.currentPage -= 1;
      this.load();
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-secondary';
    nextBtn.textContent = 'Siguiente';
    nextBtn.disabled = this.currentPage >= totalPages;
    nextBtn.addEventListener('click', () => {
      this.currentPage += 1;
      this.load();
    });

    pagination.appendChild(info);
    pagination.appendChild(prevBtn);
    pagination.appendChild(nextBtn);

    return pagination;
  }
}
