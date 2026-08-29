import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

export async function workflowRoutes(app: FastifyInstance) {
  app.get('/workflows', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC', [request.user!.id]);
    return reply.send({ data: rows });
  });

  app.post('/workflows', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, description } = request.body as any;
    const db = await getDb();
    const id = uuidv4();
    await db.run('INSERT INTO workflows (id, user_id, name, description) VALUES (?, ?, ?, ?)', [id, request.user!.id, name, description || '']);
    const wf = await db.get('SELECT * FROM workflows WHERE id = ?', [id]);
    return reply.status(201).send(wf);
  });

  app.get('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const wf = await db.get('SELECT * FROM workflows WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!wf) return reply.status(404).send({ error: 'Not found' });
    const nodes = await db.all('SELECT * FROM workflow_nodes WHERE workflow_id = ?', [id]);
    const edges = await db.all('SELECT * FROM workflow_edges WHERE workflow_id = ?', [id]);
    return reply.send({ ...wf, nodes, edges });
  });

  app.put('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const { name, description, status, nodes, edges } = request.body as any;
    const db = await getDb();
    const wf = await db.get('SELECT * FROM workflows WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!wf) return reply.status(404).send({ error: 'Not found' });
    if (name !== undefined) await db.run('UPDATE workflows SET name = ? WHERE id = ?', [name, id]);
    if (description !== undefined) await db.run('UPDATE workflows SET description = ? WHERE id = ?', [description, id]);
    if (status !== undefined) await db.run('UPDATE workflows SET status = ? WHERE id = ?', [status, id]);
    await db.run('UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    if (Array.isArray(nodes)) {
      await db.run('DELETE FROM workflow_nodes WHERE workflow_id = ?', [id]);
      for (const n of nodes) {
        const nid = uuidv4();
        await db.run(
          'INSERT INTO workflow_nodes (id, workflow_id, node_id, type, label, position_x, position_y, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [nid, id, n.id, n.type, n.label || '', n.position?.x || 0, n.position?.y || 0, JSON.stringify(n.data || {})]
        );
      }
    }
    if (Array.isArray(edges)) {
      await db.run('DELETE FROM workflow_edges WHERE workflow_id = ?', [id]);
      for (const e of edges) {
        const eid = uuidv4();
        await db.run(
          'INSERT INTO workflow_edges (id, workflow_id, edge_id, source, target, label) VALUES (?, ?, ?, ?, ?, ?)',
          [eid, id, e.id, e.source, e.target, e.label || '']
        );
      }
    }

    const updated = await db.get('SELECT * FROM workflows WHERE id = ?', [id]);
    return reply.send(updated);
  });

  app.delete('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    await db.run('DELETE FROM workflows WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });

  app.post('/workflows/:id/execute', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const wf = await db.get('SELECT * FROM workflows WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!wf) return reply.status(404).send({ error: 'Not found' });
    const eid = uuidv4();
    await db.run('INSERT INTO workflow_executions (id, workflow_id, status) VALUES (?, ?, ?)', [eid, id, 'running']);
    setTimeout(async () => {
      const d = await getDb();
      await d.run('UPDATE workflow_executions SET status = ?, result = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', JSON.stringify({ success: true }), eid]);
    }, 2000);
    return reply.send({ executionId: eid, status: 'running' });
  });

  app.get('/workflows/:id/executions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const rows = await db.all('SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC', [id]);
    return reply.send({ data: rows });
  });

  app.get('/workflows/:id/executions/:eid', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id, eid } = request.params as any;
    const db = await getDb();
    const row = await db.get('SELECT * FROM workflow_executions WHERE id = ? AND workflow_id = ?', [eid, id]);
    if (!row) return reply.status(404).send({ error: 'Not found' });
    return reply.send(row);
  });

  app.post('/workflows/:id/executions/:eid/cancel', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id, eid } = request.params as any;
    const db = await getDb();
    await db.run('UPDATE workflow_executions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ? AND workflow_id = ?', ['cancelled', eid, id]);
    return reply.send({ success: true });
  });
}
