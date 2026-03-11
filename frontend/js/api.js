const API_URL = window.API_URL || 'http://localhost:3000';

function toAbsolutePath(path) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_URL}${path}`;
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };

  const token = localStorage.getItem('jwt');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (method === 'POST' || method === 'PATCH') {
    headers.Prefer = 'return=representation';
  }

  if (method === 'GET') {
    headers.Prefer = 'count=exact';
  }

  const response = await fetch(toAbsolutePath(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || errorData.details || 'Error de API');
  }

  if (method === 'DELETE') {
    return null;
  }

  const data = await response.json();

  if (method === 'GET') {
    const contentRange = response.headers.get('Content-Range');
    const totalCount = contentRange ? Number(contentRange.split('/')[1]) : Array.isArray(data) ? data.length : 0;
    return { data, totalCount };
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path)
};
