import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildDAG } from '../DAGBuilder';
import { resolveInputs } from '../resolveInputs';
import { ExecutionContextImpl } from '../ExecutionContext';
import { WorkflowNode, WorkflowEdge } from '../types';

describe('resolveInputs (P0-5)', () => {
  it('maps upstream output to current node input', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'llm' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
    ];

    const dag = buildDAG(nodes, edges);
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('a', { default: 'hello from a' });

    const inputs = resolveInputs('b', dag, ctx);
    assert.strictEqual(inputs.default, 'hello from a');
  });

  it('merges multiple incoming edges', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'llm' },
      { id: 'c', type: 'end' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'c', sourceHandle: 'out1', targetHandle: 'in1' },
      { id: 'e2', source: 'b', target: 'c', sourceHandle: 'out2', targetHandle: 'in2' },
    ];

    const dag = buildDAG(nodes, edges);
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('a', { out1: 'value1' });
    ctx.setOutput('b', { out2: 'value2' });

    const inputs = resolveInputs('c', dag, ctx);
    assert.strictEqual(inputs.in1, 'value1');
    assert.strictEqual(inputs.in2, 'value2');
  });

  it('returns empty object for node with no incoming edges', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
    ];
    const dag = buildDAG(nodes, []);
    const ctx = new ExecutionContextImpl();
    const inputs = resolveInputs('a', dag, ctx);
    assert.deepStrictEqual(inputs, {});
  });
});
