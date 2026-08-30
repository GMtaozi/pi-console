import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Fastify schema definitions for validation
const listTemplatesSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string', maxLength: 200 },
      tags: { type: 'string', maxLength: 500 },
      category: { type: 'string', maxLength: 100 },
      sort: { type: 'string', enum: ['name', 'created_at', 'updated_at'] },
      order: { type: 'string', enum: ['asc', 'desc'] },
      scope: { type: 'string', enum: ['all', 'system', 'user'] },
      match: { type: 'string', enum: ['any', 'all'] },
    },
  },
};

const createTemplateSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      tags: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
      category: { type: 'string', maxLength: 100 },
      nodes: { type: 'array', maxItems: 1000 },
      edges: { type: 'array', maxItems: 1000 },
      is_public: { type: 'boolean' },
    },
  },
};

const updateTemplateSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      tags: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 50 },
      category: { type: 'string', maxLength: 100 },
      nodes: { type: 'array', maxItems: 1000 },
      edges: { type: 'array', maxItems: 1000 },
      is_public: { type: 'boolean' },
    },
  },
};

const fromTemplateSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 200 },
    },
  },
};

interface TemplateQuery {
  search?: string;
  tags?: string;
  category?: string;
  sort?: string;
  order?: string;
  scope?: string;
  match?: string;
}

export async function templateRoutes(app: FastifyInstance) {
  // List all available templates (system + user's own + public user templates)
  app.get('/workflow-templates', { preHandler: [authenticate], schema: listTemplatesSchema }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const userId = request.user!.id;
    const {
      search,
      tags,
      category,
      sort = 'updated_at',
      order = 'desc',
      scope = 'all',
      match = 'any',
    } = request.query as TemplateQuery;

    const tagList = tags ? String(tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [];
    const allowedSort = ['name', 'created_at', 'updated_at'];
    const sortField = allowedSort.includes(sort) ? sort : 'updated_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const systemRows: any[] = [];
    const userRows: any[] = [];

    // Fetch system templates
    if (scope !== 'user') {
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
      // System templates have no tags, so tag filter excludes them
      if (tagList.length === 0) {
        systemSql += ` ORDER BY ${sortField} ${sortOrder}`;
        const rows = await db.all(systemSql, systemParams);
        systemRows.push(...rows);
      }
    }

    // Fetch user templates
    if (scope !== 'system') {
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
        const tagJoiner = match === 'all' ? ' AND ' : ' OR ';
        const tagChecks = tagList.map((_: any, i: number) => `tags ILIKE $${userParams.length + i + 1}`).join(tagJoiner);
        userSql += ` AND (${tagChecks})`;
        tagList.forEach((t: string) => userParams.push(`%"${t}"%`));
      }
      if (scope === 'user') {
        userSql += ` AND user_id = $${userParams.length + 1}`;
        userParams.push(userId);
      }
      userSql += ` ORDER BY ${sortField} ${sortOrder}`;
      const rows = await db.all(userSql, userParams);
      userRows.push(...rows);
    }

    const rows = [...systemRows, ...userRows];

    const result = rows.map((r: any) => ({
      ...r,
      tags: safeJsonParse<string[]>(r.tags, []),
      nodes: safeJsonParse<any[]>(r.nodes, []),
      edges: safeJsonParse<any[]>(r.edges, []),
    }));

    return reply.send({ data: result });
  });

  // Get single template (system or user)
  app.get('/workflow-templates/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const db = await getDb();

    // Query user template first by id
    let row = await db.get(
      "SELECT *, 'user' AS source FROM user_workflow_templates WHERE id = $1",
      [id]
    );

    if (row) {
      // Permission check for user template
      if (row.user_id !== userId && row.is_public !== 1) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    } else {
      // Fall back to system template
      row = await db.get(
        "SELECT *, 'system' AS source, '[]'::text AS tags, NULL::text AS user_id FROM workflow_templates WHERE id = $1",
        [id]
      );
    }

    if (!row) return reply.status(404).send({ error: 'Template not found' });

    return reply.send({
      ...row,
      tags: safeJsonParse<string[]>(row.tags, []),
      nodes: safeJsonParse<any[]>(row.nodes, []),
      edges: safeJsonParse<any[]>(row.edges, []),
    });
  });

  // Create user template
  app.post('/workflow-templates', { preHandler: [authenticate], schema: createTemplateSchema }, async (request: AuthRequest, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      tags?: string[];
      category?: string;
      nodes?: any[];
      edges?: any[];
      is_public?: boolean;
    };

    const db = await getDb();
    const id = uuidv4();
    const tagsJson = Array.isArray(body.tags) ? JSON.stringify(body.tags) : JSON.stringify([]);
    const nodesJson = Array.isArray(body.nodes) ? JSON.stringify(body.nodes) : JSON.stringify([]);
    const edgesJson = Array.isArray(body.edges) ? JSON.stringify(body.edges) : JSON.stringify([]);

    await db.run(
      'INSERT INTO user_workflow_templates (id, user_id, name, description, tags, category, nodes, edges, is_public) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, request.user!.id, body.name, body.description || '', tagsJson, body.category || '', nodesJson, edgesJson, body.is_public ? 1 : 0]
    );

    const row = await db.get('SELECT * FROM user_workflow_templates WHERE id = $1', [id]);
    return reply.status(201).send({
      ...row,
      tags: safeJsonParse<string[]>(row.tags, []),
      nodes: safeJsonParse<any[]>(row.nodes, []),
      edges: safeJsonParse<any[]>(row.edges, []),
    });
  });

  // Update user template
  app.put('/workflow-templates/:id', { preHandler: [authenticate], schema: updateTemplateSchema }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      tags?: string[];
      category?: string;
      nodes?: any[];
      edges?: any[];
      is_public?: boolean;
    };
    const db = await getDb();

    const row = await db.get('SELECT * FROM user_workflow_templates WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if (!row) return reply.status(404).send({ error: 'Template not found or not owned by you' });

    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push(`description = $${values.length + 1}`);
      values.push(body.description);
    }
    if (body.tags !== undefined) {
      updates.push(`tags = $${values.length + 1}`);
      values.push(JSON.stringify(body.tags));
    }
    if (body.category !== undefined) {
      updates.push(`category = $${values.length + 1}`);
      values.push(body.category);
    }
    if (body.nodes !== undefined) {
      updates.push(`nodes = $${values.length + 1}`);
      values.push(JSON.stringify(body.nodes));
    }
    if (body.edges !== undefined) {
      updates.push(`edges = $${values.length + 1}`);
      values.push(JSON.stringify(body.edges));
    }
    if (body.is_public !== undefined) {
      updates.push(`is_public = $${values.length + 1}`);
      values.push(body.is_public ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      await db.run(
        `UPDATE user_workflow_templates SET ${updates.join(', ')} WHERE id = $${values.length}`,
        values
      );
    }

    const updated = await db.get('SELECT * FROM user_workflow_templates WHERE id = $1', [id]);
    return reply.send({
      ...updated,
      tags: safeJsonParse<string[]>(updated.tags, []),
      nodes: safeJsonParse<any[]>(updated.nodes, []),
      edges: safeJsonParse<any[]>(updated.edges, []),
    });
  });

  // Delete user template
  app.delete('/workflow-templates/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    const result = await db.query('DELETE FROM user_workflow_templates WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if ((result.rowCount ?? 0) === 0) {
      return reply.status(404).send({ error: 'Template not found or not owned by you' });
    }
    return reply.send({ success: true });
  });

  // Get all unique tags
  app.get('/workflow-templates/tags', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.all('SELECT DISTINCT tags FROM user_workflow_templates');
    const tagSet = new Set<string>();
    for (const row of rows) {
      const arr = safeJsonParse<string[]>(row.tags, []);
      if (Array.isArray(arr)) {
        arr.forEach((t: string) => tagSet.add(t));
      }
    }
    return reply.send({ data: Array.from(tagSet).sort() });
  });

  // Create workflow from template (supports both system and user templates)
  app.post('/workflows/from-template/:templateId', { preHandler: [authenticate], schema: fromTemplateSchema }, async (request: AuthRequest, reply) => {
    const { templateId } = request.params as { templateId: string };
    const { name } = request.body as { name?: string };
    const db = await getDb();
    const userId = request.user!.id;

    // Try user template first
    let template = await db.get(
      'SELECT * FROM user_workflow_templates WHERE id = $1',
      [templateId]
    );

    if (template) {
      if (template.user_id !== userId && template.is_public !== 1) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    } else {
      // Fall back to system template
      template = await db.get('SELECT * FROM workflow_templates WHERE id = $1', [templateId]);
    }

    if (!template) return reply.status(404).send({ error: 'Template not found' });

    const id = uuidv4();
    const wfName = name || `${template.name} (Copy)`;
    const nodes = safeJsonParse<any[]>(template.nodes, []);
    const edges = safeJsonParse<any[]>(template.edges, []);

    await db.transaction(async (client) => {
      await client.run(
        'INSERT INTO workflows (id, user_id, name, description) VALUES ($1, $2, $3, $4)',
        [id, userId, wfName, template.description || '']
      );

      for (const n of nodes) {
        const nid = uuidv4();
        await client.run(
          'INSERT INTO workflow_nodes (id, workflow_id, node_id, type, label, position_x, position_y, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [nid, id, n.id, n.type, n.label || '', n.position?.x || 0, n.position?.y || 0, JSON.stringify(n.data || {})]
        );
      }
      for (const e of edges) {
        const eid = uuidv4();
        await client.run(
          'INSERT INTO workflow_edges (id, workflow_id, edge_id, source, target, label) VALUES ($1, $2, $3, $4, $5, $6)',
          [eid, id, e.id, e.source, e.target, e.label || '']
        );
      }
    });

    const wf = await db.get('SELECT * FROM workflows WHERE id = $1', [id]);
    const wfNodes = await db.all('SELECT * FROM workflow_nodes WHERE workflow_id = $1', [id]);
    const wfEdges = await db.all('SELECT * FROM workflow_edges WHERE workflow_id = $1', [id]);
    return reply.status(201).send({ ...wf, nodes: wfNodes, edges: wfEdges });
  });
}
