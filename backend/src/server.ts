import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getDb } from './db';
import { authRoutes } from './routes/auth';
import { sessionRoutes } from './routes/sessions';
import { workflowRoutes } from './routes/workflows';
import { agentConfigRoutes } from './routes/agent-config';
import { extensionRoutes } from './routes/extensions';
import { settingsRoutes } from './routes/settings';
import { globalVariableRoutes } from './routes/global-variables';
import { nodeRoutes } from './routes/nodes';
import { templateRoutes } from './routes/templates';
import { executionRoutes } from './routes/executions';
import { startWebSocketServer } from './websocket/server';
import { startCleanupCron } from './cron/cleanup';

export async function buildServer() {
  const app = Fastify({ logger: false });

  // SEC-012: Security headers via helmet
  await app.register(helmet);

  // SEC-003: CORS tightened — only allow configured origins
  await app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim()),
    credentials: true,
  });

  // SEC-009: Global rate limit
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await getDb();

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(workflowRoutes, { prefix: '/api' });
  await app.register(templateRoutes, { prefix: '/api' });
  await app.register(agentConfigRoutes, { prefix: '/api' });
  await app.register(extensionRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(globalVariableRoutes, { prefix: '/api' });
  await app.register(nodeRoutes, { prefix: '/api' });
  await app.register(executionRoutes, { prefix: '/api' });

  app.get('/health', async () => ({ status: 'ok' }));

  // SEC-008: Global error handler — prevents stack trace leakage
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { validation?: unknown };
    if (err.validation) {
      return reply.status(400).send({ error: 'Invalid input', details: err.message });
    }
    console.error('[ERROR]', err);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  // Start WebSocket server (port 3001)
  startWebSocketServer(3001);

  // Start daily cleanup cron
  startCleanupCron();

  return app;
}
