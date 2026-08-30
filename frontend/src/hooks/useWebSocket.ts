import { useCallback, useEffect, useRef, useState } from 'react';

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

export type ClientMessage =
  | { type: 'start'; executionId: string; workflow: any; options?: any }
  | { type: 'step'; executionId: string }
  | { type: 'resume'; executionId: string }
  | { type: 'abort'; executionId: string }
  | { type: 'setBreakpoint'; workflowId: string; nodeId: string; condition?: string }
  | { type: 'removeBreakpoint'; workflowId: string; nodeId: string }
  | { type: 'evalExpression'; executionId: string; expression: string };

interface UseWebSocketOptions {
  onMessage?: (msg: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }
    setConnecting(true);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        optionsRef.current.onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          optionsRef.current.onMessage?.(msg);
        } catch {
          // ignore invalid messages
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        setConnecting(false);
        wsRef.current = null;
        optionsRef.current.onClose?.(event);
        // Auto reconnect after 3s
        if (!event.wasClean) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        setConnecting(false);
        optionsRef.current.onError?.(error);
      };
    } catch {
      setConnecting(false);
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connected, connecting, send, connect, disconnect };
}
