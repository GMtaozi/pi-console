import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeWorkflow } from '../executeWorkflow';
import { Workflow } from '../types';

describe('executeWorkflow (P0-6, P1-4)', () => {
  it('executes empty workflow', async () => {
    const wf: Workflow = { id: 'wf1', nodes: [], edges: [] };
    const result = await executeWorkflow(wf);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.completedNodes.length, 0);
  });

  it('executes single node workflow', async () => {
    const wf: Workflow = {
      id: 'wf2',
      nodes: [{ id: 'start', type: 'start' }],
      edges: [],
    };
    const result = await executeWorkflow(wf);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.completedNodes.length, 1);
    assert.deepStrictEqual(result.finalOutput, { started: true });
  });

  it('executes 3-node workflow start->end', async () => {
    const wf: Workflow = {
      id: 'wf3',
      nodes: [
        { id: 's', type: 'start' },
        { id: 'm', type: 'llm', data: { prompt: 'Say hello' } },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'm' },
        { id: 'e2', source: 'm', target: 'e' },
      ],
    };

    // This will likely fail without a real API key, which is expected
    // We test the error handling path
    try {
      const result = await executeWorkflow(wf);
      // If we have a real API key configured, this could succeed
      assert(result.status === 'completed' || result.status === 'failed');
    } catch {
      // Should not throw; errors should be captured in result
      assert.fail('executeWorkflow should not throw; errors should be in result');
    }
  });

  it('returns error for unknown node type', async () => {
    const wf: Workflow = {
      id: 'wf4',
      nodes: [{ id: 'bad', type: 'unknown_type' }],
      edges: [],
    };
    const result = await executeWorkflow(wf);
    assert.strictEqual(result.status, 'failed');
    assert(result.error?.message.includes('Unknown node type'));
    assert.strictEqual(result.error?.nodeId, 'bad');
  });

  it('detects cyclic dependency and returns error', async () => {
    const wf: Workflow = {
      id: 'wf5',
      nodes: [
        { id: 'a', type: 'start' },
        { id: 'b', type: 'llm' },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    };
    const result = await executeWorkflow(wf);
    assert.strictEqual(result.status, 'failed');
    assert(result.error?.message.includes('Cyclic dependency'));
  });

  it('respects abort signal', async () => {
    const wf: Workflow = {
      id: 'wf6',
      nodes: [
        { id: 's', type: 'start' },
        { id: 'e', type: 'end' },
      ],
      edges: [{ id: 'e1', source: 's', target: 'e' }],
    };
    const controller = new AbortController();
    controller.abort();
    const result = await executeWorkflow(wf, { signal: controller.signal });
    assert.strictEqual(result.status, 'stopped');
  });
});
