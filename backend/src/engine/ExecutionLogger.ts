import { v4 as uuidv4 } from 'uuid';
import safeStringify from 'fast-safe-stringify';

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
  content: unknown
): Promise<void> {
  const db = await getDb();
  const id = uuidv4();
  let serialized: string;
  try {
    serialized = safeStringify(content);
  } catch {
    serialized = '[Unserializable content]';
  }
  await db.query(
    `INSERT INTO execution_log_details (id, node_execution_id, detail_type, content)
     VALUES ($1, $2, $3, $4)`,
    [id, nodeExecutionId, detailType, serialized]
  );
}

/**
 * Write a full node execution snapshot (input, output, config).
 */
export async function writeNodeExecutionSnapshot(
  nodeExecutionId: string,
  snapshot: {
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    config?: Record<string, unknown>;
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

export interface ExecutionLogQueryOptions {
  status?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

export interface ExecutionLogResult {
  data: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Query execution logs with pagination and filtering.
 * Uses a read-only transaction for consistent count + data.
 */
export async function queryExecutionLogs(
  workflowId: string,
  options: ExecutionLogQueryOptions
): Promise<ExecutionLogResult> {
  const db = await getDb();
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(1, Math.min(100, options.pageSize || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['workflow_id = $1'];
  const params: (string | number)[] = [workflowId];
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

  // Use a read-only transaction for consistent count + data
  return db.transaction(async (client) => {
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS total FROM execution_logs WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const dataResult = await client.query(
      `SELECT * FROM execution_logs WHERE ${whereClause} ORDER BY started_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageSize, offset]
    );

    return {
      data: dataResult.rows || [],
      total,
      page,
      pageSize,
    };
  });
}

export interface NodeExecutionLog {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: string;
  status: string;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  error_message?: string;
  retry_count?: number;
  details?: Record<string, unknown>;
}

/**
 * Get node execution logs with details for a given execution.
 * Uses a single JOIN query instead of N+1 queries.
 */
export async function getNodeExecutionLogs(executionId: string): Promise<NodeExecutionLog[]> {
  const db = await getDb();
  const result = await db.query(
    `SELECT
       n.id,
       n.execution_id,
       n.node_id,
       n.node_type,
       n.status,
       n.started_at,
       n.ended_at,
       n.duration_ms,
       n.error_message,
       n.retry_count,
       d.detail_type,
       d.content
     FROM node_execution_logs n
     LEFT JOIN execution_log_details d ON d.node_execution_id = n.id
     WHERE n.execution_id = $1
     ORDER BY n.started_at`,
    [executionId]
  );

  // Aggregate details by node execution in application layer
  const nodeMap = new Map<string, NodeExecutionLog>();
  for (const row of result.rows || []) {
    if (!nodeMap.has(row.id)) {
      nodeMap.set(row.id, {
        id: row.id,
        execution_id: row.execution_id,
        node_id: row.node_id,
        node_type: row.node_type,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_ms: row.duration_ms,
        error_message: row.error_message,
        retry_count: row.retry_count,
        details: {},
      });
    }
    if (row.detail_type && row.content) {
      const node = nodeMap.get(row.id)!;
      try {
        node.details![row.detail_type] = JSON.parse(row.content);
      } catch {
        node.details![row.detail_type] = row.content;
      }
    }
  }

  return Array.from(nodeMap.values());
}
