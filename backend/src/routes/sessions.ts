import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { chatCompletion, chatCompletionStream } from '../services/llm';
import { decrypt } from '../utils/crypto';

// ========== Export helpers ==========

function sanitizeFilename(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, '-').trim();
}

interface MessageNode {
  id: string;
  role: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  children: MessageNode[];
}

function buildMessageTree(
  messages: Array<{
    id: string;
    role: string;
    content: string;
    parent_id: string | null;
    created_at: string;
  }>
): MessageNode[] {
  const map = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];

  for (const msg of messages) {
    map.set(msg.id, {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parent_id: msg.parent_id,
      created_at: msg.created_at,
      children: [],
    });
  }

  for (const msg of messages) {
    const node = map.get(msg.id)!;
    if (msg.parent_id && map.has(msg.parent_id)) {
      map.get(msg.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function renderMarkdownTree(nodes: MessageNode[], depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  for (const node of nodes) {
    const createdAt = node.created_at.replace('T', ' ').replace(/\.\d+Z$/, '');
    lines.push(`${indent}**${node.role}** (${createdAt}): ${node.content}`);
    if (node.children.length > 0) {
      lines.push(renderMarkdownTree(node.children, depth + 1));
    }
  }
  return lines.join('\n');
}

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

    const result = await db.query(sql, params);
    const rows = result.rows;

    let countSql = `SELECT COUNT(*) as total FROM sessions WHERE user_id = ?`;
    const countParams: any[] = [request.user!.id];
    if (search) {
      countSql += ` AND title LIKE ?`;
      countParams.push(`%${search}%`);
    }
    const countResult = await db.query(countSql, countParams);
    const countRow = countResult.rows[0];

    return reply.send({ data: rows, total: parseInt(countRow.total, 10) });
  });

  app.get('/sessions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    const session = sessionResult.rows[0];
    if (!session) return reply.status(404).send({ error: 'Not found' });
    const messagesResult = await db.query('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]);
    const messages = messagesResult.rows;
    return reply.send({ ...session, messages });
  });

  app.get('/sessions/:id/export', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const { format } = request.query as { format?: string };

    if (!format || (format !== 'markdown' && format !== 'json')) {
      return reply.status(400).send({ error: 'Invalid format. Use "markdown" or "json".' });
    }

    const db = await getDb();
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    const session = sessionResult.rows[0];
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const messagesResult = await db.query(
      'SELECT id, role, content, parent_id, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [id]
    );
    const messages = messagesResult.rows;

    const safeTitle = sanitizeFilename(session.title || 'untitled');

    if (format === 'json') {
      const filename = `session-${id}-${safeTitle}.json`;
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(messages);
    }

    // format === 'markdown'
    const filename = `session-${id}-${safeTitle}.md`;
    const tree = buildMessageTree(messages);
    const body = renderMarkdownTree(tree);
    const markdown = `# Session: ${session.title || 'Untitled'}\n\n${body}`;

    return reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(markdown);
  });

  app.post('/sessions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { title = 'New Session' } = request.body as any;
    const db = await getDb();
    const id = uuidv4();
    await db.query('INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)', [id, request.user!.id, title]);
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = ?', [id]);
    const session = sessionResult.rows[0];
    return reply.status(201).send(session);
  });

  app.post('/sessions/:id/messages', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const { role, content, stream = false } = request.body as any;
    if (!role || !content) return reply.status(400).send({ error: 'Missing fields' });
    const db = await getDb();
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    const session = sessionResult.rows[0];
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    // Save user message
    const msgId = uuidv4();
    await db.query('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [msgId, id, role, content]);
    await db.query('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    // If user message, trigger LLM response
    if (role === 'user') {
      const configResult = await db.query('SELECT * FROM agent_config WHERE user_id = ? AND is_default = 1 LIMIT 1', [request.user!.id]);
      let config = configResult.rows[0];
      if (!config) {
        const anyConfig = await db.query('SELECT * FROM agent_config WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [request.user!.id]);
        config = anyConfig.rows[0];
      }

      const apiKey = config?.api_key ? decrypt(config.api_key) : '';
      const model = config?.model || 'gpt-4o';
      const temperature = config?.temperature ?? 0.7;
      const maxTokens = config?.max_tokens ?? 2048;
      const systemPrompt = config?.system_prompt || undefined;

      const historyResult = await db.query(
        'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
        [id]
      );
      const history = historyResult.rows;
      const llmMessages = history.map((m: any) => ({ role: m.role, content: m.content }));

      if (stream) {
        // SSE streaming mode
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        let fullContent = '';
        try {
          const streamGenerator = chatCompletionStream(llmMessages, {
            model,
            apiKey,
            temperature,
            maxTokens,
            systemPrompt,
          });

          for await (const chunk of streamGenerator) {
            fullContent += chunk;
            reply.raw.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
          }

          // Save assistant message
          const assistantId = uuidv4();
          await db.query('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [
            assistantId, id, 'assistant', fullContent,
          ]);
          await db.query('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

          reply.raw.write(`data: ${JSON.stringify({ chunk: '', done: true, messageId: assistantId })}\n\n`);
          reply.raw.end();
        } catch (err: any) {
          const errorMsg = err.message || 'Failed to get AI response';
          reply.raw.write(`data: ${JSON.stringify({ error: errorMsg, done: true })}\n\n`);
          reply.raw.end();

          const fallbackId = uuidv4();
          await db.query('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [
            fallbackId, id, 'assistant', `Error: ${errorMsg}`,
          ]);
          await db.query('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        }
        return;
      }

      // Non-streaming mode (fallback)
      try {
        const assistantContent = await chatCompletion(llmMessages, {
          model,
          apiKey,
          temperature,
          maxTokens,
          systemPrompt,
        });
        const assistantId = uuidv4();
        await db.query('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [
          assistantId, id, 'assistant', assistantContent,
        ]);
        await db.query('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      } catch (err: any) {
        const fallbackId = uuidv4();
        await db.query('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)', [
          fallbackId, id, 'assistant',
          `Error: ${err.message || 'Failed to get AI response'}`,
        ]);
        await db.query('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      }
    }

    const updatedSessionResult = await db.query('SELECT * FROM sessions WHERE id = ?', [id]);
    const updatedSession = updatedSessionResult.rows[0];
    const messagesResult = await db.query('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC', [id]);
    const messages = messagesResult.rows;
    return reply.status(201).send({ ...updatedSession, messages });
  });

  app.delete('/sessions/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    await db.query('DELETE FROM sessions WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });
}
