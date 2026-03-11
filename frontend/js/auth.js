import { api } from './api.js';

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT invalido');
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

export const auth = {
  async login(email, password) {
    const rows = await api.post('/rpc/login', { p_email: email, p_password: password });
    const row = Array.isArray(rows) ? rows[0] : rows;

    if (!row || !row.token) {
      throw new Error('Respuesta de login invalida');
    }

    const payload = decodeJwt(row.token);

    localStorage.setItem('jwt', row.token);
    localStorage.setItem('user', JSON.stringify(row.user_data || payload));

    return payload;
  },

  logout() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('user');
  },

  isLoggedIn() {
    const token = localStorage.getItem('jwt');
    if (!token) {
      return false;
    }

    try {
      const payload = decodeJwt(token);
      return Number(payload.exp) > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  },

  getUser() {
    return JSON.parse(localStorage.getItem('user') || '{}');
  },

  getRole() {
    return auth.getUser().role || 'web_anon';
  },

  getUserId() {
    return auth.getUser().user_id || null;
  },

  getUserName() {
    const user = auth.getUser();
    return user.nombre || user.email || 'Usuario';
  }
};
