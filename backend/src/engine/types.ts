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

export interface ExecutionContext {
  outputs: Map<string, Record<string, any>>;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  error?: any;
  startTime: Date;
  currentNodeId?: string;
  /** Phase 2: Per-execution sub-workflow call stack for cycle detection */
  subWorkflowCallStack?: Set<string>;
  setOutput(nodeId: string, output: Record<string, any>): void;
  getOutput(nodeId: string): Record<string, any> | undefined;
  getVariable(path: string): any;
  resolveVariables(text: string): string;
}

export interface ExecutionErrorInfo {
  message: string;
  nodeId?: string;
  originalError?: any;
}
