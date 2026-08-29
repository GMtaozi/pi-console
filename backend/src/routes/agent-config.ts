import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

export async function agentConfigRoutes(app: FastifyInstance) {
  app.get('/agent-config', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const row = await db.get('SELECT * FROM agent_config WHERE user_id = ?', [request.user!.id]);
    if (!row) return reply.send({});
    return reply.send(row);
  });

  app.put('/agent-config', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, model, temperature, max_tokens, system_prompt, tools_enabled, api_key } = request.body as any;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM agent_config WHERE user_id = ?', [request.user!.id]);
    if (existing) {
      const fields: string[] = [];
      const values: any[] = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (model !== undefined) { fields.push('model = ?'); values.push(model); }
      if (temperature !== undefined) { fields.push('temperature = ?'); values.push(temperature); }
      if (max_tokens !== undefined) { fields.push('max_tokens = ?'); values.push(max_tokens); }
      if (system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(system_prompt); }
      if (api_key !== undefined) { fields.push('api_key = ?'); values.push(api_key); }
      if (tools_enabled !== undefined) { fields.push('tools_enabled = ?'); values.push(typeof tools_enabled === 'string' ? tools_enabled : JSON.stringify(tools_enabled)); }
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(existing.id);
      await db.run(`UPDATE agent_config SET ${fields.join(', ')} WHERE id = ?`, values);
      const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [existing.id]);
      return reply.send(row);
    } else {
      const id = uuidv4();
      await db.run(
        'INSERT INTO agent_config (id, user_id, name, model, temperature, max_tokens, system_prompt, api_key, tools_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, request.user!.id, name || 'Pi Agent', model || 'gpt-4o', temperature ?? 0.7, max_tokens ?? 2048, system_prompt || '', api_key || '', typeof tools_enabled === 'string' ? tools_enabled : JSON.stringify(tools_enabled || [])]
      );
      const row = await db.get('SELECT * FROM agent_config WHERE id = ?', [id]);
      return reply.status(201).send(row);
    }
  });
}
