/**
 * WebSocket message types for Pi-Console debugging system.
 */

// Client -> Server messages
export type ClientMessage =
  | { type: 'start'; executionId: string; workflow: any; options?: any }
  | { type: 'step'; executionId: string }
  | { type: 'resume'; executionId: string }
  | { type: 'abort'; executionId: string }
  | { type: 'setBreakpoint'; workflowId: string; nodeId: string; condition?: string }
  | { type: 'removeBreakpoint'; workflowId: string; nodeId: string }
  | { type: 'evalExpression'; executionId: string; expression: string };

// Server -> Client messages
export type ServerMessage =
  | { type: 'started'; executionId: string; timestamp: string }
  | { type: 'nodeStart'; executionId: string; nodeId: string; nodeType: string; timestamp: string }
  | { type: 'nodeComplete'; executionId: string; nodeId: string; nodeType: string; output?: any; durationMs: number; timestamp: string }
  | { type: 'paused'; executionId: string; reason: 'step' | 'breakpoint' | 'eval'; snapshot: RuntimeStateSnapshot; timestamp: string }
  | { type: 'resumed'; executionId: string; timestamp: string }
  | { type: 'completed'; executionId: string; status: 'completed' | 'failed' | 'stopped'; outputs: any; error?: any; timestamp: string }
  | { type: 'failed'; executionId: string; error: string; timestamp: string }
  | { type: 'log'; executionId: string; level: 'info' | 'warn' | 'error'; message: string; timestamp: string }
  | { type: 'evalResult'; executionId: string; expression: string; result: any; timestamp: string }
  | { type: 'breakpointSet'; workflowId: string; nodeId: string; condition?: string }
  | { type: 'breakpointRemoved'; workflowId: string; nodeId: string }
  | { type: 'error'; message: string };

export interface RuntimeStateSnapshot {
  executionId: string;
  nodeStates: Record<string, NodeState>;
  contextSnapshot: {
    outputs: Record<string, any>;
    globalVars: Record<string, any>;
    workflowInputs: Record<string, any>;
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
  output?: any;
  error?: string;
  durationMs?: number;
  retryCount?: number;
}

export interface ActiveExecution {
  executionId: string;
  workflow: any;
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
