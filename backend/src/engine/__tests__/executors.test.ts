import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NodeExecutorRegistry } from '../NodeExecutorRegistry';
import { ExecutionContextImpl } from '../ExecutionContext';
import { StartNodeExecutor } from '../executors/StartNodeExecutor';
import { EndNodeExecutor } from '../executors/EndNodeExecutor';
import { ToolNodeExecutor } from '../executors/ToolNodeExecutor';
import { WorkflowNode } from '../types';
import { ToolRegistry } from '../ToolRegistry';

describe('NodeExecutorRegistry (P0-4)', () => {
  it('registers and retrieves executors', () => {
    const executor = new StartNodeExecutor();
    NodeExecutorRegistry.register(executor);
    assert.strictEqual(NodeExecutorRegistry.get('start')?.type, 'start');
  });

  it('lists registered executor types', () => {
    const types = NodeExecutorRegistry.list();
    assert(types.includes('start'));
  });

  it('returns undefined for unknown type', () => {
    assert.strictEqual(NodeExecutorRegistry.get('nonexistent'), undefined);
  });
});

describe('StartNodeExecutor', () => {
  it('returns started flag with inputs merged', async () => {
    const executor = new StartNodeExecutor();
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute({ id: 's', type: 'start' }, { topic: 'test' }, ctx);
    assert.strictEqual(result.started, true);
    assert.strictEqual(result.topic, 'test');
  });
});

describe('EndNodeExecutor', () => {
  it('returns inputs as result', async () => {
    const executor = new EndNodeExecutor();
    const ctx = new ExecutionContextImpl();
    const result = await executor.execute({ id: 'e', type: 'end' }, { text: 'done' }, ctx);
    assert.deepStrictEqual(result.result, { text: 'done' });
  });
});

describe('ToolNodeExecutor', () => {
  it('executes registered tool', async () => {
    // Register a mock tool
    ToolRegistry.register('test-ext', [{
      name: 'echo',
      description: 'Echo tool',
      execute: async (params: any) => ({ echoed: params.input }),
    }]);

    const executor = new ToolNodeExecutor();
    const ctx = new ExecutionContextImpl();
    const node: WorkflowNode = {
      id: 't1',
      type: 'tool',
      data: { toolName: 'test-ext.echo', parameters: { input: 'hello' } },
    };

    const result = await executor.execute(node, {}, ctx);
    assert.deepStrictEqual(result.result, { echoed: 'hello' });

    // Cleanup
    ToolRegistry.unregister('test-ext');
  });

  it('throws for missing tool', async () => {
    const executor = new ToolNodeExecutor();
    const ctx = new ExecutionContextImpl();
    const node: WorkflowNode = {
      id: 't2',
      type: 'tool',
      data: { toolName: 'nonexistent.tool' },
    };

    await assert.rejects(
      () => executor.execute(node, {}, ctx),
      /not found in registry/
    );
  });
});
