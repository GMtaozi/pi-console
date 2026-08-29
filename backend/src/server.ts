import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getDb } from './db';
import { authRoutes } from './routes/auth';
import { sessionRoutes } from './routes/sessions';
import { workflowRoutes } from './routes/workflows';
import { agentConfigRoutes } from './routes/agent-config';
import { extensionRoutes } from './routes/extensions';
import { settingsRoutes } from './routes/settings';
import { templateRoutes } from './routes/templates';

export async function buildServer() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await getDb();

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(workflowRoutes, { prefix: '/api' });
  await app.register(templateRoutes, { prefix: '/api' });
  await app.register(agentConfigRoutes, { prefix: '/api' });
  await app.register(extensionRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
