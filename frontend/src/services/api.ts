const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (username: string, email: string, password: string) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  },
  sessions: {
    list: (params?: { page?: number; limit?: number; search?: string; sort?: string; order?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request(`/sessions${qs}`);
    },
    get: (id: string) => request(`/sessions/${id}`),
    create: (title?: string) => request('/sessions', { method: 'POST', body: JSON.stringify({ title }) }),
    sendMessage: (id: string, role: string, content: string) =>
      request(`/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ role, content }) }),
    delete: (id: string) => request(`/sessions/${id}`, { method: 'DELETE' }),
  },
  workflows: {
    list: () => request('/workflows'),
    get: (id: string) => request(`/workflows/${id}`),
    create: (name: string, description?: string) =>
      request('/workflows', { method: 'POST', body: JSON.stringify({ name, description }) }),
    update: (id: string, data: any) => request(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/workflows/${id}`, { method: 'DELETE' }),
    execute: (id: string) => request(`/workflows/${id}/execute`, { method: 'POST' }),
    executions: (id: string) => request(`/workflows/${id}/executions`),
    execution: (id: string, eid: string) => request(`/workflows/${id}/executions/${eid}`),
    cancelExecution: (id: string, eid: string) =>
      request(`/workflows/${id}/executions/${eid}/cancel`, { method: 'POST' }),
  },
  agentConfig: {
    get: () => request('/agent-config'),
    update: (data: any) => request('/agent-config', { method: 'PUT', body: JSON.stringify(data) }),
  },
  extensions: {
    list: () => request('/extensions'),
    create: (data: any) => request('/extensions', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/extensions/${id}`, { method: 'DELETE' }),
  },
};
