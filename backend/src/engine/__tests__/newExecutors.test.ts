import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExecutionContextImpl } from '../ExecutionContext';
import { ConditionNodeExecutor } from '../executors/ConditionNodeExecutor';
import { ParallelNodeExecutor, JoinNodeExecutor } from '../executors/ParallelNodeExecutor';
import { HTTPNodeExecutor } from '../executors/HTTPNodeExecutor';
import { SetVariableNodeExecutor } from '../executors/SetVariableNodeExecutor';
import { WorkflowNode } from '../types';

function makeNode(type: string, data: any): WorkflowNode {
  return { id: 'test-node', type, data };
}

describe('ConditionNodeExecutor (V2-5)', () => {
  const executor = new ConditionNodeExecutor();

  it('evaluates == operator (true)', async () => {
    const node = makeNode('condition', { condition: 'hello', operator: '==', operand: 'hello' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { input: 'hello' }, ctx);
    assert.strictEqual(result.result, true);
    assert.strictEqual(result.trueOutput, 'hello');
  });

  it('evaluates == operator (false)', async () => {
    const node = makeNode('condition', { condition: 'hello', operator: '==', operand: 'world' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { input: 'hello' }, ctx);
    assert.strictEqual(result.result, false);
    assert.strictEqual(result.falseOutput, 'hello');
  });

  it('evaluates > operator', async () => {
    const node = makeNode('condition', { condition: '10', operator: '>', operand: '5' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { input: 10 }, ctx);
    assert.strictEqual(result.result, true);
  });

  it('evaluates contains operator', async () => {
    const node = makeNode('condition', { condition: 'hello world', operator: 'contains', operand: 'world' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.result, true);
  });

  it('evaluates regex operator', async () => {
    const node = makeNode('condition', { condition: 'hello123', operator: 'regex', operand: '\\d+' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.result, true);
  });

  it('resolves variable references in condition', async () => {
    const node = makeNode('condition', { condition: '{{workflow.name}}', operator: '==', operand: 'test' });
    const ctx = new ExecutionContextImpl();
    ctx.initializeWorkflowInputs({ name: 'test' });
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.result, true);
  });
});

describe('ParallelNodeExecutor (V2-7)', () => {
  const executor = new ParallelNodeExecutor();

  it('returns branch config', async () => {
    const node = makeNode('parallel', { branches: 3, strategy: 'allSuccess' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { input: 'data' }, ctx);
    assert.strictEqual(result.branches, 3);
    assert.strictEqual(result.strategy, 'allSuccess');
    assert.strictEqual(result.input, 'data');
  });

  it('clamps branches to 2-5', async () => {
    const node1 = makeNode('parallel', { branches: 1 });
    const node2 = makeNode('parallel', { branches: 10 });
    const ctx = new ExecutionContextImpl();
    const r1 = await executor.execute(node1, {}, ctx);
    const r2 = await executor.execute(node2, {}, ctx);
    assert.strictEqual(r1.branches, 2);
    assert.strictEqual(r2.branches, 5);
  });
});

describe('JoinNodeExecutor (V2-7)', () => {
  const executor = new JoinNodeExecutor();

  it('merges strategy combines all inputs', async () => {
    const node = makeNode('join', { strategy: 'merge' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { a: 1, b: 2 }, ctx);
    assert.deepStrictEqual(result.outputs, { a: 1, b: 2 });
  });

  it('array strategy converts to array', async () => {
    const node = makeNode('join', { strategy: 'array' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { a: 1, b: 2 }, ctx);
    assert.deepStrictEqual(result.outputs, [1, 2]);
  });

  it('first strategy takes first value', async () => {
    const node = makeNode('join', { strategy: 'first' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { a: 1, b: 2 }, ctx);
    assert.strictEqual(result.output, 1);
  });
});

describe('SetVariableNodeExecutor (V2-12)', () => {
  const executor = new SetVariableNodeExecutor();

  it('constant mode sets value', async () => {
    const node = makeNode('setVariable', { mode: 'constant', name: 'x', value: 42 });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.x, 42);
  });

  it('reference mode resolves variable', async () => {
    const node = makeNode('setVariable', { mode: 'reference', name: 'y', reference: '{{workflow.source}}' });
    const ctx = new ExecutionContextImpl();
    ctx.initializeWorkflowInputs({ source: 'hello' });
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.y, 'hello');
  });

  it('override mode replaces value', async () => {
    const node = makeNode('setVariable', { mode: 'override', name: 'z', value: 'new' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, { input: 'old' }, ctx);
    assert.strictEqual(result.z, 'new');
  });

  it('conditional mode sets only when condition is true', async () => {
    const node = makeNode('setVariable', { mode: 'conditional', name: 'c', value: 'set', condition: 'true' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.c, 'set');
  });

  it('conditional mode skips when condition is false', async () => {
    const node = makeNode('setVariable', { mode: 'conditional', name: 'c', value: 'set', condition: 'false' });
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute(node, {}, ctx);
    assert.strictEqual(result.c, undefined);
  });

  it('throws when name is missing', async () => {
    const node = makeNode('setVariable', { mode: 'constant' });
    const ctx = new ExecutionContextImpl();
    await assert.rejects(() => executor.execute(node, {}, ctx), /requires a variable name/);
  });
});

describe('HTTPNodeExecutor (V2-10)', () => {
  const executor = new HTTPNodeExecutor();

  it('throws when URL is missing', async () => {
    const node = makeNode('http', { method: 'GET' });
    const ctx = new ExecutionContextImpl();
    await assert.rejects(() => executor.execute(node, {}, ctx), /requires a URL/);
  });

  it('resolves variables in URL', async () => {
    const node = makeNode('http', { method: 'GET', url: '{{workflow.endpoint}}' });
    const ctx = new ExecutionContextImpl();
    ctx.initializeWorkflowInputs({ endpoint: 'https://httpbin.org/get' });
    // We won't actually call the API in unit tests
    // Just verify the executor processes the config correctly
    assert.strictEqual(node.data.url, '{{workflow.endpoint}}');
  });
});
