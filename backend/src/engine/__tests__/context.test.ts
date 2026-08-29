import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ExecutionContextImpl } from '../ExecutionContext';

describe('ExecutionContext (P0-3)', () => {
  it('stores and retrieves node outputs', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('node1', { text: 'hello' });
    assert.deepStrictEqual(ctx.getOutput('node1'), { text: 'hello' });
  });

  it('returns undefined for unknown node', () => {
    const ctx = new ExecutionContextImpl();
    assert.strictEqual(ctx.getOutput('unknown'), undefined);
  });

  it('resolves {{nodeId.outputKey}} variable', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('n1', { text: 'world' });
    assert.strictEqual(ctx.getVariable('{{n1.text}}'), 'world');
  });

  it('returns original string for non-variable path', () => {
    const ctx = new ExecutionContextImpl();
    assert.strictEqual(ctx.getVariable('plain text'), 'plain text');
  });

  it('resolveVariables replaces all placeholders in text', () => {
    const ctx = new ExecutionContextImpl();
    ctx.setOutput('start', { topic: 'AI' });
    ctx.setOutput('llm1', { text: 'Great topic!' });

    const result = ctx.resolveVariables('Topic: {{start.topic}}, Response: {{llm1.text}}');
    assert.strictEqual(result, 'Topic: AI, Response: Great topic!');
  });

  it('resolveVariables returns empty string for missing key', () => {
    const ctx = new ExecutionContextImpl();
    const result = ctx.resolveVariables('Hello {{missing.key}}');
    assert.strictEqual(result, 'Hello ');
  });
});
