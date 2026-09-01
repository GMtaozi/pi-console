import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate, AuthRequest } from '../middleware/auth';
import { NodeRegistry } from '../engine/NodeRegistry';
import { ensureBuiltInNodesRegistered } from '../engine/executeWorkflow';

export async function nodeRoutes(app: FastifyInstance) {
  // GET /api/nodes - Discover all registered nodes
  app.get('/nodes', { preHandler: [authenticate] }, async (_request: AuthRequest, reply: FastifyReply) => {
    ensureBuiltInNodesRegistered();
    const nodes = NodeRegistry.discover().map((meta) => ({
      type: meta.type,
      label: meta.label,
      category: meta.category,
      description: meta.description,
      icon: meta.icon,
      inputs: meta.inputs,
      outputs: meta.outputs,
      configSchema: meta.configSchema,
      defaultConfig: meta.defaultConfig,
    }));
    return reply.send({ nodes });
  });

  // GET /api/nodes/:type - Get metadata for a specific node type
  app.get('/nodes/:type', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    ensureBuiltInNodesRegistered();
    const { type } = request.params as any;
    const meta = NodeRegistry.getMetadata(type);
    if (!meta) {
      return reply.status(404).send({ error: `Node type '${type}' not found` });
    }
    return reply.send({
      type: meta.type,
      label: meta.label,
      category: meta.category,
      description: meta.description,
      icon: meta.icon,
      inputs: meta.inputs,
      outputs: meta.outputs,
      configSchema: meta.configSchema,
      defaultConfig: meta.defaultConfig,
    });
  });

  // GET /api/nodes/registry - Alias for /api/nodes
  app.get('/nodes/registry', { preHandler: [authenticate] }, async (_request: AuthRequest, reply: FastifyReply) => {
    ensureBuiltInNodesRegistered();
    const nodes = NodeRegistry.discover().map((meta) => ({
      type: meta.type,
      label: meta.label,
      category: meta.category,
      description: meta.description,
      icon: meta.icon,
      inputs: meta.inputs,
      outputs: meta.outputs,
      configSchema: meta.configSchema,
      defaultConfig: meta.defaultConfig,
    }));
    return reply.send({ nodes });
  });
}
