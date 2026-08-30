/**
 * WebSocket message types for Pi-Console debugging system.
 */

export interface WorkflowMessage {
  id: string;
  nodes: Array<{
    id: string;
    type: string;
    label?: string;
    position?: { x: number; y: number };
    data?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
  }>;
  [key: string]: unknown;
}

export interface ExecutionOptionsMessage {
  inputs?: Record<string, unknown>;
  envVars?: Record<string, string>;
  globalVars?: Record<string, unknown>;
  mode?: 'normal' | 'step' | 'breakpoint';
  startNodeId?: string;
  breakpoints?: Record<string, { nodeId: string; condition?: string }>;
}

// Client -> Server messages
export type ClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'start'; executionId: string; workflow: WorkflowMessage; options?: ExecutionOptionsMessage }
  | { type: 'step'; executionId: string }
  | { type: 'resume'; executionId: string }
  | { type: 'abort'; executionId: string }
  | { type: 'setBreakpoint'; workflowId: string; nodeId: string; condition?: string }
  | { type: 'removeBreakpoint'; workflowId: string; nodeId: string }
  | { type: 'evalExpression'; executionId: string; expression: string };

// Server -> Client messages
export type ServerMessage =
  | { type: 'authenticated'; success: boolean }
  | { type: 'started'; executionId: string; timestamp: string }
  | { type: 'nodeStart'; executionId: string; nodeId: string; nodeType: string; timestamp: string }
  | { type: 'nodeComplete'; executionId: string; nodeId: string; nodeType: string; output?: Record<string, unknown>; durationMs: number; timestamp: string }
  | { type: 'paused'; executionId: string; reason: 'step' | 'breakpoint' | 'eval'; snapshot: RuntimeStateSnapshot; timestamp: string }
  | { type: 'resumed'; executionId: string; timestamp: string }
  | { type: 'completed'; executionId: string; status: 'completed' | 'failed' | 'stopped'; outputs: Record<string, unknown>; error?: unknown; timestamp: string }
  | { type: 'failed'; executionId: string; error: string; timestamp: string }
  | { type: 'log'; executionId: string; level: 'info' | 'warn' | 'error'; message: string; timestamp: string }
  | { type: 'evalResult'; executionId: string; expression: string; result: unknown; timestamp: string }
  | { type: 'breakpointSet'; workflowId: string; nodeId: string; condition?: string }
  | { type: 'breakpointRemoved'; workflowId: string; nodeId: string }
  | { type: 'error'; message: string };

export interface RuntimeStateSnapshot {
  executionId: string;
  nodeStates: Record<string, NodeState>;
  contextSnapshot: {
    outputs: Record<string, unknown>;
    globalVars: Record<string, unknown>;
    workflowInputs: Record<string, unknown>;
  };
  callStack: string[];
  currentNodeId?: string;
  pausedAt?: string;
  timestamp: string;
}

export interface NodeState {
  nodeId: string;
  nodeType: string;
  status: 'idle' | 'running' | 'success' | 'error' | 'retrying' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  retryCount?: number;
}

export interface ActiveExecution {
  executionId: string;
  workflow: WorkflowMessage;
  client: WebSocketClient;
  controller: AbortController;
  resumePromise?: Promise<void>;
  resumeResolve?: () => void;
  mode: 'normal' | 'step' | 'breakpoint';
  breakpoints: Map<string, BreakpointConfig>; // nodeId -> config
  startedAt: Date;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
}

export interface BreakpointConfig {
  nodeId: string;
  condition?: string;
}

export interface WebSocketClient {
  send(message: ServerMessage): void;
  userId: string;
  username: string;
}
