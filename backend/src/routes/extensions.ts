import { FastifyInstance, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ExtensionManager } from '../extensions/ExtensionManager';
import { ToolRegistry } from '../engine/ToolRegistry';
import { z } from 'zod';

// SEC-007: Zod schemas for input validation
const CreateExtensionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  version: z.string().max(50).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  package_name: z.string().max(200).optional(),
});

const ExtensionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export async function extensionRoutes(app: FastifyInstance) {
  app.get('/extensions', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM extensions WHERE user_id = ? ORDER BY created_at DESC', [request.user!.id]);
    return reply.send({ data: rows });
  });

  app.get('/extensions/tools', { preHandler: [authenticate] }, async (_request: AuthRequest, reply: FastifyReply) => {
    const tools = ToolRegistry.listNames().map((name) => {
      const tool = ToolRegistry.get(name);
      return {
        name,
        displayName: tool?.name || name,
        description: tool?.description || '',
      };
    });
    return reply.send({ data: tools });
  });

  app.post('/extensions', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const parsed = CreateExtensionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { name, description, version, enabled, config, package_name } = parsed.data;
    const db = await getDb();
    const id = uuidv4();
    await db.run(
      'INSERT INTO extensions (id, user_id, name, description, version, enabled, config, package_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, request.user!.id, name, description || '', version || '1.0.0', enabled ? 1 : 0, typeof config === 'string' ? config : JSON.stringify(config || {}), package_name || name]
    );
    const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
    return reply.status(201).send(row);
  });

  app.delete('/extensions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = ExtensionIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const db = await getDb();
    const ext = await db.get('SELECT * FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!ext) return reply.status(404).send({ error: 'Extension not found' });

    // Uninstall from isolated directory and unregister tools
    if (ext.package_name) {
      await ExtensionManager.uninstallExtension(id, ext.package_name);
    }

    await db.run('DELETE FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });

  app.post('/extensions/:id/install', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = ExtensionIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const db = await getDb();
    const ext = await db.get('SELECT * FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!ext) return reply.status(404).send({ error: 'Extension not found' });

    const packageName = ext.package_name || ext.name;
    const targetVersion = ext.version || 'latest';

    const result = await ExtensionManager.installExtension(id, packageName, targetVersion);

    if (!result.success) {
      return reply.status(500).send({
        error: 'Install failed',
        detail: result.error,
      });
    }

    await db.run(
      'UPDATE extensions SET install_path = ?, installed_version = ?, exports = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [result.installPath, result.installedVersion, JSON.stringify(result.exports || []), id]
    );

    const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
    return reply.send({ success: true, data: row });
  });

  app.post('/extensions/:id/uninstall', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = ExtensionIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const db = await getDb();
    const ext = await db.get('SELECT * FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!ext) return reply.status(404).send({ error: 'Extension not found' });

    const packageName = ext.package_name || ext.name;

    const result = await ExtensionManager.uninstallExtension(id, packageName);

    if (!result.success) {
      return reply.status(500).send({
        error: 'Uninstall failed',
        detail: result.error,
      });
    }

    await db.run(
      'UPDATE extensions SET install_path = NULL, installed_version = NULL, exports = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify([]), id]
    );

    const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
    return reply.send({ success: true, data: row });
  });
}
