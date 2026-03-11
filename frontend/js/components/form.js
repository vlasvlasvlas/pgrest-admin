import { api } from '../api.js';

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

export class DynamicForm {
  constructor(container, entityConfig, options = {}) {
    this.container = container;
    this.config = entityConfig;
    this.mode = options.mode || 'create';
    this.initialData = options.data || {};
    this.onSubmit = options.onSubmit || (async () => {});
    this.onCancel = options.onCancel || (() => {});
    this.autoValues = options.autoValues || {};

    this.state = { ...this.initialData };
    this.inputs = new Map();
    this.errors = new Map();
    this.dependents = new Map();
    this.fields = this.config.fields || [];

    for (const field of this.fields) {
      if (field.type === 'hidden' && field.auto && this.autoValues[field.auto] !== undefined) {
        this.state[field.name] = this.autoValues[field.auto];
      }
      if (this.state[field.name] === undefined && field.default !== undefined) {
        this.state[field.name] = field.default;
      }
    }
  }

  async render() {
    this.container.innerHTML = '';

    const form = document.createElement('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.handleSubmit();
    });

    const grid = document.createElement('div');
    grid.className = 'form-grid';

    for (const fieldConfig of this.fields) {
      if (fieldConfig.type === 'hidden') {
        continue;
      }

      if (fieldConfig.depends_on) {
        const arr = this.dependents.get(fieldConfig.depends_on) || [];
        arr.push(fieldConfig.name);
        this.dependents.set(fieldConfig.depends_on, arr);
      }

      const wrapper = document.createElement('div');
      wrapper.className = `field ${fieldConfig.type === 'textarea' ? 'full' : ''}`;

      const label = document.createElement('label');
      label.htmlFor = fieldConfig.name;
      label.textContent = fieldConfig.label || fieldConfig.name;
      if (fieldConfig.required) {
        label.textContent = `${label.textContent} *`;
      }

      const input = this.createInput(fieldConfig);
      input.id = fieldConfig.name;
      input.name = fieldConfig.name;

      this.setInputValue(input, fieldConfig, this.state[fieldConfig.name]);

      input.addEventListener('change', async () => {
        this.state[fieldConfig.name] = this.getInputValue(input, fieldConfig);
        await this.refreshDependents(fieldConfig.name);
      });

      if (fieldConfig.type !== 'select' && fieldConfig.type !== 'select_distinct') {
        input.addEventListener('input', () => {
          this.state[fieldConfig.name] = this.getInputValue(input, fieldConfig);
        });
      }

      const error = document.createElement('span');
      error.className = 'field-error';

      this.inputs.set(fieldConfig.name, input);
      this.errors.set(fieldConfig.name, error);

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      wrapper.appendChild(error);
      grid.appendChild(wrapper);
    }

    const actions = document.createElement('div');
    actions.className = 'form-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => this.onCancel());

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = this.mode === 'create' ? 'Crear' : 'Guardar';

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);

    form.appendChild(grid);
    form.appendChild(actions);
    this.container.appendChild(form);

    await this.initializeSelects();
  }

  createInput(fieldConfig) {
    if (fieldConfig.type === 'textarea') {
      const textarea = document.createElement('textarea');
      textarea.className = 'field-textarea';
      textarea.rows = fieldConfig.rows || 3;
      if (fieldConfig.max_length) textarea.maxLength = fieldConfig.max_length;
      if (fieldConfig.min_length) textarea.minLength = fieldConfig.min_length;
      if (fieldConfig.placeholder) textarea.placeholder = fieldConfig.placeholder;
      if (fieldConfig.required) textarea.required = true;
      return textarea;
    }

    if (fieldConfig.type === 'select' || fieldConfig.type === 'select_distinct') {
      const select = document.createElement('select');
      select.className = 'field-select';
      if (fieldConfig.required) select.required = true;
      return select;
    }

    if (fieldConfig.type === 'boolean') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'field-input';
      return checkbox;
    }

    const input = document.createElement('input');
    input.className = 'field-input';

    const typeMap = {
      integer: 'number',
      decimal: 'number',
      date: 'date',
      datetime: 'datetime-local',
      email: 'email',
      url: 'url',
      text: 'text'
    };

    input.type = typeMap[fieldConfig.type] || 'text';
    if (fieldConfig.required) input.required = true;
    if (fieldConfig.min !== undefined) input.min = String(fieldConfig.min);
    if (fieldConfig.max !== undefined) input.max = String(fieldConfig.max);
    if (fieldConfig.step !== undefined) input.step = String(fieldConfig.step);
    if (fieldConfig.max_length !== undefined) input.maxLength = fieldConfig.max_length;
    if (fieldConfig.min_length !== undefined) input.minLength = fieldConfig.min_length;
    if (fieldConfig.pattern) input.pattern = fieldConfig.pattern;
    if (fieldConfig.placeholder) input.placeholder = fieldConfig.placeholder;

    return input;
  }

  setInputValue(input, fieldConfig, value) {
    if (fieldConfig.type === 'boolean') {
      input.checked = Boolean(value);
      return;
    }

    if (isEmpty(value)) {
      input.value = '';
      return;
    }

    input.value = String(value);
  }

  getInputValue(input, fieldConfig) {
    if (fieldConfig.type === 'boolean') {
      return Boolean(input.checked);
    }

    if (fieldConfig.type === 'integer') {
      return input.value === '' ? null : Number.parseInt(input.value, 10);
    }

    if (fieldConfig.type === 'decimal') {
      return input.value === '' ? null : Number.parseFloat(input.value);
    }

    if (fieldConfig.type === 'select' || fieldConfig.type === 'select_distinct') {
      if (input.value === '') {
        return null;
      }
      if (/^-?\d+(\.\d+)?$/.test(input.value)) {
        return Number(input.value);
      }
      return input.value;
    }

    return input.value === '' ? null : input.value;
  }

  async initializeSelects() {
    for (const fieldConfig of this.fields) {
      if (fieldConfig.type !== 'select' && fieldConfig.type !== 'select_distinct') {
        continue;
      }

      const parentValue = fieldConfig.depends_on ? this.state[fieldConfig.depends_on] : null;
      await this.loadSelectOptions(fieldConfig, parentValue);
    }
  }

  async loadSelectOptions(fieldConfig, parentValue) {
    const input = this.inputs.get(fieldConfig.name);
    if (!input) {
      return;
    }

    input.innerHTML = '';

    if (fieldConfig.depends_on && isEmpty(parentValue)) {
      input.disabled = true;
      const option = document.createElement('option');
      option.value = '';
      option.textContent = `Seleccione primero ${fieldConfig.depends_on}`;
      input.appendChild(option);
      this.state[fieldConfig.name] = null;
      return;
    }

    input.disabled = false;

    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = '-- Seleccione --';
    input.appendChild(firstOption);

    let options = [];

    if (Array.isArray(fieldConfig.options)) {
      options = fieldConfig.options;
    } else if (fieldConfig.source?.endpoint) {
      const endpoint = fieldConfig.source.endpoint.replace(/\{([^}]+)\}/g, (_, name) => {
        const raw = this.state[name];
        return encodeURIComponent(raw ?? '');
      });
      const { data } = await api.get(endpoint);
      options = data.map((row) => ({
        value: row[fieldConfig.source.value_field],
        label: row[fieldConfig.source.display_field]
      }));
    }

    for (const optionData of options) {
      const option = document.createElement('option');
      option.value = String(optionData.value);
      option.textContent = optionData.label;
      input.appendChild(option);
    }

    let desiredValue = this.state[fieldConfig.name];
    if (isEmpty(desiredValue) && fieldConfig.default !== undefined) {
      desiredValue = fieldConfig.default;
    }

    if (!isEmpty(desiredValue)) {
      input.value = String(desiredValue);
      if (input.value === String(desiredValue)) {
        this.state[fieldConfig.name] = this.getInputValue(input, fieldConfig);
      }
    }
  }

  async refreshDependents(parentName) {
    const children = this.dependents.get(parentName) || [];

    for (const childName of children) {
      const childConfig = this.fields.find((field) => field.name === childName);
      if (!childConfig) {
        continue;
      }

      this.state[childName] = null;
      await this.loadSelectOptions(childConfig, this.state[parentName]);
      await this.refreshDependents(childName);
    }
  }

  clearError(fieldName) {
    const errorEl = this.errors.get(fieldName);
    const inputEl = this.inputs.get(fieldName);
    if (!errorEl || !inputEl) {
      return;
    }
    errorEl.textContent = '';
    inputEl.classList.remove('invalid');
  }

  setError(fieldName, message) {
    const errorEl = this.errors.get(fieldName);
    const inputEl = this.inputs.get(fieldName);
    if (!errorEl || !inputEl) {
      return;
    }
    errorEl.textContent = message;
    inputEl.classList.add('invalid');
  }

  validateField(fieldConfig) {
    if (fieldConfig.type === 'hidden') {
      return true;
    }

    const value = this.state[fieldConfig.name];
    this.clearError(fieldConfig.name);

    if (fieldConfig.required && isEmpty(value)) {
      this.setError(fieldConfig.name, 'Campo obligatorio');
      return false;
    }

    if (isEmpty(value)) {
      return true;
    }

    if (fieldConfig.max_length && String(value).length > fieldConfig.max_length) {
      this.setError(fieldConfig.name, `Maximo ${fieldConfig.max_length} caracteres`);
      return false;
    }

    if (fieldConfig.min_length && String(value).length < fieldConfig.min_length) {
      this.setError(fieldConfig.name, `Minimo ${fieldConfig.min_length} caracteres`);
      return false;
    }

    if (fieldConfig.pattern) {
      const regex = new RegExp(fieldConfig.pattern);
      if (!regex.test(String(value))) {
        this.setError(fieldConfig.name, 'Formato invalido');
        return false;
      }
    }

    if (fieldConfig.type === 'integer' || fieldConfig.type === 'decimal') {
      if (fieldConfig.min !== undefined && Number(value) < Number(fieldConfig.min)) {
        this.setError(fieldConfig.name, `El minimo es ${fieldConfig.min}`);
        return false;
      }
      if (fieldConfig.max !== undefined && Number(value) > Number(fieldConfig.max)) {
        this.setError(fieldConfig.name, `El maximo es ${fieldConfig.max}`);
        return false;
      }
    }

    if (fieldConfig.validate?.gte_field) {
      const other = this.state[fieldConfig.validate.gte_field];
      if (!isEmpty(other) && value < other) {
        this.setError(fieldConfig.name, fieldConfig.validate.message || 'Valor fuera de rango');
        return false;
      }
    }

    if (fieldConfig.validate?.lte_field) {
      const other = this.state[fieldConfig.validate.lte_field];
      if (!isEmpty(other) && value > other) {
        this.setError(fieldConfig.name, fieldConfig.validate.message || 'Valor fuera de rango');
        return false;
      }
    }

    return true;
  }

  buildPayload() {
    const payload = {};

    for (const fieldConfig of this.fields) {
      if (fieldConfig.type === 'hidden') {
        if (
          this.mode === 'create' &&
          fieldConfig.auto &&
          this.autoValues[fieldConfig.auto] !== undefined
        ) {
          payload[fieldConfig.name] = this.autoValues[fieldConfig.auto];
        } else if (!isEmpty(this.state[fieldConfig.name])) {
          payload[fieldConfig.name] = this.state[fieldConfig.name];
        }
        continue;
      }

      const value = this.state[fieldConfig.name];
      if (!isEmpty(value) || typeof value === 'boolean') {
        payload[fieldConfig.name] = value;
      }
    }

    return payload;
  }

  async handleSubmit() {
    let valid = true;

    for (const fieldConfig of this.fields) {
      if (!this.validateField(fieldConfig)) {
        valid = false;
      }
    }

    if (!valid) {
      return;
    }

    const payload = this.buildPayload();
    await this.onSubmit(payload);
  }
}
