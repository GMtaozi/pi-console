import { FastifyInstance, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { executeWorkflow } from '../engine/executeWorkflow';
import { WorkflowNode, WorkflowEdge } from '../engine/types';
import { detectSubWorkflowCycle } from '../engine/executors/SubWorkflowNodeExecutor';
import { createExecutionLog, updateExecutionLog } from '../engine/ExecutionLogger';
import { z } from 'zod';

// SEC-007: Zod schemas for input validation
const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.string().max(50).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  edges: z.array(z.record(z.string(), z.unknown())).optional(),
});

const ExecuteWorkflowSchema = z.object({
  inputs: z.record(z.string(), z.unknown()).optional(),
  envVars: z.record(z.string(), z.string()).optional(),
});

const WorkflowIdParamSchema = z.object({
  id: z.string().uuid(),
});

const ExecutionIdParamSchema = z.object({
  id: z.string().uuid(),
  eid: z.string().uuid(),
});

export async function workflowRoutes(app: FastifyInstance) {
  app.get('/workflows', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const db = await getDb();
    const rows = await db.query('SELECT * FROM workflows WHERE user_id = $1 ORDER BY updated_at DESC', [request.user!.id]);
    return reply.send({ data: rows.rows });
  });

  app.post('/workflows', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const parsed = CreateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const { name, description } = parsed.data;
    const db = await getDb();
    const id = uuidv4();
    await db.query('INSERT INTO workflows (id, user_id, name, description) VALUES ($1, $2, $3, $4)', [id, request.user!.id, name, description || '']);
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1', [id]);
    return reply.status(201).send(wf.rows[0]);
  });

  app.get('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = WorkflowIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const db = await getDb();
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if (!wf.rows || wf.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
    const nodes = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = $1', [id]);
    const edges = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = $1', [id]);
    return reply.send({ ...wf.rows[0], nodes: nodes.rows, edges: edges.rows });
  });

  app.put('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = WorkflowIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const bodyParsed = UpdateWorkflowSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: bodyParsed.error.issues });
    }
    const { name, description, status, nodes, edges } = bodyParsed.data;
    const db = await getDb();
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if (!wf.rows || wf.rows.length === 0) return reply.status(404).send({ error: 'Not found' });

    if (name !== undefined) await db.query('UPDATE workflows SET name = $1 WHERE id = $2', [name, id]);
    if (description !== undefined) await db.query('UPDATE workflows SET description = $1 WHERE id = $2', [description, id]);
    if (status !== undefined) await db.query('UPDATE workflows SET status = $1 WHERE id = $2', [status, id]);
    await db.query('UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    // Phase 2: Sub-workflow cycle detection
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        const node = n as Record<string, unknown>;
        if (node.type === 'subWorkflow' && (node.data as Record<string, unknown> | undefined)?.workflowId) {
          const cycle = await detectSubWorkflowCycle(id);
          if (cycle) {
            return reply.status(400).send({
              error: 'Circular sub-workflow reference detected',
              cycle,
            });
          }
        }
      }

      await db.query('DELETE FROM workflow_nodes WHERE workflow_id = $1', [id]);
      for (const n of nodes) {
        const node = n as Record<string, unknown>;
        const nid = uuidv4();
        const position = node.position as Record<string, unknown> | undefined;
        await db.query(
          'INSERT INTO workflow_nodes (id, workflow_id, node_id, type, label, position_x, position_y, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [nid, id, node.id, node.type, (node.label as string) || '', (position?.x as number) || 0, (position?.y as number) || 0, JSON.stringify(node.data || {})]
        );
      }
    }
    if (Array.isArray(edges)) {
      await db.query('DELETE FROM workflow_edges WHERE workflow_id = $1', [id]);
      for (const e of edges) {
        const eid = uuidv4();
        await db.query(
          'INSERT INTO workflow_edges (id, workflow_id, edge_id, source, target, label) VALUES ($1, $2, $3, $4, $5, $6)',
          [eid, id, e.id, e.source, e.target, e.label || '']
        );
      }
    }

    const updated = await db.query('SELECT * FROM workflows WHERE id = $1', [id]);
    return reply.send(updated.rows[0]);
  });

  app.delete('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = WorkflowIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const db = await getDb();
    await db.query('DELETE FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    return reply.send({ success: true });
  });

  // ========== REAL WORKFLOW EXECUTION ==========
  app.post('/workflows/:id/execute', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = WorkflowIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const bodyParsed = ExecuteWorkflowSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: bodyParsed.error.issues });
    }
    const { inputs, envVars } = bodyParsed.data;
    const db = await getDb();
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if (!wf.rows || wf.rows.length === 0) return reply.status(404).send({ error: 'Not found' });

    // Load nodes and edges
    const dbNodes = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = $1', [id]);
    const dbEdges = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = $1', [id]);

    const nodes: WorkflowNode[] = (dbNodes.rows || []).map((n: any) => ({
      id: n.node_id,
      type: n.type,
      label: n.label,
      position: { x: n.position_x, y: n.position_y },
      data: n.data ? JSON.parse(n.data) : {},
    }));

    const edges: WorkflowEdge[] = (dbEdges.rows || []).map((e: any) => ({
      id: e.edge_id,
      source: e.source,
      target: e.target,
      label: e.label,
    }));

    // Phase 2: Load global variables for this user
    const globalVarsRows = await db.query(
      'SELECT key, value, type FROM global_variables WHERE user_id = $1 AND environment = $2',
      [request.user!.id, 'development']
    );
    const globalVars: Record<string, any> = {};
    for (const row of globalVarsRows.rows || []) {
      try {
        if (row.type === 'json') {
          globalVars[row.key] = JSON.parse(row.value);
        } else if (row.type === 'number') {
          const n = Number(row.value);
          globalVars[row.key] = Number.isNaN(n) ? row.value : n;
        } else if (row.type === 'boolean') {
          globalVars[row.key] = row.value === 'true' || row.value === '1';
        } else {
          globalVars[row.key] = row.value;
        }
      } catch {
        globalVars[row.key] = row.value;
      }
    }

    // Phase 2: Create execution log
    const executionLogId = await createExecutionLog(id, request.user!.id, 'manual');

    // Execute workflow asynchronously
    const abortController = new AbortController();
    (request as any).workflowAbortController = abortController;

    executeWorkflow(
      { id, nodes, edges },
      {
        signal: abortController.signal,
        workflowInputs: inputs || {},
        envVars: envVars || {},
        globalVars,
        executionLogId,
        userId: request.user!.id,
      }
    )
      .then(async (result) => {
        const d = await getDb();
        if (result.status === 'completed') {
          await updateExecutionLog(executionLogId, 'completed');
        } else if (result.status === 'stopped') {
          await updateExecutionLog(executionLogId, 'stopped');
        } else {
          await updateExecutionLog(executionLogId, 'failed', result.error?.message);
        }
      })
      .catch(async (err: any) => {
        await updateExecutionLog(executionLogId, 'failed', err.message || String(err));
      });

    return reply.send({ executionId: executionLogId, status: 'running' });
  });

  app.get('/workflows/:id/executions', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = WorkflowIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;
    const db = await getDb();
    const rows = await db.query('SELECT * FROM execution_logs WHERE workflow_id = $1 ORDER BY started_at DESC', [id]);
    return reply.send({ data: rows.rows });
  });

  app.get('/workflows/:id/executions/:eid', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = ExecutionIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id, eid } = paramParsed.data;
    const db = await getDb();
    const row = await db.query('SELECT * FROM execution_logs WHERE id = $1 AND workflow_id = $2', [eid, id]);
    if (!row.rows || row.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
    const data = row.rows[0];
    if (data.error_message) {
      try { data.error = JSON.parse(data.error_message); } catch { data.error = { message: data.error_message }; }
    }
    // Load node execution logs
    const nodeLogs = await db.query('SELECT * FROM node_execution_logs WHERE execution_id = $1 ORDER BY started_at', [eid]);
    data.nodeLogs = nodeLogs.rows || [];
    return reply.send(data);
  });

  app.post('/workflows/:id/executions/:eid/cancel', { preHandler: [authenticate] }, async (request: AuthRequest, reply: FastifyReply) => {
    const paramParsed = ExecutionIdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: paramParsed.error.issues });
    }
    const { id, eid } = paramParsed.data;
    const abortController = (request as any).workflowAbortController;
    if (abortController) {
      abortController.abort();
    }
    const db = await getDb();
    await db.query('UPDATE execution_logs SET status = $1, ended_at = CURRENT_TIMESTAMP WHERE id = $2 AND workflow_id = $3', ['stopped', eid, id]);
    return reply.send({ success: true });
  });

}
