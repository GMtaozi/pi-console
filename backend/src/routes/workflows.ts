import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { executeWorkflow } from '../engine/executeWorkflow';
import { WorkflowNode, WorkflowEdge } from '../engine/types';
import { detectSubWorkflowCycle } from '../engine/executors/SubWorkflowNodeExecutor';
import { createExecutionLog, updateExecutionLog, getNodeExecutionLogs } from '../engine/ExecutionLogger';

interface WorkflowRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowNodeRow {
  id: string;
  workflow_id: string;
  node_id: string;
  type: string;
  label: string;
  position_x: number;
  position_y: number;
  data: string;
  created_at: string;
}

interface WorkflowEdgeRow {
  id: string;
  workflow_id: string;
  edge_id: string;
  source: string;
  target: string;
  label: string;
  created_at: string;
}

interface ExecuteBody {
  inputs?: Record<string, unknown>;
  envVars?: Record<string, string>;
  environment?: string;
}

interface UpdateWorkflowBody {
  name?: string;
  description?: string;
  status?: string;
  nodes?: Array<{ id: string; type: string; label?: string; position?: { x?: number; y?: number }; data?: Record<string, unknown> }>;
  edges?: Array<{ id: string; source: string; target: string; label?: string }>;
}

export async function workflowRoutes(app: FastifyInstance) {
  app.get('/workflows', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const db = await getDb();
    const rows = await db.query('SELECT * FROM workflows WHERE user_id = $1 ORDER BY updated_at DESC', [request.user!.id]);
    return reply.send({ data: rows.rows });
  });

  app.post('/workflows', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { name, description } = request.body as { name: string; description?: string };
    const db = await getDb();
    const id = uuidv4();
    await db.query('INSERT INTO workflows (id, user_id, name, description) VALUES ($1, $2, $3, $4)', [id, request.user!.id, name, description || '']);
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1', [id]);
    return reply.status(201).send(wf.rows[0]);
  });

  app.get('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string; eid?: string };
    const db = await getDb();
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if (!wf.rows || wf.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
    const nodes = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = $1', [id]);
    const edges = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = $1', [id]);
    return reply.send({ ...wf.rows[0], nodes: nodes.rows, edges: edges.rows });
  });

  app.put('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const { name, description, status, nodes, edges } = request.body as UpdateWorkflowBody;
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
        if (n.type === 'subWorkflow' && n.data?.workflowId) {
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
        const nid = uuidv4();
        await db.query(
          'INSERT INTO workflow_nodes (id, workflow_id, node_id, type, label, position_x, position_y, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [nid, id, n.id, n.type, n.label || '', n.position?.x || 0, n.position?.y || 0, JSON.stringify(n.data || {})]
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

  app.delete('/workflows/:id', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    await db.query('DELETE FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    return reply.send({ success: true });
  });

  // ========== REAL WORKFLOW EXECUTION ==========
  app.post('/workflows/:id/execute', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const { inputs, envVars, environment = 'development' } = request.body as ExecuteBody;
    const db = await getDb();
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [id, request.user!.id]);
    if (!wf.rows || wf.rows.length === 0) return reply.status(404).send({ error: 'Not found' });

    // Load nodes and edges
    const dbNodes = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = $1', [id]);
    const dbEdges = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = $1', [id]);

    const nodes: WorkflowNode[] = (dbNodes.rows || []).map((n: WorkflowNodeRow) => ({
      id: n.node_id,
      type: n.type,
      label: n.label,
      position: { x: n.position_x, y: n.position_y },
      data: n.data ? JSON.parse(n.data) : {},
    }));

    const edges: WorkflowEdge[] = (dbEdges.rows || []).map((e: WorkflowEdgeRow) => ({
      id: e.edge_id,
      source: e.source,
      target: e.target,
      label: e.label,
    }));

    // Phase 2: Load global variables for this user (respect selected environment)
    const globalVarsRows = await db.query(
      'SELECT key, value, type FROM global_variables WHERE user_id = $1 AND environment = $2',
      [request.user!.id, environment]
    );
    const globalVars: Record<string, unknown> = {};
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
    (request as unknown as Record<string, unknown>).workflowAbortController = abortController;

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
      .catch(async (err: unknown) => {
        await updateExecutionLog(executionLogId, 'failed', err instanceof Error ? err.message : String(err));
      });

    return reply.send({ executionId: executionLogId, status: 'running' });
  });

  app.get('/workflows/:id/executions', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const db = await getDb();
    const rows = await db.query('SELECT * FROM execution_logs WHERE workflow_id = $1 ORDER BY started_at DESC', [id]);
    return reply.send({ data: rows.rows });
  });

  app.get('/workflows/:id/executions/:eid', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id, eid } = request.params as { id: string; eid: string };
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

  // Export execution log as JSON or Markdown
  app.get('/workflows/:id/executions/:eid/export', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id, eid } = request.params as { id: string; eid: string };
    const { format = 'json' } = request.query as { format?: string };
    const db = await getDb();

    const row = await db.query('SELECT * FROM execution_logs WHERE id = $1 AND workflow_id = $2', [eid, id]);
    if (!row.rows || row.rows.length === 0) return reply.status(404).send({ error: 'Not found' });

    const execution = row.rows[0];
    const nodeLogs = await getNodeExecutionLogs(eid);

    if (format === 'markdown') {
      const markdown = buildExecutionMarkdown(execution, nodeLogs);
      reply.header('Content-Type', 'text/markdown; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="execution-${eid}.md"`);
      return reply.send(markdown);
    }

    // JSON format (default)
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="execution-${eid}.json"`);
    return reply.send({ ...execution, nodeLogs });
  });

  app.post('/workflows/:id/executions/:eid/cancel', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { id, eid } = request.params as { id: string; eid: string };
    const abortController = (request as unknown as Record<string, unknown>).workflowAbortController as AbortController | undefined;
    if (abortController) {
      abortController.abort();
    }
    const db = await getDb();
    await db.query('UPDATE execution_logs SET status = $1, ended_at = CURRENT_TIMESTAMP WHERE id = $2 AND workflow_id = $3', ['stopped', eid, id]);
    return reply.send({ success: true });
  });

}

function buildExecutionMarkdown(execution: unknown, nodeLogs: unknown[]): string {
  const ex = execution as Record<string, unknown>;
  const lines: string[] = [];
  lines.push('# Execution Report');
  lines.push('');
  lines.push(`- **Execution ID**: ${ex.id}`);
  lines.push(`- **Workflow ID**: ${ex.workflow_id}`);
  lines.push(`- **Status**: ${ex.status}`);
  lines.push(`- **Trigger Type**: ${ex.trigger_type || 'manual'}`);
  lines.push(`- **Started At**: ${ex.started_at}`);
  lines.push(`- **Ended At**: ${ex.ended_at || 'N/A'}`);
  if (ex.duration_ms) {
    lines.push(`- **Duration**: ${ex.duration_ms}ms`);
  }
  lines.push('');

  if (ex.error_message) {
    lines.push('## Error');
    lines.push('');
    lines.push('```');
    lines.push(String(ex.error_message));
    lines.push('```');
    lines.push('');
  }

  lines.push(`## Node Execution Logs (${nodeLogs.length})`);
  lines.push('');

  for (const log of nodeLogs) {
    const l = log as Record<string, unknown>;
    lines.push(`### ${l.node_id} (${l.node_type})`);
    lines.push('');
    lines.push(`- **Status**: ${l.status}`);
    lines.push(`- **Started At**: ${l.started_at}`);
    if (l.ended_at) lines.push(`- **Ended At**: ${l.ended_at}`);
    if (l.duration_ms) lines.push(`- **Duration**: ${l.duration_ms}ms`);
    if (l.retry_count) lines.push(`- **Retry Count**: ${l.retry_count}`);
    if (l.error_message) lines.push(`- **Error**: ${l.error_message}`);

    const details = l.details as Record<string, unknown> | undefined;
    if (details) {
      if (details.input) {
        lines.push('- **Input**:');
        lines.push('```json');
        try {
          lines.push(JSON.stringify(details.input, null, 2));
        } catch {
          lines.push(String(details.input));
        }
        lines.push('```');
      }
      if (details.output) {
        lines.push('- **Output**:');
        lines.push('```json');
        try {
          lines.push(JSON.stringify(details.output, null, 2));
        } catch {
          lines.push(String(details.output));
        }
        lines.push('```');
      }
      if (details.config) {
        lines.push('- **Config**:');
        lines.push('```json');
        try {
          lines.push(JSON.stringify(details.config, null, 2));
        } catch {
          lines.push(String(details.config));
        }
        lines.push('```');
      }
      if (details.error) {
        lines.push('- **Error Detail**:');
        lines.push('```');
        lines.push(String(details.error));
        lines.push('```');
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
