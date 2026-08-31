import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

interface GlobalVariableRow {
  id: string;
  user_id: string;
  key: string;
  value: string;
  type: string;
  environment: string;
  is_sensitive: number;
  description: string;
  created_at: string;
  updated_at: string;
}

interface GlobalVariableBody {
  key?: string;
  value?: string;
  type?: string;
  environment?: string;
  is_sensitive?: boolean;
  description?: string;
}

interface GlobalVariableQuery {
  environment?: string;
}

export async function globalVariableRoutes(app: FastifyInstance) {
  // List global variables for user (with environment filter)
  app.get('/global-variables', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { environment = 'development' } = request.query as GlobalVariableQuery;
    const db = await getDb();
    const rows = await db.query(
      'SELECT * FROM global_variables WHERE user_id = $1 AND environment = $2 ORDER BY key',
      [request.user!.id, environment]
    );
    // Mask sensitive values
    const sanitized = (rows.rows || []).map((row: GlobalVariableRow) => ({
      ...row,
      value: row.is_sensitive ? '****' : row.value,
    }));
    return reply.send({ data: sanitized });
  });

  // Get a single global variable
  app.get('/global-variables/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    const row = await db.query(
      'SELECT * FROM global_variables WHERE id = $1 AND user_id = $2',
      [id, request.user!.id]
    );
    if (!row.rows || row.rows.length === 0) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const data = row.rows[0];
    if (data.is_sensitive) {
      data.value = '****';
    }
    return reply.send(data);
  });

  // Create global variable
  app.post('/global-variables', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { key, value, type = 'string', environment = 'development', is_sensitive = false, description } = request.body as GlobalVariableBody;
    if (!key) return reply.status(400).send({ error: 'key is required' });

    const db = await getDb();
    const id = uuidv4();
    try {
      await db.query(
        `INSERT INTO global_variables (id, user_id, key, value, type, environment, is_sensitive, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, request.user!.id, key, String(value), type, environment, is_sensitive ? 1 : 0, description || '']
      );
      const row = await db.query('SELECT * FROM global_variables WHERE id = $1', [id]);
      return reply.status(201).send(row.rows[0]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('unique constraint')) {
        return reply.status(409).send({ error: `Variable '${key}' already exists in environment '${environment}'` });
      }
      throw err;
    }
  });

  // Update global variable
  app.put('/global-variables/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const { key, value, type, environment, is_sensitive, description } = request.body as GlobalVariableBody;
    const db = await getDb();

    const existing = await db.query(
      'SELECT * FROM global_variables WHERE id = $1 AND user_id = $2',
      [id, request.user!.id]
    );
    if (!existing.rows || existing.rows.length === 0) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (key !== undefined) { updates.push(`key = $${idx++}`); params.push(key); }
    if (value !== undefined) { updates.push(`value = $${idx++}`); params.push(String(value)); }
    if (type !== undefined) { updates.push(`type = $${idx++}`); params.push(type); }
    if (environment !== undefined) { updates.push(`environment = $${idx++}`); params.push(environment); }
    if (is_sensitive !== undefined) { updates.push(`is_sensitive = $${idx++}`); params.push(is_sensitive ? 1 : 0); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(id);
    await db.query(
      `UPDATE global_variables SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    );

    const row = await db.query('SELECT * FROM global_variables WHERE id = $1', [id]);
    return reply.send(row.rows[0]);
  });

  // Delete global variable
  app.delete('/global-variables/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    await db.query('DELETE FROM global_variables WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    return reply.send({ success: true });
  });
}
