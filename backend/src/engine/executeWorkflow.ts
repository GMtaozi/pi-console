import { Workflow, WorkflowNode, ExecutionResult, DAG } from './types';
import { ExecutionError } from './ExecutionError';
import { ExecutionContextImpl } from './ExecutionContext';
import { buildDAG } from './DAGBuilder';
import { topologicalSort } from './topologicalSort';
import { resolveInputs } from './resolveInputs';
import { NodeExecutorRegistry } from './NodeExecutorRegistry';
import { NodeRegistry } from './NodeRegistry';
import { TypeConverter } from './TypeConverter';
import { VariableType } from './VariableResolver';
import { StartNodeExecutor } from './executors/StartNodeExecutor';
import { EndNodeExecutor } from './executors/EndNodeExecutor';
import { LLMNodeExecutor } from './executors/LLMNodeExecutor';
import { ToolNodeExecutor } from './executors/ToolNodeExecutor';
import { ConditionNodeExecutor } from './executors/ConditionNodeExecutor';
import { ParallelNodeExecutor, JoinNodeExecutor } from './executors/ParallelNodeExecutor';
import { HTTPNodeExecutor } from './executors/HTTPNodeExecutor';
import { SetVariableNodeExecutor } from './executors/SetVariableNodeExecutor';
import { SubWorkflowNodeExecutor } from './executors/SubWorkflowNodeExecutor';
import {
  writeNodeExecutionLog,
  writeNodeExecutionSnapshot,
  updateNodeExecutionRetryCount,
} from './ExecutionLogger';
import { RuntimeStateSnapshot, NodeState } from '../websocket/types';

const DEFAULT_TIMEOUT_MS = 30000;

// Ensure built-in executors are registered in both registries
function ensureBuiltInExecutors(): void {
  const existing = NodeExecutorRegistry.list();
  const executors = [
    new StartNodeExecutor(),
    new EndNodeExecutor(),
    new LLMNodeExecutor(),
    new ToolNodeExecutor(),
    new ConditionNodeExecutor(),
    new ParallelNodeExecutor(),
    new JoinNodeExecutor(),
    new HTTPNodeExecutor(),
    new SetVariableNodeExecutor(),
    new SubWorkflowNodeExecutor(),
  ];

  for (const executor of executors) {
    if (!existing.includes(executor.type)) {
      NodeExecutorRegistry.register(executor);
    }
    if (!NodeRegistry.list().includes(executor.type)) {
      NodeRegistry.register(getNodeMetadata(executor.type), executor);
    }
  }
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

export interface RetryConfig {
  maxRetries?: number; // 1-5
  retryInterval?: number; // milliseconds
  backoffType?: 'fixed' | 'exponential';
}

export interface ExecutionOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Phase 2: workflow inputs for variable resolution */
  workflowInputs?: Record<string, any>;
  /** Phase 2: environment variables */
  envVars?: Record<string, string>;
  /** Phase 2: global variables */
  globalVars?: Record<string, any>;
  /** Phase 2: execution log ID for logging */
  executionLogId?: string;
  /** Phase 2: user ID for logging */
  userId?: string;
  /** Phase 2 Batch 2: execution mode */
  mode?: 'normal' | 'step' | 'breakpoint';
  /** Phase 2 Batch 2: start from arbitrary node */
  startNodeId?: string;
  /** Phase 2 Batch 2: breakpoint configurations */
  breakpoints?: Record<string, { nodeId: string; condition?: string }>;
  /** Phase 2 Batch 2: callback when a node starts */
  onNodeStart?: (nodeId: string, nodeType: string) => void;
  /** Phase 2 Batch 2: callback when a node completes */
  onNodeComplete?: (nodeId: string, nodeType: string, output: any, durationMs: number) => void;
  /** Phase 2 Batch 2: callback when execution is paused */
  onPaused?: (reason: 'step' | 'breakpoint' | 'eval', snapshot: RuntimeStateSnapshot) => Promise<void>;
}

export async function executeWorkflow(
  workflow: Workflow,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  ensureBuiltInExecutors();

  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const executionLogId = options?.executionLogId;
  const userId = options?.userId;
  const mode = options?.mode || 'normal';
  const startNodeId = options?.startNodeId;
  const breakpoints = options?.breakpoints || {};

  // Edge cases: empty workflow
  if (nodes.length === 0) {
    return {
      status: 'completed',
      outputs: new Map(),
      completedNodes: [],
    };
  }

  // Initialize execution context with Phase 2 enhancements
  const context = new ExecutionContextImpl();
  if (options?.workflowInputs) {
    context.initializeWorkflowInputs(options.workflowInputs);
  }
  if (options?.envVars) {
    context.setEnvVariables(options.envVars);
  }
  if (options?.globalVars) {
    for (const [key, value] of Object.entries(options.globalVars)) {
      context.setGlobalVariable(key, { value, type: typeof value as any });
    }
  }

  // Edge case: single node
  if (nodes.length === 1) {
    const node = nodes[0];
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
      if (options?.signal?.aborted) {
        context.status = 'stopped';
        if (executionLogId) {
          await updateExecutionLogStatus(executionLogId, 'stopped');
        }
        return { status: 'stopped', outputs: context.outputs, error: { message: 'Workflow execution was cancelled', nodeId: node.id }, completedNodes: [] };
      }
      const nodeLogId = executionLogId
        ? await writeNodeExecutionLog(executionLogId, node.id, node.type, 'running')
        : undefined;
      const startTime = Date.now();
      options?.onNodeStart?.(node.id, node.type);

      validateNodeInputs(node, {});
      const result = await executeNodeWithRetry(
        node,
        {},
        context,
        options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        options?.signal,
        node.data || {}
      );

      context.setOutput(node.id, result);
      const durationMs = Date.now() - startTime;
      options?.onNodeComplete?.(node.id, node.type, result, durationMs);

      if (nodeLogId && executionLogId) {
        await writeNodeExecutionLog(executionLogId, node.id, node.type, 'success', nodeLogId);
        await writeNodeExecutionSnapshot(nodeLogId, {
          input: {},
          output: result,
          config: node.data || {},
        });
      }
      return {
        status: 'completed',
        outputs: context.outputs,
        finalOutput: result,
        completedNodes: [node.id],
      };
    } catch (err: any) {
      if (executionLogId) {
        await writeNodeExecutionLog(executionLogId, node.id, node.type, 'error', undefined, err.message);
      }
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
  let dag: DAG;
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

  // If startNodeId is specified, filter order to start from that node
  // while preserving topological order
  if (startNodeId) {
    const startIndex = order.indexOf(startNodeId);
    if (startIndex === -1) {
      throw new ExecutionError(
        `Start node '${startNodeId}' not found in workflow`,
        { nodeId: startNodeId }
      );
    }
    if (startIndex > 0) {
      // Mark upstream nodes as completed; their outputs should be provided via context
      for (let i = 0; i < startIndex; i++) {
        const upstreamId = order[i];
        if (!context.outputs.has(upstreamId)) {
          // If upstream output is missing, we cannot proceed
          return {
            status: 'failed',
            outputs: context.outputs,
            error: {
              message: `Start node '${startNodeId}' requires upstream output from '${upstreamId}' which is not available`,
              nodeId: startNodeId,
            },
            completedNodes: Array.from(context.outputs.keys()),
          };
        }
      }
      order = order.slice(startIndex);
    }
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = options?.signal;
  const completedNodes: string[] = [];
  const skippedNodes = new Set<string>();
  const parallelHandled = new Set<string>();

  for (const nodeId of order) {
    // Check abort signal
    if (signal?.aborted) {
      context.status = 'stopped';
      if (executionLogId) {
        await updateExecutionLogStatus(executionLogId, 'stopped');
      }
      return {
        status: 'stopped',
        outputs: context.outputs,
        error: { message: 'Workflow execution was cancelled', nodeId },
        completedNodes: Array.from(context.outputs.keys()),
      };
    }

    // Skip nodes marked as skipped (from condition branches)
    if (skippedNodes.has(nodeId)) {
      if (executionLogId) {
        const skipLogId = await writeNodeExecutionLog(executionLogId, nodeId, nodes.find((n) => n.id === nodeId)?.type || 'unknown', 'skipped');
        await writeNodeExecutionSnapshot(skipLogId, { config: nodes.find((n) => n.id === nodeId)?.data || {} });
      }
      continue;
    }

    // Skip nodes already handled by parallel execution
    if (parallelHandled.has(nodeId)) {
      continue;
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
    context.prevNodeId = completedNodes.length > 0 ? completedNodes[completedNodes.length - 1] : undefined;

    // Check breakpoint before execution
    const bp = breakpoints[nodeId];
    if (bp && mode === 'breakpoint') {
      const shouldPause = await evaluateBreakpointCondition(bp.condition, context, node);
      if (shouldPause && options?.onPaused) {
        const snapshot = buildRuntimeStateSnapshot(executionLogId || workflow.id, nodeId, context, nodes, completedNodes, skippedNodes);
        await options.onPaused('breakpoint', snapshot);
      }
    }

    // Step mode: pause before each node execution
    if (mode === 'step' && options?.onPaused) {
      const snapshot = buildRuntimeStateSnapshot(executionLogId || workflow.id, nodeId, context, nodes, completedNodes, skippedNodes);
      await options.onPaused('step', snapshot);
    }

    // Write node execution log
    const nodeLogId = executionLogId
      ? await writeNodeExecutionLog(executionLogId, node.id, node.type, 'running')
      : undefined;

    const nodeStartTime = Date.now();
    options?.onNodeStart?.(node.id, node.type);

    try {
      const inputs = resolveInputs(nodeId, dag, context);
      const executor = NodeExecutorRegistry.get(node.type);
      if (!executor) {
        throw new ExecutionError(`Unknown node type: ${node.type}`, { nodeId });
      }

      // Validate inputs against node metadata before execution
      validateNodeInputs(node, inputs);

      // Write input snapshot
      if (nodeLogId) {
        await writeNodeExecutionSnapshot(nodeLogId, {
          input: inputs,
          config: node.data || {},
        });
      }

      const result = await executeNodeWithRetry(
        node,
        inputs,
        context,
        timeoutMs,
        signal,
        node.data || {}
      );

      context.setOutput(nodeId, result);
      completedNodes.push(nodeId);
      const durationMs = Date.now() - nodeStartTime;
      options?.onNodeComplete?.(node.id, node.type, result, durationMs);

      // Update node log
      if (nodeLogId && executionLogId) {
        await writeNodeExecutionLog(executionLogId, node.id, node.type, 'success', nodeLogId);
        await writeNodeExecutionSnapshot(nodeLogId, {
          output: result,
        });
      }

      // Phase 2: Condition routing - mark False branch nodes as skipped
      if (node.type === 'condition' && typeof result.result === 'boolean') {
        const conditionResult = result.result as boolean;
        const outgoingEdges = dag.adjacency.get(nodeId) || [];
        for (const targetId of outgoingEdges) {
          const edge = edges.find((e) => e.source === nodeId && e.target === targetId);
          if (edge) {
            const label = (edge.label || '').toLowerCase();
            if (conditionResult && label === 'false') {
              markBranchSkipped(targetId, dag, skippedNodes);
            } else if (!conditionResult && label === 'true') {
              markBranchSkipped(targetId, dag, skippedNodes);
            }
          }
        }
      }

      // Phase 2: Parallel execution - execute branches concurrently
      if (node.type === 'parallel') {
        const joinId = findJoinNode(nodeId, dag, nodes);
        const branchStarts = dag.adjacency.get(nodeId) || [];
        if (joinId && branchStarts.length > 0) {
          const branchNodeLists = branchStarts.map((startId) =>
            collectBranchNodes(startId, joinId, dag)
          );

          // Execute all branches concurrently
          await Promise.all(
            branchNodeLists.map(async (branchNodes) => {
              for (const bnId of branchNodes) {
                if (skippedNodes.has(bnId)) continue;
                if (signal?.aborted) break;
                const bn = nodes.find((n) => n.id === bnId);
                if (!bn) continue;

                context.currentNodeId = bnId;
                context.prevNodeId = completedNodes.length > 0 ? completedNodes[completedNodes.length - 1] : undefined;

                // Check breakpoint for branch node
                const bnp = breakpoints[bnId];
                if (bnp && mode === 'breakpoint') {
                  const shouldPause = await evaluateBreakpointCondition(bnp.condition, context, bn);
                  if (shouldPause && options?.onPaused) {
                    const snapshot = buildRuntimeStateSnapshot(executionLogId || workflow.id, bnId, context, nodes, completedNodes, skippedNodes);
                    await options.onPaused('breakpoint', snapshot);
                  }
                }
                if (mode === 'step' && options?.onPaused) {
                  const snapshot = buildRuntimeStateSnapshot(executionLogId || workflow.id, bnId, context, nodes, completedNodes, skippedNodes);
                  await options.onPaused('step', snapshot);
                }

                const bnLogId = executionLogId
                  ? await writeNodeExecutionLog(executionLogId, bn.id, bn.type, 'running')
                  : undefined;
                const bnStartTime = Date.now();
                options?.onNodeStart?.(bn.id, bn.type);

                try {
                  const bnInputs = resolveInputs(bnId, dag, context);
                  const bnExecutor = NodeExecutorRegistry.get(bn.type);
                  if (!bnExecutor) {
                    throw new ExecutionError(`Unknown node type: ${bn.type}`, { nodeId: bnId });
                  }

                  // Validate branch node inputs
                  validateNodeInputs(bn, bnInputs);

                  if (bnLogId) {
                    await writeNodeExecutionSnapshot(bnLogId, {
                      input: bnInputs,
                      config: bn.data || {},
                    });
                  }

                  const bnResult = await executeNodeWithRetry(
                    bn,
                    bnInputs,
                    context,
                    timeoutMs,
                    signal,
                    bn.data || {}
                  );
                  context.setOutput(bnId, bnResult);
                  completedNodes.push(bnId);
                  const bnDurationMs = Date.now() - bnStartTime;
                  options?.onNodeComplete?.(bn.id, bn.type, bnResult, bnDurationMs);

                  if (bnLogId && executionLogId) {
                    await writeNodeExecutionLog(executionLogId, bn.id, bn.type, 'success', bnLogId);
                    await writeNodeExecutionSnapshot(bnLogId, { output: bnResult });
                  }
                  // Condition routing inside branch
                  if (bn.type === 'condition' && typeof bnResult.result === 'boolean') {
                    const cr = bnResult.result as boolean;
                    const oe = dag.adjacency.get(bnId) || [];
                    for (const tid of oe) {
                      const edge = edges.find((e) => e.source === bnId && e.target === tid);
                      if (edge) {
                        const lbl = (edge.label || '').toLowerCase();
                        if (cr && lbl === 'false') markBranchSkipped(tid, dag, skippedNodes);
                        else if (!cr && lbl === 'true') markBranchSkipped(tid, dag, skippedNodes);
                      }
                    }
                  }
                } catch (bnErr: any) {
                  context.status = 'failed';
                  const bnError = bnErr instanceof ExecutionError
                    ? bnErr
                    : new ExecutionError(`Node '${bnId}' failed: ${bnErr.message || String(bnErr)}`, {
                        nodeId: bnId,
                        originalError: bnErr,
                      });
                  context.error = bnError;
                  if (bnLogId && executionLogId) {
                    await writeNodeExecutionLog(executionLogId, bn.id, bn.type, 'error', bnLogId, bnErr.message);
                    await writeNodeExecutionSnapshot(bnLogId, { error: bnErr.message });
                  }
                  throw bnError;
                }
              }
            })
          );

          // Mark branch nodes as handled so main loop skips them
          for (const branchNodes of branchNodeLists) {
            for (const bnId of branchNodes) {
              parallelHandled.add(bnId);
            }
          }
        }
      }
    } catch (err: any) {
      context.status = 'failed';
      const error = err instanceof ExecutionError
        ? err
        : new ExecutionError(`Node '${nodeId}' failed: ${err.message || String(err)}`, {
            nodeId,
            originalError: err,
          });
      context.error = error;

      if (nodeLogId && executionLogId) {
        await writeNodeExecutionLog(executionLogId, node.id, node.type, 'error', nodeLogId, err.message);
        await writeNodeExecutionSnapshot(nodeLogId, { error: err.message });
      }

      if (executionLogId) {
        await updateExecutionLogStatus(executionLogId, 'failed', err.message);
      }

      return {
        status: 'failed',
        error: error.toJSON ? error.toJSON() : { message: error.message, nodeId },
        outputs: context.outputs,
        completedNodes: Array.from(context.outputs.keys()),
      };
    }
  }

  context.status = 'completed';
  if (executionLogId) {
    await updateExecutionLogStatus(executionLogId, 'completed');
  }

  return {
    status: 'completed',
    outputs: context.outputs,
    finalOutput: context.getOutput(order[order.length - 1]),
    completedNodes: Array.from(context.outputs.keys()),
  };
}

/**
 * Validate resolved inputs against node metadata type definitions.
 * Throws ExecutionError if a required input is missing or if the type is incompatible.
 */
function validateNodeInputs(
  node: WorkflowNode,
  inputs: Record<string, any>
): void {
  const metadata = NodeRegistry.getMetadata(node.type);
  if (!metadata || !metadata.inputs || metadata.inputs.length === 0) {
    return; // No metadata inputs to validate against
  }

  const inputKeys = Object.keys(inputs);

  for (const port of metadata.inputs) {
    const value = inputs[port.name];

    // Handle the case where resolveInputs uses 'default' as the key
    // when there is a single metadata input and a single resolved input
    let resolvedValue = value;
    if (resolvedValue === undefined && inputKeys.length === 1 && metadata.inputs.length === 1) {
      resolvedValue = inputs[inputKeys[0]];
    }

    if (resolvedValue === undefined) {
      if (port.required) {
        throw new ExecutionError(
          `Node '${node.id}' (${node.type}) requires input '${port.name}' of type '${port.type}', but it was not provided`,
          { nodeId: node.id }
        );
      }
      continue;
    }

    const actualType = TypeConverter.inferType(resolvedValue);
    if (!TypeConverter.isCompatible(actualType, port.type as VariableType)) {
      throw new ExecutionError(
        `Node '${node.id}' (${node.type}) input '${port.name}' type mismatch: expected '${port.type}', got '${actualType}' (value: ${String(resolvedValue).slice(0, 100)})`,
        { nodeId: node.id }
      );
    }
  }
}

/**
 * Execute a node with retry logic.
 */
async function executeNodeWithRetry(
  node: WorkflowNode,
  inputs: Record<string, any>,
  context: ExecutionContextImpl,
  timeoutMs: number,
  signal?: AbortSignal,
  nodeData?: Record<string, any>
): Promise<Record<string, any>> {
  const retryConfig: RetryConfig = {
    maxRetries: Math.min(5, Math.max(0, nodeData?.maxRetries ?? 0)),
    retryInterval: nodeData?.retryInterval ?? 1000,
    backoffType: nodeData?.backoffType ?? 'fixed',
  };

  const maxRetries = retryConfig.maxRetries || 0;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const executor = NodeExecutorRegistry.get(node.type);
      if (!executor) {
        throw new ExecutionError(`Unknown node type: ${node.type}`, { nodeId: node.id });
      }
      return await withTimeout(
        executor.execute(node, inputs, context),
        timeoutMs,
        node.id
      );
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = retryConfig.backoffType === 'exponential'
          ? retryConfig.retryInterval! * Math.pow(2, attempt)
          : retryConfig.retryInterval!;
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateExecutionLogStatus(
  executionId: string,
  status: 'completed' | 'failed' | 'stopped',
  errorMessage?: string
): Promise<void> {
  try {
    const { updateExecutionLog } = await import('./ExecutionLogger');
    await updateExecutionLog(executionId, status as any, errorMessage);
  } catch {
    // Ignore if logger fails
  }
}

export class UnsafeExpressionError extends ExecutionError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeExpressionError';
  }
}

/**
 * Safely evaluate a breakpoint condition expression.
 * Only supports a whitelist of operators and variable references.
 * Disallows: new Function, eval, function calls, property access beyond simple refs.
 */
async function evaluateBreakpointCondition(
  condition: string | undefined,
  context: ExecutionContextImpl,
  node: WorkflowNode
): Promise<boolean> {
  if (!condition || condition.trim() === '') {
    return true; // Unconditional breakpoint always triggers
  }

  try {
    const expr = condition.trim();

    // Security: reject dangerous patterns
    const dangerousPattern =
      /\b(eval|Function|setTimeout|setInterval|require|import|process|globalThis|window|document)\b|[\(\)]\s*\{|`.*?`|\bnew\s+/i;
    if (dangerousPattern.test(expr)) {
      throw new UnsafeExpressionError(`Unsafe expression in breakpoint condition: ${expr}`);
    }

    // Replace {{...}} with actual values first
    let resolvedExpr = expr;
    const varMatches = expr.match(/\{\{(.+?)\}\}/g);
    if (varMatches) {
      for (const match of varMatches) {
        const path = match.slice(2, -2).trim();
        let value: unknown;
        if (path.startsWith('prev.')) {
          const prevOutput = context.prevNodeId ? context.getOutput(context.prevNodeId) : undefined;
          value = prevOutput?.[path.slice(5) as keyof typeof prevOutput];
        } else if (path.startsWith('global.')) {
          value = context.getVariable(`{{${path}}}`);
        } else if (path.startsWith('env.')) {
          value = context.getVariable(`{{${path}}}`);
        } else if (path.startsWith('workflow.')) {
          value = context.getVariable(`{{${path}}}`);
        } else {
          value = context.getVariable(`{{${path}}}`);
        }

        if (typeof value === 'string') {
          resolvedExpr = resolvedExpr.replace(match, `'${value.replace(/'/g, "\\'")}'`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          resolvedExpr = resolvedExpr.replace(match, String(value));
        } else if (value === undefined || value === null) {
          resolvedExpr = resolvedExpr.replace(match, 'undefined');
        } else {
          resolvedExpr = resolvedExpr.replace(match, JSON.stringify(value));
        }
      }
    }

    // Validate that resolved expression only contains safe tokens
    // Whitelist: numbers, strings, booleans, undefined, null, comparison operators, logical operators, spaces
    const safeTokenPattern = /^(\s*([0-9]+(\.[0-9]+)?|'[^']*'|true|false|null|undefined)\s*([=!<>]+|&&|\|\||\+|-|\*|\/|%|\?|:)\s*)*\s*([0-9]+(\.[0-9]+)?|'[^']*'|true|false|null|undefined)\s*$/i;
    if (!safeTokenPattern.test(resolvedExpr)) {
      throw new UnsafeExpressionError(`Expression contains unsafe tokens after resolution: ${resolvedExpr}`);
    }

    // Use a minimal safe evaluator for the whitelisted operators
    return safeEvaluate(resolvedExpr);
  } catch (err) {
    if (err instanceof UnsafeExpressionError) {
      throw err;
    }
    // If evaluation fails, treat as true (safe default for debugging)
    return true;
  }
}

/**
 * Minimal safe expression evaluator.
 * Supports: ==, ===, !=, !==, <, >, <=, >=, &&, ||, +, -, *, /, %
 */
function safeEvaluate(expr: string): boolean {
  // Very simple token-based evaluator for comparison expressions
  const trimmed = expr.trim();

  // Handle logical AND/OR by splitting and evaluating recursively
  const orParts = splitByOperator(trimmed, '||');
  if (orParts.length > 1) {
    return orParts.some((p) => safeEvaluate(p));
  }
  const andParts = splitByOperator(trimmed, '&&');
  if (andParts.length > 1) {
    return andParts.every((p) => safeEvaluate(p));
  }

  // Comparison operators
  const compOps = ['===', '!==', '==', '!=', '<=', '>=', '<', '>'];
  for (const op of compOps) {
    const idx = trimmed.indexOf(op);
    if (idx !== -1) {
      const left = parseValue(trimmed.slice(0, idx).trim());
      const right = parseValue(trimmed.slice(idx + op.length).trim());
      switch (op) {
        case '===': return left === right;
        case '==': return left == right;
        case '!==': return left !== right;
        case '!=': return left != right;
        case '<=': return (left as number) <= (right as number);
        case '>=': return (left as number) >= (right as number);
        case '<': return (left as number) < (right as number);
        case '>': return (left as number) > (right as number);
      }
    }
  }

  // If no operators, just convert to boolean
  return Boolean(parseValue(trimmed));
}

function splitByOperator(expr: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(' || expr[i] === '[' || expr[i] === '{') {
      depth++;
      current += expr[i];
    } else if (expr[i] === ')' || expr[i] === ']' || expr[i] === '}') {
      depth--;
      current += expr[i];
    } else if (depth === 0 && expr.slice(i, i + op.length) === op) {
      parts.push(current.trim());
      current = '';
      i += op.length - 1;
    } else {
      current += expr[i];
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseValue(token: string): unknown {
  const trimmed = token.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'");
  }
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') {
    return num;
  }
  return trimmed;
}

function buildRuntimeStateSnapshot(
  executionId: string,
  currentNodeId: string | undefined,
  context: ExecutionContextImpl,
  nodes: WorkflowNode[],
  completedNodes: string[],
  skippedNodes: Set<string>
): RuntimeStateSnapshot {
  const nodeStates: Record<string, NodeState> = {};
  for (const node of nodes) {
    const status: NodeState['status'] = skippedNodes.has(node.id)
      ? 'skipped'
      : completedNodes.includes(node.id)
      ? 'success'
      : node.id === currentNodeId
      ? 'running'
      : 'idle';
    nodeStates[node.id] = {
      nodeId: node.id,
      nodeType: node.type,
      status,
      output: context.getOutput(node.id),
    };
  }

  const outputs: Record<string, unknown> = {};
  context.outputs.forEach((value, key) => {
    outputs[key] = value;
  });

  const scopeSnapshot = context.getScopeSnapshot();

  return {
    executionId,
    nodeStates,
    contextSnapshot: {
      outputs,
      globalVars: scopeSnapshot.globalVars,
      workflowInputs: scopeSnapshot.workflowInputs,
    },
    callStack: context.getCallStack(),
    currentNodeId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Find the join node that all parallel branches converge to.
 */
function findJoinNode(parallelNodeId: string, dag: DAG, nodes: WorkflowNode[]): string | undefined {
  const visited = new Set<string>();
  const queue: string[] = [parallelNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = dag.adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      const neighborNode = nodes.find((n) => n.id === neighbor);
      if (neighborNode?.type === 'join') {
        return neighbor;
      }
      queue.push(neighbor);
    }
  }
  return undefined;
}

/**
 * Collect all node IDs in a branch from start until (but not including) the join node.
 */
function collectBranchNodes(startId: string, joinId: string, dag: DAG): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current) || current === joinId) continue;
    visited.add(current);
    result.push(current);
    const neighbors = dag.adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && neighbor !== joinId) {
        queue.push(neighbor);
      }
    }
  }
  return result;
}

/**
 * Recursively mark all downstream nodes in a branch as skipped.
 * Exported for testing.
 */
export function markBranchSkipped(nodeId: string, dag: DAG, skipped: Set<string>): void {
  if (skipped.has(nodeId)) return;
  skipped.add(nodeId);
  const neighbors = dag.adjacency.get(nodeId) || [];
  for (const neighbor of neighbors) {
    markBranchSkipped(neighbor, dag, skipped);
  }
}

// Alias for backward compatibility (used by nodes.ts route)
export const ensureBuiltInNodesRegistered = ensureBuiltInExecutors;

/**
 * Build NodeMetadata for built-in executors.
 */
function getNodeMetadata(type: string) {
  const metas: Record<string, any> = {
    start: {
      type: 'start',
      label: '开始',
      category: 'basic',
      description: '工作流入口节点',
      inputs: [],
      outputs: [{ name: 'output', type: 'any', description: '工作流输入' }],
      configSchema: { type: 'object', properties: {} },
    },
    end: {
      type: 'end',
      label: '结束',
      category: 'basic',
      description: '工作流出口节点',
      inputs: [{ name: 'input', type: 'any', required: true, description: '最终输出' }],
      outputs: [],
      configSchema: { type: 'object', properties: {} },
    },
    llm: {
      type: 'llm',
      label: 'LLM',
      category: 'ai',
      description: '调用大语言模型',
      inputs: [{ name: 'prompt', type: 'string', required: false, description: '提示词' }],
      outputs: [{ name: 'text', type: 'string', description: '模型输出' }],
      configSchema: {
        type: 'object',
        properties: {
          model: { type: 'string', title: '模型' },
          prompt: { type: 'string', title: '提示词' },
          temperature: { type: 'number', title: '温度' },
          maxTokens: { type: 'number', title: '最大Token数' },
          systemPrompt: { type: 'string', title: '系统提示词' },
          apiKey: { type: 'string', title: 'API Key' },
        },
      },
    },
    tool: {
      type: 'tool',
      label: '工具',
      category: 'tool',
      description: '调用已注册工具',
      inputs: [{ name: 'input', type: 'any', description: '工具输入' }],
      outputs: [{ name: 'result', type: 'any', description: '工具输出' }],
      configSchema: {
        type: 'object',
        properties: {
          toolName: { type: 'string', title: '工具名称' },
          parameters: { type: 'object', title: '参数' },
        },
      },
    },
    condition: {
      type: 'condition',
      label: '条件分支',
      category: 'control-flow',
      description: '根据条件决定执行分支',
      inputs: [{ name: 'input', type: 'any', required: true, description: '输入数据' }],
      outputs: [
        { name: 'trueOutput', type: 'any', description: 'True分支输出' },
        { name: 'falseOutput', type: 'any', description: 'False分支输出' },
      ],
      configSchema: {
        type: 'object',
        properties: {
          condition: { type: 'string', title: '条件表达式' },
          operator: {
            type: 'string',
            enum: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith', 'endsWith', 'regex'],
            title: '运算符',
          },
          operand: { type: 'string', title: '比较值' },
        },
        required: ['condition', 'operator'],
      },
    },
    parallel: {
      type: 'parallel',
      label: '并行执行',
      category: 'control-flow',
      description: '并行执行多个分支',
      inputs: [{ name: 'input', type: 'any', required: true, description: '输入数据' }],
      outputs: [{ name: 'output', type: 'any', description: '分支结果' }],
      configSchema: {
        type: 'object',
        properties: {
          branches: { type: 'number', title: '分支数', minimum: 2, maximum: 5 },
          strategy: {
            type: 'string',
            enum: ['allSuccess', 'anySuccess', 'ignoreFailure'],
            title: '执行策略',
          },
        },
      },
    },
    join: {
      type: 'join',
      label: '合并',
      category: 'control-flow',
      description: '合并并行分支结果',
      inputs: [{ name: 'input', type: 'any', required: true, description: '分支输出' }],
      outputs: [{ name: 'output', type: 'any', description: '合并结果' }],
      configSchema: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: ['merge', 'array', 'first'],
            title: '聚合策略',
          },
        },
      },
    },
    http: {
      type: 'http',
      label: 'HTTP请求',
      category: 'network',
      description: '发送HTTP请求',
      inputs: [{ name: 'input', type: 'any', description: '请求数据' }],
      outputs: [
        { name: 'status', type: 'number', description: '状态码' },
        { name: 'body', type: 'json', description: '响应体' },
      ],
      configSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            title: '请求方法',
          },
          url: { type: 'string', title: 'URL' },
          headers: { type: 'object', title: '请求头' },
          body: { type: 'string', title: '请求体' },
        },
        required: ['url'],
      },
    },
    setVariable: {
      type: 'setVariable',
      label: '设置变量',
      category: 'data',
      description: '设置工作流变量',
      inputs: [{ name: 'input', type: 'any', description: '输入值' }],
      outputs: [{ name: 'output', type: 'any', description: '设置的值' }],
      configSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['constant', 'reference', 'expression', 'override', 'append', 'conditional'],
            title: '赋值模式',
          },
          name: { type: 'string', title: '变量名' },
          value: { type: 'any', title: '值' },
          reference: { type: 'string', title: '引用路径' },
          expression: { type: 'string', title: '表达式' },
          condition: { type: 'string', title: '条件' },
        },
        required: ['name'],
      },
    },
    subWorkflow: {
      type: 'subWorkflow',
      label: '子工作流',
      category: 'control-flow',
      description: '调用其他工作流',
      inputs: [{ name: 'input', type: 'any', required: true, description: '输入数据' }],
      outputs: [{ name: 'output', type: 'any', description: '子工作流输出' }],
      configSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', title: '工作流ID' },
        },
        required: ['workflowId'],
      },
    },
  };

  return metas[type] || {
    type,
    label: type,
    category: 'other',
    description: '',
    inputs: [],
    outputs: [],
    configSchema: { type: 'object', properties: {} },
  };
}
