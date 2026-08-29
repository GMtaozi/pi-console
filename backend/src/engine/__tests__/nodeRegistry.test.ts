import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NodeRegistry, NodeMetadata, NodeExecutor } from '../NodeRegistry';
import { WorkflowNode, ExecutionContext } from '../types';

describe('NodeRegistry (V2-2)', () => {
  // Clear registry before each test by using a fresh registry instance would be better,
  // but since NodeRegistry is a singleton, we unregister after tests.

  it('registers and retrieves metadata', () => {
    const meta: NodeMetadata = {
      type: 'test-node',
      label: 'Test Node',
      category: 'test',
      description: 'A test node',
      inputs: [{ name: 'input', type: 'string' }],
      outputs: [{ name: 'output', type: 'string' }],
      configSchema: { type: 'object', properties: {} },
    };

    NodeRegistry.register(meta);
    const retrieved = NodeRegistry.getMetadata('test-node');
    assert.ok(retrieved);
    assert.strictEqual(retrieved!.label, 'Test Node');
    assert.strictEqual(retrieved!.category, 'test');
  });

  it('lists all registered node types', () => {
    const types = NodeRegistry.list();
    assert.ok(types.includes('test-node'));
  });

  it('lists metadata', () => {
    const metas = NodeRegistry.listMetadata();
    const found = metas.find((m) => m.type === 'test-node');
    assert.ok(found);
  });

  it('filters by category', () => {
    const metas = NodeRegistry.listByCategory('test');
    assert.ok(metas.some((m) => m.type === 'test-node'));
  });

  it('discovers returns all metadata', () => {
    const nodes = NodeRegistry.discover();
    assert.ok(nodes.length > 0);
    assert.ok(nodes.some((n) => n.type === 'test-node'));
  });

  it('registers executor alongside metadata', () => {
    const meta: NodeMetadata = {
      type: 'exec-node',
      label: 'Exec Node',
      category: 'test',
      description: '',
      inputs: [],
      outputs: [],
      configSchema: { type: 'object', properties: {} },
    };
    const executor: NodeExecutor = {
      type: 'exec-node',
      async execute(_node: WorkflowNode, _inputs: Record<string, any>, _ctx: ExecutionContext) {
        return { done: true };
      },
    };
    NodeRegistry.register(meta, executor);
    const exec = NodeRegistry.getExecutor('exec-node');
    assert.ok(exec);
    assert.strictEqual(exec!.type, 'exec-node');
  });

  it('unregisters node type', () => {
    NodeRegistry.unregister('test-node');
    assert.strictEqual(NodeRegistry.getMetadata('test-node'), undefined);
  });
});
