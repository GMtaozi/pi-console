import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExecutionContextImpl } from '../ExecutionContext';

describe('ExecutionContext Phase 2 (V1-2)', () => {
  it('initializes workflow inputs', () => {
    const ctx = new ExecutionContextImpl();
    ctx.initializeWorkflowInputs({ name: 'test', count: 5 });
    assert.strictEqual(ctx.getVariable('{{workflow.name}}'), 'test');
    assert.strictEqual(ctx.getVariable('{{workflow.count}}'), 5);
  });

  it('supports global variables', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setGlobalVariable('apiUrl', { value: 'https://api.example.com', type: 'string' });
    assert.strictEqual(ctx.getVariable('{{global.apiUrl}}'), 'https://api.example.com');
  });

  it('supports environment variables', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setEnvVariables({ DATABASE_URL: 'postgres://localhost' });
    assert.strictEqual(ctx.getVariable('{{env.DATABASE_URL}}'), 'postgres://localhost');
  });

  it('supports node context variables', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setNodeContext('node1', 'temp', { value: 42, type: 'number' });
    assert.strictEqual(ctx.getVariable('{{node1.temp}}'), 42);
  });

  it('resolves variables in text', () => {
    const ctx = new ExecutionContextImpl();
    ctx.initializeWorkflowInputs({ name: 'world' });
    ctx.setOutput('node1', { greeting: 'hello' });
    const result = ctx.resolveVariables('{{node1.greeting}} {{workflow.name}}');
    assert.strictEqual(result, 'hello world');
  });

  it('resolves objects with variables', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('node1', { text: 'hello' });
    const result = ctx.resolveObject({ prompt: '{{node1.text}} world', num: 42 });
    assert.strictEqual(result.prompt, 'hello world');
    assert.strictEqual(result.num, 42);
  });

  it('maintains Phase 1 backward compatibility', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('node1', { text: 'hello' });
    assert.strictEqual(ctx.getVariable('{{node1.text}}'), 'hello');
    assert.strictEqual(ctx.getVariableLegacy('node1', 'text'), 'hello');
  });

  it('supports prev node reference', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('node1', { result: 'done' });
    ctx.prevNodeId = 'node1';
    assert.strictEqual(ctx.getVariable('{{prev.result}}'), 'done');
  });

  it('scope priority: node outputs > workflow > global', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('apiUrl', { value: 'from-node' });
    ctx.setGlobalVariable('apiUrl', { value: 'from-global', type: 'string' });
    // nodeId.apiUrl should resolve to node output
    assert.strictEqual(ctx.getVariable('{{apiUrl.value}}'), 'from-node');
  });
});
