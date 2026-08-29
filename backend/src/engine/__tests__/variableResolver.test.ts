import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VariableResolver, ScopeChain } from '../VariableResolver';

describe('VariableResolver (V1-1)', () => {
  const resolver = new VariableResolver();

  const scopeChain: ScopeChain = {
    global: { apiUrl: { value: 'https://api.example.com', type: 'string' } },
    workflow: { input: { value: 'hello', type: 'string' } },
    nodeContext: new Map([['node1', { text: { value: 'world', type: 'string' } }]]),
    env: { DATABASE_URL: 'postgres://localhost' },
  };

  const nodeOutputs = new Map<string, Record<string, any>>([
    ['node1', { text: 'output1', count: 42 }],
    ['node2', { result: 'done' }],
  ]);

  it('resolves {{nodeId.outputKey}} syntax (Phase 1 compatible)', () => {
    const result = resolver.resolve('{{node1.text}}', scopeChain, nodeOutputs);
    assert.strictEqual(result, 'output1');
  });

  it('resolves {{global.key}} syntax', () => {
    const result = resolver.resolve('{{global.apiUrl}}', scopeChain, nodeOutputs);
    assert.strictEqual(result, 'https://api.example.com');
  });

  it('resolves {{workflow.key}} syntax', () => {
    const result = resolver.resolve('{{workflow.input}}', scopeChain, nodeOutputs);
    assert.strictEqual(result, 'hello');
  });

  it('resolves {{env.KEY}} syntax', () => {
    const result = resolver.resolve('{{env.DATABASE_URL}}', scopeChain, nodeOutputs);
    assert.strictEqual(result, 'postgres://localhost');
  });

  it('resolves {{prev.key}} syntax', () => {
    const result = resolver.resolve('{{prev.result}}', scopeChain, nodeOutputs, 'node2');
    assert.strictEqual(result, 'done');
  });

  it('resolvesVariables replaces all references in text', () => {
    const text = 'URL: {{global.apiUrl}}, Input: {{workflow.input}}';
    const result = resolver.resolveVariables(text, scopeChain, nodeOutputs);
    assert.strictEqual(result, 'URL: https://api.example.com, Input: hello');
  });

  it('serialize/deserialize round-trip preserves variable references', () => {
    const obj = {
      prompt: 'Say {{workflow.input}} to {{node1.text}}',
      url: '{{global.apiUrl}}',
    };
    const serialized = resolver.serialize(obj);
    assert.ok(serialized.data.includes('__VAR__'));
    assert.ok(Object.keys(serialized.placeholders).length > 0);

    const deserialized = resolver.deserialize(serialized);
    assert.strictEqual(deserialized.prompt, 'Say {{workflow.input}} to {{node1.text}}');
    assert.strictEqual(deserialized.url, '{{global.apiUrl}}');
  });

  it('escape marks variables as literals', () => {
    const text = 'Literal: {{workflow.input}}';
    const escaped = resolver.escape(text);
    assert.ok(escaped.includes('\\{{'));
    const resolved = resolver.resolve(escaped, scopeChain, nodeOutputs);
    assert.ok(resolved.includes('{{workflow.input}}'));
  });

  it('returns expression as-is for non-variable paths', () => {
    const result = resolver.resolve('plain text', scopeChain, nodeOutputs);
    assert.strictEqual(result, 'plain text');
  });

  it('hasVariables detects variable references', () => {
    assert.strictEqual(resolver.hasVariables('{{x}}'), true);
    assert.strictEqual(resolver.hasVariables('no vars'), false);
  });
});

describe('VariableResolver 4-step serialization (V1-1)', () => {
  const resolver = new VariableResolver();

  it('Step 1-2: Scan and Mark replaces {{...}} with placeholders', () => {
    const obj = { prompt: 'Hello {{user.name}}' };
    const serialized = resolver.serialize(obj);
    assert.ok(!serialized.data.includes('{{'));
    assert.ok(serialized.data.includes('__VAR__'));
    assert.strictEqual(Object.keys(serialized.placeholders).length, 1);
  });

  it('Step 3: Store produces valid JSON string', () => {
    const obj = { url: '{{global.apiUrl}}', method: 'GET' };
    const serialized = resolver.serialize(obj);
    assert.doesNotThrow(() => JSON.parse(serialized.data));
  });

  it('Step 4: Restore replaces placeholders back to {{...}}', () => {
    const original = { url: '{{global.apiUrl}}', headers: { auth: '{{env.API_KEY}}' } };
    const serialized = resolver.serialize(original);
    const restored = resolver.deserialize(serialized);
    assert.deepStrictEqual(restored, original);
  });

  it('Handles nested objects with multiple variable references', () => {
    const obj = {
      config: {
        prompt: '{{workflow.input}}',
        params: {
          url: '{{global.apiUrl}}',
          key: '{{env.KEY}}',
        },
      },
    };
    const serialized = resolver.serialize(obj);
    const restored = resolver.deserialize(serialized);
    assert.deepStrictEqual(restored, obj);
  });

  it('Handles arrays with variable references', () => {
    const obj = { items: ['{{node1.text}}', 'static', '{{node2.result}}'] };
    const serialized = resolver.serialize(obj);
    const restored = resolver.deserialize(serialized);
    assert.deepStrictEqual(restored, obj);
  });
});
