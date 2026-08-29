import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { chatCompletion } from '../services/llm';
import { encrypt, decrypt, maskApiKey } from '../utils/crypto';

function sanitizeConfig(row: any): any {
  if (!row) return row;
  return { ...row, api_key: maskApiKey(row.api_key ? decrypt(row.api_key) : '') };
}

export async function agentConfigRoutes(app: FastifyInstance) {
  // Legacy single-config endpoint: returns default config (or the only config)
  app.get('/agent-config', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const row = await db.get('SELECT * FROM agent_config WHERE user_id = ? AND is_default = 1 LIMIT 1', [request.user!.id]);
    if (!row) {
      const anyRow = await db.get('SELECT * FROM agent_config WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [request.user!.id]);
      return reply.send(anyRow ? sanitizeConfig(anyRow) : {});
    }
    return reply.send(sanitizeConfig(row));
  });

  // Legacy single-config update
  app.put('/agent-config', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, model, temperature, max_tokens, system_prompt, tools_enabled, api_key } = request.body as any;
    const db = await getDb();
    const existing = await db.get('SELECT * FROM agent_config WHERE user_id = ? AND is_default = 1 LIMIT 1', [request.user!.id]);
    if (existing) {
      const fields: string[] = [];
      const values: any[] = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (model !== undefined) { fields.push('model = ?'); values.push(model); }
      if (temperature !== undefined) { fields.push('temperature = ?'); values.push(temperature); }
      if (max_tokens !== undefined) { fields.push('max_tokens = ?'); values.push(max_tokens); }
      if (system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(system_prompt); }
      if (api_key !== undefined) { fields.push('api_key = ?'); values.push(encrypt(api_key)); }
      if (tools_enabled !== undefined) { fields.push('tools_enabled = ?'); values.push(typeof tools_enabled === 'string' ? tools_enabled : JSON.stringify(tools_enabled)); }
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(existing.id);
      await db.run(`UPDATE agent_config SET ${fields.join(', ')} WHERE id = ?`, values);
      const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [existing.id]);
      return reply.send(sanitizeConfig(row));
    } else {
      const id = uuidv4();
      await db.run(
        'INSERT INTO agent_config (id, user_id, name, model, temperature, max_tokens, system_prompt, api_key, tools_enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, request.user!.id, name || 'Pi Agent', model || 'gpt-4o', temperature ?? 0.7, max_tokens ?? 2048, system_prompt || '', encrypt(api_key || ''), typeof tools_enabled === 'string' ? tools_enabled : JSON.stringify(tools_enabled || []), 1]
      );
      const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [id]);
      return reply.status(201).send(sanitizeConfig(row));
    }
  });

  // Multi-config endpoints
  app.get('/agent-configs', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM agent_config WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [request.user!.id]);
    return reply.send({ data: rows.map(sanitizeConfig) });
  });

  app.post('/agent-configs', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, model, temperature, max_tokens, system_prompt, tools_enabled, api_key, is_default } = request.body as any;
    const db = await getDb();
    const id = uuidv4();

    if (is_default) {
      await db.run('UPDATE agent_config SET is_default = 0 WHERE user_id = ?', [request.user!.id]);
    }

    await db.run(
      'INSERT INTO agent_config (id, user_id, name, model, temperature, max_tokens, system_prompt, api_key, tools_enabled, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, request.user!.id, name || 'Pi Agent', model || 'gpt-4o', temperature ?? 0.7, max_tokens ?? 2048, system_prompt || '', encrypt(api_key || ''), typeof tools_enabled === 'string' ? tools_enabled : JSON.stringify(tools_enabled || []), is_default ? 1 : 0]
    );
    const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [id]);
    return reply.status(201).send(sanitizeConfig(row));
  });

  app.put('/agent-configs/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const { name, model, temperature, max_tokens, system_prompt, tools_enabled, api_key, is_default } = request.body as any;
    const db = await getDb();
    const existing = await db.get('SELECT * FROM agent_config WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!existing) return reply.status(404).send({ error: 'Config not found' });

    if (is_default) {
      await db.run('UPDATE agent_config SET is_default = 0 WHERE user_id = ?', [request.user!.id]);
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (model !== undefined) { fields.push('model = ?'); values.push(model); }
    if (temperature !== undefined) { fields.push('temperature = ?'); values.push(temperature); }
    if (max_tokens !== undefined) { fields.push('max_tokens = ?'); values.push(max_tokens); }
    if (system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(system_prompt); }
    if (api_key !== undefined) { fields.push('api_key = ?'); values.push(encrypt(api_key)); }
    if (tools_enabled !== undefined) { fields.push('tools_enabled = ?'); values.push(typeof tools_enabled === 'string' ? tools_enabled : JSON.stringify(tools_enabled)); }
    if (is_default !== undefined) { fields.push('is_default = ?'); values.push(is_default ? 1 : 0); }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await db.run(`UPDATE agent_config SET ${fields.join(', ')} WHERE id = ?`, values);

    const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [id]);
    return reply.send(sanitizeConfig(row));
  });

  app.delete('/agent-configs/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    await db.run('DELETE FROM agent_config WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    return reply.send({ success: true });
  });

  app.post('/agent-configs/:id/set-default', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const existing = await db.get('SELECT * FROM agent_config WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!existing) return reply.status(404).send({ error: 'Config not found' });

    await db.run('UPDATE agent_config SET is_default = 0 WHERE user_id = ?', [request.user!.id]);
    await db.run('UPDATE agent_config SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [id]);
    return reply.send(sanitizeConfig(row));
  });

  app.post('/agent-configs/test', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.body as any;
    const db = await getDb();
    let config: any;
    if (id) {
      config = await db.get('SELECT * FROM agent_config WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    } else {
      config = await db.get('SELECT * FROM agent_config WHERE user_id = ? AND is_default = 1 LIMIT 1', [request.user!.id]);
      if (!config) {
        config = await db.get('SELECT * FROM agent_config WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [request.user!.id]);
      }
    }
    if (!config) return reply.status(404).send({ error: 'No agent config found' });

    const apiKey = decrypt(config.api_key || '');
    if (!apiKey) return reply.status(400).send({ error: 'API Key is not configured' });

    try {
      const result = await chatCompletion(
        [{ role: 'user', content: 'Say "Connection OK" only.' }],
        {
          model: config.model || 'gpt-4o',
          apiKey,
          temperature: config.temperature ?? 0.7,
          maxTokens: 10,
          systemPrompt: undefined,
        }
      );
      return reply.send({ success: true, response: result });
    } catch (err: any) {
      return reply.status(502).send({ success: false, error: err.message || 'Connection test failed' });
    }
  });
}
