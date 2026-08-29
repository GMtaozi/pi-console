import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext, Workflow, WorkflowNode as WFNode, WorkflowEdge } from '../types';
import { ExecutionError } from '../ExecutionError';

export interface SubWorkflowNodeConfig {
  workflowId?: string;
}

/**
 * Tracks the call stack for sub-workflow execution to detect cycles.
 */
const subWorkflowCallStack = new Set<string>();
const MAX_DEPTH = 10;

export class SubWorkflowNodeExecutor implements NodeExecutor {
  type = 'subWorkflow';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    _context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: SubWorkflowNodeConfig = node.data || {};
    const workflowId = config.workflowId;

    if (!workflowId) {
      throw new ExecutionError('Sub-workflow node requires a workflowId', { nodeId: node.id });
    }

    // Cycle detection at runtime
    if (subWorkflowCallStack.has(workflowId)) {
      throw new ExecutionError(
        `Circular sub-workflow reference detected: ${workflowId} is already in the call stack`,
        { nodeId: node.id }
      );
    }

    if (subWorkflowCallStack.size >= MAX_DEPTH) {
      throw new ExecutionError(
        `Maximum sub-workflow nesting depth (${MAX_DEPTH}) exceeded`,
        { nodeId: node.id }
      );
    }

    // Dynamic import db to avoid loading pg in test environments
    const { getDb } = await import('../../db');
    const db = await getDb();

    const wf = await db.query('SELECT * FROM workflows WHERE id = $1', [workflowId]);
    if (!wf.rows || wf.rows.length === 0) {
      throw new ExecutionError(`Sub-workflow '${workflowId}' not found`, { nodeId: node.id });
    }

    const dbNodes = await db.query('SELECT * FROM workflow_nodes WHERE workflow_id = $1', [workflowId]);
    const dbEdges = await db.query('SELECT * FROM workflow_edges WHERE workflow_id = $1', [workflowId]);

    const nodes: WFNode[] = (dbNodes.rows || []).map((n: any) => ({
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

    const subWorkflow: Workflow = {
      id: workflowId,
      nodes,
      edges,
    };

    // Dynamically import executeWorkflow to avoid circular dependency
    const { executeWorkflow } = await import('../executeWorkflow');

    subWorkflowCallStack.add(workflowId);
    try {
      const result = await executeWorkflow(subWorkflow, {
        workflowInputs: inputs,
      });

      if (result.status === 'failed') {
        throw new ExecutionError(
          `Sub-workflow '${workflowId}' failed: ${result.error?.message || 'Unknown error'}`,
          { nodeId: node.id }
        );
      }

      return {
        output: result.finalOutput,
        status: result.status,
        completedNodes: result.completedNodes,
      };
    } finally {
      subWorkflowCallStack.delete(workflowId);
    }
  }
}

/**
 * DFS cycle detection for sub-workflow references.
 * Used when saving a workflow to prevent circular references.
 */
export async function detectSubWorkflowCycle(
  workflowId: string,
  visited = new Set<string>(),
  stack = new Set<string>()
): Promise<string[] | null> {
  if (stack.has(workflowId)) {
    return [workflowId];
  }
  if (visited.has(workflowId)) {
    return null;
  }

  visited.add(workflowId);
  stack.add(workflowId);

  // Dynamic import db to avoid loading pg in test environments
  const { getDb } = await import('../../db');
  const db = await getDb();
  const dbNodes = await db.query(
    "SELECT data FROM workflow_nodes WHERE workflow_id = $1 AND type = 'subWorkflow'",
    [workflowId]
  );

  for (const row of dbNodes.rows || []) {
    const data = row.data ? JSON.parse(row.data) : {};
    const subId = data.workflowId;
    if (subId) {
      const cycle = await detectSubWorkflowCycle(subId, visited, stack);
      if (cycle) {
        return [workflowId, ...cycle];
      }
    }
  }

  stack.delete(workflowId);
  return null;
}
