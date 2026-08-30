export interface WorkflowNode {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  data?: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

export interface Workflow {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface DAG {
  adjacency: Map<string, string[]>;
  inDegree: Map<string, number>;
  edges: Map<string, IncomingEdge[]>;
}

export interface IncomingEdge {
  source: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ExecutionResult {
  status: 'completed' | 'failed' | 'stopped';
  outputs: Map<string, Record<string, any>>;
  finalOutput?: Record<string, any>;
  error?: ExecutionErrorInfo;
  completedNodes: string[];
}

export interface ScopeSnapshot {
  globalVars: Record<string, unknown>;
  workflowInputs: Record<string, unknown>;
}

export interface ExecutionContext {
  outputs: Map<string, Record<string, unknown>>;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  error?: unknown;
  startTime: Date;
  currentNodeId?: string;
  /** Phase 2: Per-execution sub-workflow call stack for cycle detection */
  subWorkflowCallStack?: Set<string>;
  setOutput(nodeId: string, output: Record<string, unknown>): void;
  getOutput(nodeId: string): Record<string, unknown> | undefined;
  getVariable(path: string): unknown;
  resolveVariables(text: string): string;
  /** Get a snapshot of scope variables for debugging */
  getScopeSnapshot(): ScopeSnapshot;
  /** Get the sub-workflow call stack */
  getCallStack(): string[];
}

export interface ExecutionErrorInfo {
  message: string;
  nodeId?: string;
  originalError?: any;
}
