export class Modal {
  constructor({ title = '', size = 'large', onClose = () => {} } = {}) {
    this.title = title;
    this.size = size;
    this.onClose = onClose;
    this.element = null;
  }

  open() {
    this.element = document.createElement('div');
    this.element.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = `modal ${this.size === 'small' ? 'small' : ''}`;

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = this.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.type = 'button';
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    modal.appendChild(header);
    modal.appendChild(body);

    this.element.appendChild(modal);
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) {
        this.close();
      }
    });

    document.body.appendChild(this.element);
    return body;
  }

  close() {
    if (!this.element) {
      return;
    }
    this.element.remove();
    this.element = null;
    this.onClose();
  }

  static confirm(message) {
    return new Promise((resolve) => {
      const modal = new Modal({ title: 'Confirmar', size: 'small' });
      const body = modal.open();

      const text = document.createElement('p');
      text.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'form-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.addEventListener('click', () => {
        modal.close();
        resolve(false);
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn-danger';
      confirmBtn.type = 'button';
      confirmBtn.textContent = 'Eliminar';
      confirmBtn.addEventListener('click', () => {
        modal.close();
        resolve(true);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      body.appendChild(text);
      body.appendChild(actions);
    });
  }
}
