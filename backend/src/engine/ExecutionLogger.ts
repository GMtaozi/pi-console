import { v4 as uuidv4 } from 'uuid';

/**
 * Phase 2 V4: Execution logging infrastructure.
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

export async function updateNodeExecutionRetryCount(
  nodeExecutionId: string,
  retryCount: number
): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE node_execution_logs SET retry_count = $1 WHERE id = $2`,
    [retryCount, nodeExecutionId]
  );
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
 * Write a full node execution snapshot (input, output, config).
 */
export async function writeNodeExecutionSnapshot(
  nodeExecutionId: string,
  snapshot: {
    input?: Record<string, any>;
    output?: Record<string, any>;
    config?: Record<string, any>;
    error?: string;
  }
): Promise<void> {
  const db = await getDb();
  const inserts: Promise<void>[] = [];
  if (snapshot.input !== undefined) {
    inserts.push(
      writeExecutionLogDetail(nodeExecutionId, 'input', snapshot.input)
    );
  }
  if (snapshot.output !== undefined) {
    inserts.push(
      writeExecutionLogDetail(nodeExecutionId, 'output', snapshot.output)
    );
  }
  if (snapshot.config !== undefined) {
    inserts.push(
      writeExecutionLogDetail(nodeExecutionId, 'config', snapshot.config)
    );
  }
  if (snapshot.error !== undefined) {
    inserts.push(
      writeExecutionLogDetail(nodeExecutionId, 'error', snapshot.error)
    );
  }
  await Promise.all(inserts);
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

/**
 * Query execution logs with pagination and filtering.
 */
export async function queryExecutionLogs(
  workflowId: string,
  options: {
    status?: string;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
  const db = await getDb();
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['workflow_id = $1'];
  const params: any[] = [workflowId];
  let paramIdx = 2;

  if (options.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(options.status);
  }
  if (options.startTime) {
    conditions.push(`started_at >= $${paramIdx++}`);
    params.push(options.startTime);
  }
  if (options.endTime) {
    conditions.push(`started_at <= $${paramIdx++}`);
    params.push(options.endTime);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM execution_logs WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  const dataResult = await db.query(
    `SELECT * FROM execution_logs WHERE ${whereClause} ORDER BY started_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, pageSize, offset]
  );

  return {
    data: dataResult.rows || [],
    total,
    page,
    pageSize,
  };
}

/**
 * Get node execution logs with details for a given execution.
 */
export async function getNodeExecutionLogs(executionId: string): Promise<any[]> {
  const db = await getDb();
  const nodesResult = await db.query(
    `SELECT * FROM node_execution_logs WHERE execution_id = $1 ORDER BY started_at`,
    [executionId]
  );
  const nodes = nodesResult.rows || [];

  // Fetch details for each node execution
  const enriched = await Promise.all(
    nodes.map(async (node: any) => {
      const detailsResult = await db.query(
        `SELECT detail_type, content FROM execution_log_details WHERE node_execution_id = $1`,
        [node.id]
      );
      const details: Record<string, any> = {};
      for (const d of detailsResult.rows || []) {
        try {
          details[d.detail_type] = JSON.parse(d.content);
        } catch {
          details[d.detail_type] = d.content;
        }
      }
      return { ...node, details };
    })
  );

  return enriched;
}
