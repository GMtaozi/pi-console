import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';
import { ExecutionError } from '../ExecutionError';

export interface HTTPNodeConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}

// Blocked hosts/patterns for SSRF prevention
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);
const BLOCKED_IP_PREFIXES = ['10.', '172.', '192.168.', '169.254.', '127.', '0.'];

function isBlockedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return true;
    }
    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(hostname)) {
      return true;
    }
    for (const prefix of BLOCKED_IP_PREFIXES) {
      if (hostname.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

export class HTTPNodeExecutor implements NodeExecutor {
  type = 'http';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: HTTPNodeConfig = node.data || {};
    const method = (config.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

    // Resolve variables in URL
    let url = config.url || inputs.url || '';
    if ('resolveVariables' in context && typeof (context as any).resolveVariables === 'function') {
      url = (context as any).resolveVariables(url);
    }

    if (!url) {
      throw new ExecutionError('HTTP node requires a URL', { nodeId: node.id });
    }

    // SSRF protection: block non-http(s) protocols and internal addresses
    if (isBlockedUrl(url)) {
      throw new ExecutionError(
        `HTTP request to '${url}' is blocked for security reasons (SSRF protection)`,
        { nodeId: node.id }
      );
    }

    // Resolve variables in headers
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        headers[key] = 'resolveVariables' in context && typeof (context as any).resolveVariables === 'function'
          ? (context as any).resolveVariables(String(value))
          : String(value);
      }
    }

    // Resolve variables in body
    let body: string | undefined;
    if (config.body) {
      body = 'resolveVariables' in context && typeof (context as any).resolveVariables === 'function'
        ? (context as any).resolveVariables(config.body)
        : config.body;
    } else if (inputs.body) {
      body = typeof inputs.body === 'string' ? inputs.body : JSON.stringify(inputs.body);
    }

    const fetchInit: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      fetchInit.body = body;
    }

    try {
      const response = await fetch(url, { ...fetchInit, redirect: 'manual' });
      const contentType = response.headers.get('content-type') || '';
      let responseBody: any;

      if (contentType.includes('application/json')) {
        responseBody = await response.json().catch(() => null);
      } else {
        responseBody = await response.text();
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
        headers: responseHeaders,
        ok: response.ok,
      };
    } catch (err: any) {
      throw new ExecutionError(`HTTP request failed: ${err.message || String(err)}`, { nodeId: node.id });
    }
  }
}
