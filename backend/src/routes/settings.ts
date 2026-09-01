import { FastifyInstance, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

export async function settingsRoutes(app: FastifyInstance) {
  // List all environment variables for current user
  app.get('/settings/env-vars', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const db = await getDb();
    const rows = await db.all('SELECT id, key, value, description, created_at, updated_at FROM environment_variables WHERE user_id = ? ORDER BY key ASC', [request.user!.id]);
    return reply.send({ data: rows });
  });

  // Create a new environment variable
  app.post('/settings/env-vars', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const { key, value, description } = request.body as any;
    if (!key || !value) {
      return reply.status(400).send({ error: 'Key and value are required' });
    }
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return reply.status(400).send({ error: 'Key cannot be empty' });
    }

    const db = await getDb();
    const id = uuidv4();
    try {
      await db.run('INSERT INTO environment_variables (id, user_id, key, value, description) VALUES (?, ?, ?, ?, ?)', [
        id, request.user!.id, trimmedKey, value, description || '',
      ]);
      const row = await db.get('SELECT * FROM environment_variables WHERE id = ?', [id]);
      return reply.status(201).send(row);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint failed') || err.message?.includes('duplicate key')) {
        return reply.status(409).send({ error: `Environment variable '${trimmedKey}' already exists` });
      }
      throw err;
    }
  });

  // Update an environment variable
  app.put('/settings/env-vars/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    const { key, value, description } = request.body as any;
    const db = await getDb();

    const existing = await db.get('SELECT * FROM environment_variables WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!existing) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const newKey = key !== undefined ? key.trim() : existing.key;
    const newValue = value !== undefined ? value : existing.value;
    const newDesc = description !== undefined ? description : existing.description;

    try {
      await db.run(
        'UPDATE environment_variables SET key = ?, value = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newKey, newValue, newDesc, id]
      );
      const row = await db.get('SELECT * FROM environment_variables WHERE id = ?', [id]);
      return reply.send(row);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint failed') || err.message?.includes('duplicate key')) {
        return reply.status(409).send({ error: `Environment variable '${newKey}' already exists` });
      }
      throw err;
    }
  });

  // Delete an environment variable
  app.delete('/settings/env-vars/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const existing = await db.get('SELECT * FROM environment_variables WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!existing) {
      return reply.status(404).send({ error: 'Not found' });
    }
    await db.run('DELETE FROM environment_variables WHERE id = ?', [id]);
    return reply.send({ success: true });
  });
}
