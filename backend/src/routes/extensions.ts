import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

export async function extensionRoutes(app: FastifyInstance) {
  app.get('/extensions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM extensions WHERE user_id = ? ORDER BY created_at DESC', [request.user!.id]);
    return reply.send({ data: rows });
  });

  app.post('/extensions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, description, version, enabled, config } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Name required' });
    const db = await getDb();
    const id = uuidv4();
    await db.run(
      'INSERT INTO extensions (id, user_id, name, description, version, enabled, config) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, request.user!.id, name, description || '', version || '1.0.0', enabled ? 1 : 0, typeof config === 'string' ? config : JSON.stringify(config || {})]
    );
    const row = await db.get('SELECT * FROM extensions WHERE id = ?', [id]);
    return reply.status(201).send(row);
  });

  app.delete('/extensions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    await db.run('DELETE FROM extensions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });
}
