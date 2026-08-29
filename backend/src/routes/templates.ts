import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

export async function templateRoutes(app: FastifyInstance) {
  // List all available templates (system + user's own + public user templates)
  app.get('/workflow-templates', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const userId = request.user!.id;
    const { search, tags, category, sort = 'updated_at', order = 'desc', scope = 'all' } = request.query as any;

    // Parse tag list early
    const tagList = tags ? String(tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [];

    // Validate sort field
    const allowedSort = ['name', 'created_at', 'updated_at'];
    const sortField = allowedSort.includes(sort) ? sort : 'updated_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    // Build system template query
    let systemSql = `
      SELECT id, name, description, category, nodes, edges,
        '[]'::text AS tags, 'system' AS source, NULL::text AS user_id,
        created_at, updated_at
      FROM workflow_templates
      WHERE 1=1
    `;
    const systemParams: any[] = [];
    if (search) {
      systemSql += ` AND (name ILIKE $${systemParams.length + 1} OR description ILIKE $${systemParams.length + 1})`;
      systemParams.push(`%${search}%`);
    }
    if (category) {
      systemSql += ` AND category = $${systemParams.length + 1}`;
      systemParams.push(category);
    }
    if (tagList.length > 0) {
      // System templates have no tags, so tag filter excludes them
      systemSql += ' AND 1=0';
    }

    // Build user template query
    let userSql = `
      SELECT id, name, description, category, nodes, edges,
        tags, 'user' AS source, user_id,
        created_at, updated_at
      FROM user_workflow_templates
      WHERE (user_id = $1 OR is_public = 1)
    `;
    const userParams: any[] = [userId];

    if (search) {
      userSql += ` AND (name ILIKE $${userParams.length + 1} OR description ILIKE $${userParams.length + 1})`;
      userParams.push(`%${search}%`);
    }
    if (category) {
      userSql += ` AND category = $${userParams.length + 1}`;
      userParams.push(category);
    }
    if (tagList.length > 0) {
      const tagChecks = tagList.map((_: any, i: number) => `tags ILIKE $${userParams.length + i + 1}`).join(' AND ');
      userSql += ` AND (${tagChecks})`;
      tagList.forEach((t: string) => userParams.push(`%"${t}"%`));
    }
    if (scope === 'user') {
      userSql += ` AND user_id = $${userParams.length + 1}`;
      userParams.push(userId);
    }

    let sql: string;
    let queryParams: any[];

    if (scope === 'system') {
      sql = `${systemSql} ORDER BY ${sortField} ${sortOrder}`;
      queryParams = systemParams;
    } else if (scope === 'user') {
      sql = `${userSql} ORDER BY ${sortField} ${sortOrder}`;
      queryParams = userParams;
    } else {
      // all: union both
      sql = `(${systemSql}) UNION ALL (${userSql}) ORDER BY ${sortField} ${sortOrder}`;
      queryParams = [...systemParams, ...userParams];
    }

    const db = await getDb();
    const rows = await db.all(sql, queryParams);

    // Parse tags JSON
    const result = rows.map((r: any) => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : [],
      nodes: r.nodes ? JSON.parse(r.nodes) : [],
      edges: r.edges ? JSON.parse(r.edges) : [],
    }));

    return reply.send({ data: result });
  });

  // Get single template (system or user)
  app.get('/workflow-templates/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const userId = request.user!.id;
    const db = await getDb();

    // Try user template first
    let row = await db.get(
      'SELECT *, \'user\' AS source FROM user_workflow_templates WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [id, userId]
    );

    // Fall back to system template
    if (!row) {
      row = await db.get("SELECT *, 'system' AS source, '[]'::text AS tags, NULL::text AS user_id FROM workflow_templates WHERE id = ?", [id]);
    }

    if (!row) return reply.status(404).send({ error: 'Template not found' });

    return reply.send({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      nodes: row.nodes ? JSON.parse(row.nodes) : [],
      edges: row.edges ? JSON.parse(row.edges) : [],
    });
  });

  // Create user template
  app.post('/workflow-templates', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, description, tags, category, nodes, edges, is_public } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'name is required' });

    const db = await getDb();
    const id = uuidv4();
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : JSON.stringify([]);
    const nodesJson = Array.isArray(nodes) ? JSON.stringify(nodes) : JSON.stringify([]);
    const edgesJson = Array.isArray(edges) ? JSON.stringify(edges) : JSON.stringify([]);

    await db.run(
      'INSERT INTO user_workflow_templates (id, user_id, name, description, tags, category, nodes, edges, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, request.user!.id, name, description || '', tagsJson, category || '', nodesJson, edgesJson, is_public ? 1 : 0]
    );

    const row = await db.get('SELECT * FROM user_workflow_templates WHERE id = ?', [id]);
    return reply.status(201).send({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      nodes: JSON.parse(row.nodes || '[]'),
      edges: JSON.parse(row.edges || '[]'),
    });
  });

  // Update user template
  app.put('/workflow-templates/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const { name, description, tags, category, nodes, edges, is_public } = request.body as any;
    const db = await getDb();

    const row = await db.get('SELECT * FROM user_workflow_templates WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (!row) return reply.status(404).send({ error: 'Template not found or not owned by you' });

    if (name !== undefined) await db.run('UPDATE user_workflow_templates SET name = ? WHERE id = ?', [name, id]);
    if (description !== undefined) await db.run('UPDATE user_workflow_templates SET description = ? WHERE id = ?', [description, id]);
    if (tags !== undefined) await db.run('UPDATE user_workflow_templates SET tags = ? WHERE id = ?', [JSON.stringify(tags), id]);
    if (category !== undefined) await db.run('UPDATE user_workflow_templates SET category = ? WHERE id = ?', [category, id]);
    if (nodes !== undefined) await db.run('UPDATE user_workflow_templates SET nodes = ? WHERE id = ?', [JSON.stringify(nodes), id]);
    if (edges !== undefined) await db.run('UPDATE user_workflow_templates SET edges = ? WHERE id = ?', [JSON.stringify(edges), id]);
    if (is_public !== undefined) await db.run('UPDATE user_workflow_templates SET is_public = ? WHERE id = ?', [is_public ? 1 : 0, id]);
    await db.run('UPDATE user_workflow_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

    const updated = await db.get('SELECT * FROM user_workflow_templates WHERE id = ?', [id]);
    return reply.send({
      ...updated,
      tags: JSON.parse(updated.tags || '[]'),
      nodes: JSON.parse(updated.nodes || '[]'),
      edges: JSON.parse(updated.edges || '[]'),
    });
  });

  // Delete user template
  app.delete('/workflow-templates/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as any;
    const db = await getDb();
    const result = await db.run('DELETE FROM user_workflow_templates WHERE id = ? AND user_id = ?', [id, request.user!.id]);
    if (result.changes === 0) return reply.status(404).send({ error: 'Template not found or not owned by you' });
    return reply.send({ success: true });
  });

  // Get all unique tags
  app.get('/workflow-templates/tags', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.all('SELECT DISTINCT tags FROM user_workflow_templates');
    const tagSet = new Set<string>();
    for (const row of rows) {
      try {
        const arr = JSON.parse(row.tags || '[]');
        if (Array.isArray(arr)) {
          arr.forEach((t: string) => tagSet.add(t));
        }
      } catch {
        // ignore
      }
    }
    return reply.send({ data: Array.from(tagSet).sort() });
  });

  // Create workflow from template (supports both system and user templates)
  app.post('/workflows/from-template/:templateId', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { templateId } = request.params as any;
    const { name } = request.body as any;
    const db = await getDb();
    const userId = request.user!.id;

    // Try user template first
    let template = await db.get(
      'SELECT * FROM user_workflow_templates WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [templateId, userId]
    );

    // Fall back to system template
    if (!template) {
      template = await db.get('SELECT * FROM workflow_templates WHERE id = ?', [templateId]);
    }

    if (!template) return reply.status(404).send({ error: 'Template not found' });

    const id = uuidv4();
    const wfName = name || `${template.name} (Copy)`;
    await db.run('INSERT INTO workflows (id, user_id, name, description) VALUES (?, ?, ?, ?)', [id, userId, wfName, template.description || '']);

    const nodes = JSON.parse(template.nodes || '[]');
    const edges = JSON.parse(template.edges || '[]');

    for (const n of nodes) {
      const nid = uuidv4();
      await db.run(
        'INSERT INTO workflow_nodes (id, workflow_id, node_id, type, label, position_x, position_y, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [nid, id, n.id, n.type, n.label || '', n.position?.x || 0, n.position?.y || 0, JSON.stringify(n.data || {})]
      );
    }
    for (const e of edges) {
      const eid = uuidv4();
      await db.run(
        'INSERT INTO workflow_edges (id, workflow_id, edge_id, source, target, label) VALUES (?, ?, ?, ?, ?, ?)',
        [eid, id, e.id, e.source, e.target, e.label || '']
      );
    }

    const wf = await db.get('SELECT * FROM workflows WHERE id = ?', [id]);
    const wfNodes = await db.all('SELECT * FROM workflow_nodes WHERE workflow_id = ?', [id]);
    const wfEdges = await db.all('SELECT * FROM workflow_edges WHERE workflow_id = ?', [id]);
    return reply.status(201).send({ ...wf, nodes: wfNodes, edges: wfEdges });
  });
}
