import { Workflow, WorkflowNode, ExecutionResult } from './types';
import { ExecutionError } from './ExecutionError';
import { ExecutionContextImpl } from './ExecutionContext';
import { buildDAG } from './DAGBuilder';
import { topologicalSort } from './topologicalSort';
import { resolveInputs } from './resolveInputs';
import { NodeExecutorRegistry } from './NodeExecutorRegistry';
import { StartNodeExecutor } from './executors/StartNodeExecutor';
import { EndNodeExecutor } from './executors/EndNodeExecutor';
import { LLMNodeExecutor } from './executors/LLMNodeExecutor';
import { ToolNodeExecutor } from './executors/ToolNodeExecutor';

const DEFAULT_TIMEOUT_MS = 30000;

// Ensure built-in executors are registered
function ensureBuiltInExecutors(): void {
  const existing = NodeExecutorRegistry.list();
  if (!existing.includes('start')) NodeExecutorRegistry.register(new StartNodeExecutor());
  if (!existing.includes('end')) NodeExecutorRegistry.register(new EndNodeExecutor());
  if (!existing.includes('llm')) NodeExecutorRegistry.register(new LLMNodeExecutor());
  if (!existing.includes('tool')) NodeExecutorRegistry.register(new ToolNodeExecutor());
}

function withTimeout<T>(promise: Promise<T>, ms: number, nodeId: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ExecutionError(`Node '${nodeId}' execution timed out after ${ms}ms`, { nodeId }));
    }, ms);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function executeWorkflow(
  workflow: Workflow,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<ExecutionResult> {
  ensureBuiltInExecutors();

  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // Edge cases: empty workflow
  if (nodes.length === 0) {
    return {
      status: 'completed',
      outputs: new Map(),
      completedNodes: [],
    };
  }

  // Edge case: single node
  if (nodes.length === 1) {
    const node = nodes[0];
    const context = new ExecutionContextImpl();
    const executor = NodeExecutorRegistry.get(node.type);
    if (!executor) {
      return {
        status: 'failed',
        outputs: new Map(),
        error: { message: `Unknown node type: ${node.type}`, nodeId: node.id },
        completedNodes: [],
      };
    }
    try {
      const result = await executor.execute(node, {}, context);
      context.setOutput(node.id, result);
      return {
        status: 'completed',
        outputs: context.outputs,
        finalOutput: result,
        completedNodes: [node.id],
      };
    } catch (err: any) {
      return {
        status: 'failed',
        outputs: context.outputs,
        error: {
          message: err.message || String(err),
          nodeId: node.id,
          originalError: err,
        },
        completedNodes: [],
      };
    }
  }

  // Build DAG and topological sort
  let dag;
  let order: string[];
  try {
    dag = buildDAG(nodes, edges);
    order = topologicalSort(dag, nodes);
  } catch (err: any) {
    return {
      status: 'failed',
      outputs: new Map(),
      error: {
        message: err.message || String(err),
        nodeId: err instanceof ExecutionError ? err.nodeId : undefined,
        originalError: err,
      },
      completedNodes: [],
    };
  }
  const context = new ExecutionContextImpl();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = options?.signal;

  for (const nodeId of order) {
    // Check abort signal
    if (signal?.aborted) {
      context.status = 'stopped';
      return {
        status: 'stopped',
        outputs: context.outputs,
        error: { message: 'Workflow execution was cancelled', nodeId },
        completedNodes: Array.from(context.outputs.keys()),
      };
    }

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) {
      context.status = 'failed';
      return {
        status: 'failed',
        outputs: context.outputs,
        error: { message: `Node '${nodeId}' not found in workflow definition`, nodeId },
        completedNodes: Array.from(context.outputs.keys()),
      };
    }

    context.currentNodeId = nodeId;

    try {
      const inputs = resolveInputs(nodeId, dag, context);
      const executor = NodeExecutorRegistry.get(node.type);
      if (!executor) {
        throw new ExecutionError(`Unknown node type: ${node.type}`, { nodeId });
      }

      const result = await withTimeout(
        executor.execute(node, inputs, context),
        timeoutMs,
        nodeId
      );
      context.setOutput(nodeId, result);
    } catch (err: any) {
      context.status = 'failed';
      const error = err instanceof ExecutionError
        ? err
        : new ExecutionError(`Node '${nodeId}' failed: ${err.message || String(err)}`, {
            nodeId,
            originalError: err,
          });
      context.error = error;
      return {
        status: 'failed',
        error: error.toJSON(),
        outputs: context.outputs,
        completedNodes: Array.from(context.outputs.keys()),
      };
    }
  }

  context.status = 'completed';
  return {
    status: 'completed',
    outputs: context.outputs,
    finalOutput: context.getOutput(order[order.length - 1]),
    completedNodes: Array.from(context.outputs.keys()),
  };
}
