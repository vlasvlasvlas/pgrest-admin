export class Toast {
  static show(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toast-container');
    if (!container) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  static info(message) {
    Toast.show(message, 'info');
  }

  static success(message) {
    Toast.show(message, 'success');
  }

  static warning(message) {
    Toast.show(message, 'warning');
  }

  static error(message) {
    Toast.show(message, 'error', 5000);
  }
}
