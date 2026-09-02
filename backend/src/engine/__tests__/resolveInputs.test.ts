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

  it('aggregates multiple no-handle incoming edges into array (P2 join fix)', () => {
    const nodes: WorkflowNode[] = [
      { id: 'branch1', type: 'llm' },
      { id: 'branch2', type: 'llm' },
      { id: 'join', type: 'join' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'branch1', target: 'join' },
      { id: 'e2', source: 'branch2', target: 'join' },
    ];

    const dag = buildDAG(nodes, edges);
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('branch1', { result: 'value-from-branch1' });
    ctx.setOutput('branch2', { result: 'value-from-branch2' });

    const inputs = resolveInputs('join', dag, ctx);
    assert.ok(Array.isArray(inputs.default));
    assert.strictEqual(inputs.default.length, 2);
    assert.ok(inputs.default.includes('value-from-branch1'));
    assert.ok(inputs.default.includes('value-from-branch2'));
  });

  it('aggregates three no-handle incoming edges into array', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'llm' },
      { id: 'b', type: 'llm' },
      { id: 'c', type: 'llm' },
      { id: 'join', type: 'join' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'join' },
      { id: 'e2', source: 'b', target: 'join' },
      { id: 'e3', source: 'c', target: 'join' },
    ];

    const dag = buildDAG(nodes, edges);
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('a', { output: 1 });
    ctx.setOutput('b', { output: 2 });
    ctx.setOutput('c', { output: 3 });

    const inputs = resolveInputs('join', dag, ctx);
    assert.deepStrictEqual(inputs.default, [1, 2, 3]);
  });

  it('preserves single no-handle edge as scalar (backward compat)', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'join' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
    ];

    const dag = buildDAG(nodes, edges);
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('a', { default: 'hello from a' });

    const inputs = resolveInputs('b', dag, ctx);
    assert.strictEqual(inputs.default, 'hello from a');
    assert.ok(!Array.isArray(inputs.default));
  });

  it('mixed handled and no-handled edges do not interfere', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'start' },
      { id: 'c', type: 'join' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'c', sourceHandle: 'out1', targetHandle: 'in1' },
      { id: 'e2', source: 'b', target: 'c' },
    ];

    const dag = buildDAG(nodes, edges);
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('a', { out1: 'handled-value' });
    ctx.setOutput('b', { result: 'unhandled-value' });

    const inputs = resolveInputs('c', dag, ctx);
    assert.strictEqual(inputs.in1, 'handled-value');
    assert.strictEqual(inputs.default, 'unhandled-value');
  });
});
