import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { queryExecutionLogs, getNodeExecutionLogs } from '../engine/ExecutionLogger';

export async function executionRoutes(app: FastifyInstance) {
  /**
   * GET /api/executions/:workflowId
   * Query execution logs with pagination, status filter, time range.
   */
  app.get('/executions/:workflowId', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { workflowId } = request.params as any;
    const { status, startTime, endTime, page, pageSize } = request.query as any;

    const db = await getDb();
    // Verify workflow ownership
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1 AND user_id = $2', [workflowId, request.user!.id]);
    if (!wf.rows || wf.rows.length === 0) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    const result = await queryExecutionLogs(workflowId, {
      status,
      startTime,
      endTime,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });

    return reply.send(result);
  });

  /**
   * GET /api/executions/:executionId/nodes
   * Get node execution details for a given execution.
   */
  app.get('/executions/:executionId/nodes', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { executionId } = request.params as any;

    const db = await getDb();
    // Verify ownership via execution_logs -> workflows join
    const execRow = await db.query(
      `SELECT e.* FROM execution_logs e
       JOIN workflows w ON e.workflow_id = w.id
       WHERE e.id = $1 AND w.user_id = $2`,
      [executionId, request.user!.id]
    );
    if (!execRow.rows || execRow.rows.length === 0) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    const nodes = await getNodeExecutionLogs(executionId);
    return reply.send({ data: nodes });
  });

  /**
   * GET /api/executions/:executionId
   * Get a single execution log with its node logs.
   */
  app.get('/executions/detail/:executionId', { preHandler: [authenticate] }, async (request: AuthRequest, reply) => {
    const { executionId } = request.params as any;

    const db = await getDb();
    const execRow = await db.query(
      `SELECT e.* FROM execution_logs e
       JOIN workflows w ON e.workflow_id = w.id
       WHERE e.id = $1 AND w.user_id = $2`,
      [executionId, request.user!.id]
    );
    if (!execRow.rows || execRow.rows.length === 0) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    const data = execRow.rows[0];
    if (data.error_message) {
      try { data.error = JSON.parse(data.error_message); } catch { data.error = { message: data.error_message }; }
    }

    const nodes = await getNodeExecutionLogs(executionId);
    data.nodeLogs = nodes;
    return reply.send(data);
  });
}
