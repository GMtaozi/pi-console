import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../services/llm';

export async function sessionRoutes(app: FastifyInstance) {
  app.get('/sessions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const { page = '1', limit = '20', search = '', sort = 'updated_at', order = 'desc' } = request.query as any;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const sortCol = ['created_at', 'updated_at', 'title'].includes(sort) ? sort : 'updated_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    let sql = `SELECT * FROM sessions WHERE user_id = ?`;
    const params: any[] = [request.user!.id];
    if (search) {
      sql += ` AND title LIKE ?`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);
    const rows = await db.all(sql, params);
    const countRow = await db.get(
      `SELECT COUNT(*) as total FROM sessions WHERE user_id = ? ${search ? 'AND title LIKE ?' : ''}`,
      search ? [request.user!.id, `%${search}%`] : [request.user!.id]
    );
    return reply.send({ data: rows, total: countRow.total });
  });

  app.get('/sessions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!session) return reply.status(404).send({ error: 'Not found' });
    const messages = await db.all('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]);
    return reply.send({ ...session, messages });
  });

  app.post('/sessions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { title = 'New Session' } = request.body as any;
    const db = await getDb();
    const id = uuidv4();
    await db.run('INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)', [id, request.user!.id, title]);
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', [id]);
    return reply.status(201).send(session);
  });

  app.post('/sessions/:id/messages', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const { role, content } = request.body as any;
    if (!role || !content) return reply.status(400).send({ error: 'Missing fields' });
    const db = await getDb();
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    // Save user message
    const msgId = uuidv4();
    await db.run('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [msgId, id, role, content]);
    await db.run('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    // If user message, trigger LLM response
    if (role === 'user') {
      try {
        const config = await db.get('SELECT * FROM agent_config WHERE user_id = ?', [request.user!.id]);
        const history = await db.all(
          'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
          [id]
        );
        const llmMessages = history.map((m: any) => ({ role: m.role, content: m.content }));
        const assistantContent = await chatCompletion(llmMessages, {
          model: config?.model || 'gpt-4o',
          apiKey: config?.api_key || '',
          temperature: config?.temperature ?? 0.7,
          maxTokens: config?.max_tokens ?? 2048,
          systemPrompt: config?.system_prompt || undefined,
        });
        const assistantId = uuidv4();
        await db.run('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [
          assistantId, id, 'assistant', assistantContent,
        ]);
        await db.run('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      } catch (err: any) {
        const fallbackId = uuidv4();
        await db.run('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [
          fallbackId, id, 'assistant',
          `Error: ${err.message || 'Failed to get AI response'}`,
        ]);
        await db.run('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      }
    }

    const updatedSession = await db.get('SELECT * FROM sessions WHERE id = ?', [id]);
    const messages = await db.all('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]);
    return reply.status(201).send({ ...updatedSession, messages });
  });

  app.delete('/sessions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    await db.run('DELETE FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });
}
