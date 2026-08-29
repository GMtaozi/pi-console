import { v4 as uuidv4 } from 'uuid';

/**
 * Phase 2 V4-pre: Execution logging infrastructure.
 * Writes execution and node execution logs to PostgreSQL.
 * All db imports are dynamic to avoid loading pg in test environments.
 */

async function getDb() {
  const { getDb: getDbImpl } = await import('../db');
  return getDbImpl();
}

export async function createExecutionLog(
  workflowId: string,
  userId: string,
  triggerType: 'manual' | 'webhook' | 'scheduled' | 'api' = 'manual'
): Promise<string> {
  const db = await getDb();
  const id = uuidv4();
  await db.query(
    `INSERT INTO execution_logs (id, workflow_id, user_id, status, trigger_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, workflowId, userId, 'running', triggerType]
  );
  return id;
}

export async function updateExecutionLog(
  executionId: string,
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped',
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE execution_logs
     SET status = $1, ended_at = CURRENT_TIMESTAMP,
         duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000,
         error_message = $2
     WHERE id = $3`,
    [status, errorMessage || null, executionId]
  );
}

export async function writeNodeExecutionLog(
  executionId: string,
  nodeId: string,
  nodeType: string,
  status: 'pending' | 'running' | 'success' | 'error' | 'retrying' | 'skipped',
  existingId?: string,
  errorMessage?: string
): Promise<string> {
  const db = await getDb();

  if (existingId) {
    await db.query(
      `UPDATE node_execution_logs
       SET status = $1, ended_at = CURRENT_TIMESTAMP,
           duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000,
           error_message = $2
       WHERE id = $3`,
      [status, errorMessage || null, existingId]
    );
    return existingId;
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO node_execution_logs (id, execution_id, node_id, node_type, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, executionId, nodeId, nodeType, status]
  );
  return id;
}

export async function writeExecutionLogDetail(
  nodeExecutionId: string,
  detailType: 'input' | 'output' | 'config' | 'error',
  content: any
): Promise<void> {
  const db = await getDb();
  const id = uuidv4();
  await db.query(
    `INSERT INTO execution_log_details (id, node_execution_id, detail_type, content)
     VALUES ($1, $2, $3, $4)`,
    [id, nodeExecutionId, detailType, JSON.stringify(content)]
  );
}

/**
 * Cleanup execution logs, keeping the most recent 100 executions per workflow.
 */
export async function cleanupExecutionLogs(): Promise<number> {
  const db = await getDb();
  const result = await db.query(
    `DELETE FROM execution_logs
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY started_at DESC) as rn
         FROM execution_logs
       ) t WHERE t.rn <= 100
     )`
  );
  return result.rowCount || 0;
}
