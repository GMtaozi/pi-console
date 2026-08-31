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
    sendMessage: (id: string, role: string, content: string, stream = false) =>
      request(`/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ role, content, stream }) }),
    sendMessageStream: (id: string, role: string, content: string, onChunk: (chunk: string, done: boolean) => void, signal?: AbortSignal) => {
      return new Promise<void>((resolve, reject) => {
        fetch(`${API_BASE}/sessions/${id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ role, content, stream: true }),
          signal,
        }).then((res) => {
          if (!res.ok) {
            res.json().catch(() => ({})).then((err) => reject(new Error(err.error || `HTTP ${res.status}`)));
            return;
          }
          const reader = res.body?.getReader();
          if (!reader) {
            reject(new Error('No response body'));
            return;
          }
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          function pump(): Promise<void> {
            return reader!.read().then(({ done, value }) => {
              if (done) {
                resolve();
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const dataMatch = line.match(/^data: (.+)$/m);
                if (dataMatch) {
                  try {
                    const data = JSON.parse(dataMatch[1]);
                    if (data.error) {
                      reject(new Error(data.error));
                      return;
                    }
                    onChunk(data.chunk || '', data.done);
                    if (data.done) {
                      resolve();
                      return;
                    }
                  } catch {
                    // ignore
                  }
                }
              }
              return pump();
            });
          }
          pump().catch(reject);
        }).catch(reject);
      });
    },
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
    templates: (params?: { search?: string; tags?: string; category?: string; sort?: string; order?: string; scope?: string }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request(`/workflow-templates${qs}`);
    },
    template: (id: string) => request(`/workflow-templates/${id}`),
    createTemplate: (data: any) => request('/workflow-templates', { method: 'POST', body: JSON.stringify(data) }),
    updateTemplate: (id: string, data: any) => request(`/workflow-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTemplate: (id: string) => request(`/workflow-templates/${id}`, { method: 'DELETE' }),
    templateTags: () => request('/workflow-templates/tags'),
    fromTemplate: (templateId: string, name?: string) =>
      request(`/workflows/from-template/${templateId}`, { method: 'POST', body: JSON.stringify({ name }) }),
  },
  executions: {
    list: (workflowId: string, params?: { status?: string; startTime?: string; endTime?: string; page?: number; pageSize?: number }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
      return request(`/executions/${workflowId}${qs}`);
    },
    nodes: (executionId: string) => request(`/executions/${executionId}/nodes`),
    detail: (executionId: string) => request(`/executions/detail/${executionId}`),
    export: (workflowId: string, executionId: string, format: 'json' | 'markdown') =>
      fetch(`${API_BASE}/workflows/${workflowId}/executions/${executionId}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
  },
  agentConfig: {
    get: () => request('/agent-config'),
    update: (data: any) => request('/agent-config', { method: 'PUT', body: JSON.stringify(data) }),
    list: () => request('/agent-configs'),
    create: (data: any) => request('/agent-configs', { method: 'POST', body: JSON.stringify(data) }),
    updateById: (id: string, data: any) => request(`/agent-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/agent-configs/${id}`, { method: 'DELETE' }),
    setDefault: (id: string) => request(`/agent-configs/${id}/set-default`, { method: 'POST' }),
    test: (id?: string) => request('/agent-configs/test', { method: 'POST', body: JSON.stringify({ id }) }),
  },
  extensions: {
    list: () => request('/extensions'),
    create: (data: any) => request('/extensions', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/extensions/${id}`, { method: 'DELETE' }),
    install: (id: string) => request(`/extensions/${id}/install`, { method: 'POST' }),
    uninstall: (id: string) => request(`/extensions/${id}/uninstall`, { method: 'POST' }),
  },
  settings: {
    listEnvVars: (environment?: string) => {
      const qs = environment ? `?environment=${encodeURIComponent(environment)}` : '';
      return request(`/settings/env-vars${qs}`);
    },
    createEnvVar: (data: { key: string; value: string; description?: string; environment?: string }) =>
      request('/settings/env-vars', { method: 'POST', body: JSON.stringify(data) }),
    updateEnvVar: (id: string, data: { key?: string; value?: string; description?: string; environment?: string }) =>
      request(`/settings/env-vars/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEnvVar: (id: string) => request(`/settings/env-vars/${id}`, { method: 'DELETE' }),
  },
};
