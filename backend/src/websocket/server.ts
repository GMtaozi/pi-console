import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  ClientMessage,
  ServerMessage,
  ActiveExecution,
  WebSocketClient,
  RuntimeStateSnapshot,
  NodeState,
  BreakpointConfig,
} from './types';
import { executeWorkflow } from '../engine/executeWorkflow';
import { ExecutionOptions } from '../engine/executeWorkflow';
import { getDb } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Active executions map: executionId -> ActiveExecution
export const activeExecutions = new Map<string, ActiveExecution>();

// Breakpoints per workflow: workflowId -> Map<nodeId, BreakpointConfig>
export const workflowBreakpoints = new Map<string, Map<string, BreakpointConfig>>();

let wss: WebSocketServer | null = null;

export function startWebSocketServer(port = 3001): WebSocketServer {
  const server = http.createServer();
  const newWss = new WebSocketServer({ server });
  if (!wss) {
    wss = newWss;
  }

  newWss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    // JWT authentication from query string
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user: { id: string; username: string; email: string } | null = null;
    if (token) {
      try {
        user = jwt.verify(token, JWT_SECRET) as { id: string; username: string; email: string };
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' } as ServerMessage));
        ws.close(1008, 'Invalid token');
        return;
      }
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing token' } as ServerMessage));
      ws.close(1008, 'Missing token');
      return;
    }

    const client: WebSocketClient = {
      userId: user.id,
      username: user.username,
      send: (msg: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      },
    };

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await handleClientMessage(message, client, ws);
      } catch (err: any) {
        client.send({ type: 'error', message: err.message || 'Invalid message' });
      }
    });

    ws.on('close', () => {
      // Abort any active executions for this client
      for (const [execId, exec] of activeExecutions.entries()) {
        if (exec.client.userId === user!.id) {
          exec.controller.abort();
          activeExecutions.delete(execId);
        }
      }
    });
  });

  server.listen(port, () => {
    console.log(`[WebSocket] Server started on port ${port}`);
  });

  return newWss;
}

async function handleClientMessage(
  msg: ClientMessage,
  client: WebSocketClient,
  ws: WebSocket
): Promise<void> {
  switch (msg.type) {
    case 'start': {
      const executionId = msg.executionId || uuidv4();
      const controller = new AbortController();

      const exec: ActiveExecution = {
        executionId,
        workflow: msg.workflow,
        client,
        controller,
        mode: msg.options?.mode || 'normal',
        breakpoints: new Map(),
        startedAt: new Date(),
        status: 'running',
      };

      // Load breakpoints for this workflow
      if (msg.workflow?.id) {
        const bps = await loadBreakpoints(msg.workflow.id);
        exec.breakpoints = bps;
      }

      activeExecutions.set(executionId, exec);
      client.send({ type: 'started', executionId, timestamp: new Date().toISOString() });

      // Run workflow
      runWorkflowExecution(exec, msg.options).catch((err) => {
        client.send({
          type: 'failed',
          executionId,
          error: err.message || String(err),
          timestamp: new Date().toISOString(),
        });
        exec.status = 'failed';
      });
      break;
    }

    case 'step': {
      const exec = activeExecutions.get(msg.executionId);
      if (!exec) {
        client.send({ type: 'error', message: `Execution ${msg.executionId} not found` });
        return;
      }
      if (exec.status !== 'paused') {
        client.send({ type: 'error', message: 'Execution is not paused' });
        return;
      }
      exec.mode = 'step';
      exec.status = 'running';
      client.send({ type: 'resumed', executionId: msg.executionId, timestamp: new Date().toISOString() });
      if (exec.resumeResolve) {
        exec.resumeResolve();
        exec.resumeResolve = undefined;
      }
      break;
    }

    case 'resume': {
      const exec = activeExecutions.get(msg.executionId);
      if (!exec) {
        client.send({ type: 'error', message: `Execution ${msg.executionId} not found` });
        return;
      }
      if (exec.status !== 'paused') {
        client.send({ type: 'error', message: 'Execution is not paused' });
        return;
      }
      exec.mode = 'normal';
      exec.status = 'running';
      client.send({ type: 'resumed', executionId: msg.executionId, timestamp: new Date().toISOString() });
      if (exec.resumeResolve) {
        exec.resumeResolve();
        exec.resumeResolve = undefined;
      }
      break;
    }

    case 'abort': {
      const exec = activeExecutions.get(msg.executionId);
      if (!exec) {
        client.send({ type: 'error', message: `Execution ${msg.executionId} not found` });
        return;
      }
      exec.controller.abort();
      exec.status = 'stopped';
      activeExecutions.delete(msg.executionId);
      client.send({
        type: 'completed',
        executionId: msg.executionId,
        status: 'stopped',
        outputs: {},
        timestamp: new Date().toISOString(),
      });
      break;
    }

    case 'setBreakpoint': {
      const { workflowId, nodeId, condition } = msg;
      if (!workflowBreakpoints.has(workflowId)) {
        workflowBreakpoints.set(workflowId, new Map());
      }
      workflowBreakpoints.get(workflowId)!.set(nodeId, { nodeId, condition });
      // Persist to DB
      await saveBreakpoint(workflowId, nodeId, condition);
      client.send({ type: 'breakpointSet', workflowId, nodeId, condition });
      break;
    }

    case 'removeBreakpoint': {
      const { workflowId, nodeId } = msg;
      workflowBreakpoints.get(workflowId)?.delete(nodeId);
      await removeBreakpoint(workflowId, nodeId);
      client.send({ type: 'breakpointRemoved', workflowId, nodeId });
      break;
    }

    case 'evalExpression': {
      const exec = activeExecutions.get(msg.executionId);
      if (!exec) {
        client.send({ type: 'error', message: `Execution ${msg.executionId} not found` });
        return;
      }
      // Simple expression evaluation against workflow outputs
      // For security, only support basic variable lookups
      let result: any = null;
      try {
        const outputs = exec.workflow?._lastOutputs || {};
        // Very basic evaluator: supports {{nodeId.key}} pattern
        const expr = msg.expression.trim();
        const match = expr.match(/\{\{(.+?)\}\}/);
        if (match) {
          const path = match[1].trim();
          const parts = path.split('.');
          result = outputs;
          for (const part of parts) {
            result = result?.[part];
          }
        } else {
          result = expr;
        }
      } catch (err: any) {
        result = { error: err.message };
      }
      client.send({
        type: 'evalResult',
        executionId: msg.executionId,
        expression: msg.expression,
        result,
        timestamp: new Date().toISOString(),
      });
      break;
    }
  }
}

async function runWorkflowExecution(
  exec: ActiveExecution,
  options?: any
): Promise<void> {
  const { executionId, workflow, client, controller, mode, breakpoints } = exec;

  const execOptions: ExecutionOptions = {
    signal: controller.signal,
    workflowInputs: options?.inputs || {},
    envVars: options?.envVars || {},
    globalVars: options?.globalVars || {},
    executionLogId: executionId,
    userId: client.userId,
    mode,
    startNodeId: options?.startNodeId,
    breakpoints: breakpoints.size > 0 ? Object.fromEntries(breakpoints) : undefined,
    onNodeStart: (nodeId: string, nodeType: string) => {
      client.send({
        type: 'nodeStart',
        executionId,
        nodeId,
        nodeType,
        timestamp: new Date().toISOString(),
      });
    },
    onNodeComplete: (nodeId: string, nodeType: string, output: any, durationMs: number) => {
      workflow._lastOutputs = workflow._lastOutputs || {};
      if (output) workflow._lastOutputs[nodeId] = output;
      client.send({
        type: 'nodeComplete',
        executionId,
        nodeId,
        nodeType,
        output,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    },
    onPaused: async (reason: 'step' | 'breakpoint' | 'eval', snapshot: RuntimeStateSnapshot) => {
      exec.status = 'paused';
      // Create a promise that will be resolved by resume/step
      const resumePromise = new Promise<void>((resolve) => {
        exec.resumeResolve = resolve;
      });
      exec.resumePromise = resumePromise;
      client.send({
        type: 'paused',
        executionId,
        reason,
        snapshot,
        timestamp: new Date().toISOString(),
      });
      await resumePromise;
    },
  };

  try {
    const result = await executeWorkflow(workflow, execOptions);
    exec.status = result.status === 'completed' ? 'completed' : 'failed';

    const outputs: Record<string, any> = {};
    result.outputs.forEach((value, key) => {
      outputs[key] = value;
    });

    client.send({
      type: 'completed',
      executionId,
      status: result.status,
      outputs,
      error: result.error,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    exec.status = 'failed';
    client.send({
      type: 'failed',
      executionId,
      error: err.message || String(err),
      timestamp: new Date().toISOString(),
    });
  } finally {
    activeExecutions.delete(executionId);
  }
}

async function loadBreakpoints(workflowId: string): Promise<Map<string, BreakpointConfig>> {
  const db = await getDb();
  const rows = await db.query('SELECT node_id, condition FROM breakpoints WHERE workflow_id = $1 AND enabled = 1', [workflowId]);
  const map = new Map<string, BreakpointConfig>();
  for (const row of rows.rows || []) {
    map.set(row.node_id, { nodeId: row.node_id, condition: row.condition || undefined });
  }
  return map;
}

async function saveBreakpoint(workflowId: string, nodeId: string, condition?: string): Promise<void> {
  const db = await getDb();
  const id = uuidv4();
  await db.query(
    `INSERT INTO breakpoints (id, workflow_id, node_id, condition, enabled)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (workflow_id, node_id) DO UPDATE SET condition = EXCLUDED.condition, enabled = 1, updated_at = CURRENT_TIMESTAMP`,
    [id, workflowId, nodeId, condition || null]
  );
}

async function removeBreakpoint(workflowId: string, nodeId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `DELETE FROM breakpoints WHERE workflow_id = $1 AND node_id = $2`,
    [workflowId, nodeId]
  );
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}
