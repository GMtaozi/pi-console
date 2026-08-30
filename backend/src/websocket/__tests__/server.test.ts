import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { startWebSocketServer, getWebSocketServer } from '../server';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

describe('WebSocket Server', () => {
  let wss: ReturnType<typeof startWebSocketServer>;
  const port = 3999;

  before(async () => {
    wss = startWebSocketServer(port);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });

  after(() => {
    wss.close();
  });

  it('rejects connection without token', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    let closed = false;
    let closeCode = 0;

    ws.on('close', (code) => {
      closed = true;
      closeCode = code;
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(closed, true);
    assert.strictEqual(closeCode, 1008);
    ws.terminate();
  });

  it('accepts connection with valid token', async () => {
    const token = jwt.sign({ id: 'user1', username: 'test', email: 'test@test.com' }, JWT_SECRET);
    const ws = new WebSocket(`ws://localhost:${port}?token=${token}`);

    let opened = false;
    ws.on('open', () => {
      opened = true;
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(opened, true);
    ws.close();
  });

  it('rejects connection with invalid token', async () => {
    const ws = new WebSocket(`ws://localhost:${port}?token=invalid-token`);
    let closed = false;
    let closeCode = 0;

    ws.on('close', (code) => {
      closed = true;
      closeCode = code;
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(closed, true);
    assert.strictEqual(closeCode, 1008);
    ws.terminate();
  });

  it('handles messages without crashing', async () => {
    const token = jwt.sign({ id: 'user1', username: 'test', email: 'test@test.com' }, JWT_SECRET);
    const ws = new WebSocket(`ws://localhost:${port}?token=${token}`);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS open timeout')), 1000);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    // Send a setBreakpoint message (does not require DB for basic parsing)
    ws.send(JSON.stringify({
      type: 'setBreakpoint',
      workflowId: 'wf-test',
      nodeId: 'node-a',
    }));

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    // If we get here without crash, the server handled the message
    assert.strictEqual(ws.readyState, WebSocket.OPEN);

    ws.close();
  });
});
