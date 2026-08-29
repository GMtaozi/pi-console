import { createHash } from 'crypto';

export type VariableType = 'string' | 'number' | 'boolean' | 'json' | 'any' | 'array' | 'null';

export interface TypedValue {
  value: any;
  type: VariableType;
}

export interface ScopeChain {
  global: Record<string, TypedValue>;
  workflow: Record<string, TypedValue>;
  nodeContext: Map<string, Record<string, TypedValue>>;
  env: Record<string, string>;
}

export interface SerializedValue {
  data: string;
  placeholders: Record<string, string>;
}

export interface ParsedVariable {
  scope: string;
  name: string;
  subPath?: string;
}

const VAR_PATTERN = /\{\{([^}]+)\}\}/g;
const ESCAPED_VAR_PATTERN = /\\\{\{([^}]+)\}\}/g;
const PLACEHOLDER_PATTERN = /__VAR__([a-f0-9]{8})__/g;

/**
 * VariableResolver - 4-step serialization algorithm for variable references
 *
 * Step 1: Scan - traverse object, find all {{...}} variable references
 * Step 2: Mark - replace references with __VAR__<hash>__ placeholders
 * Step 3: Store - JSON stringify and store in DB
 * Step 4: Restore - deserialize, replace placeholders back to {{...}}
 */
export class VariableResolver {
  /**
   * Step 1+2: Scan and Mark - replace variable references with placeholders
   */
  serialize(obj: any): SerializedValue {
    const placeholders: Record<string, string> = {};

    function traverse(value: any): any {
      if (typeof value === 'string') {
        return replaceVars(value, placeholders);
      }
      if (Array.isArray(value)) {
        return value.map(traverse);
      }
      if (value !== null && typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = traverse(v);
        }
        return result;
      }
      return value;
    }

    const data = JSON.stringify(traverse(obj));
    return { data, placeholders };
  }

  /**
   * Step 4: Restore - replace placeholders back to original variable references
   */
  deserialize(serialized: SerializedValue): any {
    let text = serialized.data;
    for (const [hash, original] of Object.entries(serialized.placeholders)) {
      text = text.replaceAll(`__VAR__${hash}__`, `{{${original}}}`);
    }
    return JSON.parse(text);
  }

  /**
   * Resolve a variable expression against a scope chain.
   * Supports:
   * - {{nodeId.outputKey}} - node output (backward compatible)
   * - {{global.key}} - global variable
   * - {{workflow.key}} - workflow input/context variable
   * - {{env.KEY}} - environment variable
   * - {{prev.key}} - previous executed node's output
   * - {{key}} - shorthand for workflow scope
   */
  resolve(
    expression: string,
    scopeChain: ScopeChain,
    nodeOutputs: Map<string, Record<string, any>>,
    prevNodeId?: string
  ): any {
    // Handle escaped variables: \{{...}} → {{...}} (literal, not a reference)
    // First unescape any escaped variables in the expression
    const unescaped = expression.replace(/\\\{\{/g, '{{');
    if (unescaped !== expression) {
      return unescaped;
    }

    const parsed = this.parseVariablePath(expression);
    if (!parsed) return expression;

    switch (parsed.scope) {
      case 'global': {
        const gv = scopeChain.global[parsed.name];
        return gv?.value;
      }
      case 'workflow': {
        const wv = scopeChain.workflow[parsed.name];
        return wv?.value;
      }
      case 'env': {
        return scopeChain.env[parsed.name];
      }
      case 'prev': {
        if (!prevNodeId) return undefined;
        const output = nodeOutputs.get(prevNodeId);
        return output?.[parsed.name];
      }
      default: {
        // nodeId.outputKey syntax (Phase 1 compatible)
        const output = nodeOutputs.get(parsed.scope);
        if (output && parsed.name in output) {
          return output[parsed.name];
        }
        // Also check nodeContext for typed values
        const nodeCtx = scopeChain.nodeContext.get(parsed.scope);
        if (nodeCtx) {
          const tv = nodeCtx[parsed.name];
          if (tv) return tv.value;
        }
        return undefined;
      }
    }
  }

  /**
   * Resolve all variable references in a text string.
   * Replaces {{...}} with resolved values.
   */
  resolveVariables(
    text: string,
    scopeChain: ScopeChain,
    nodeOutputs: Map<string, Record<string, any>>,
    prevNodeId?: string
  ): string {
    return text.replace(VAR_PATTERN, (match, inner) => {
      const resolved = this.resolve(`{{${inner}}}`, scopeChain, nodeOutputs, prevNodeId);
      return resolved !== undefined && resolved !== null ? String(resolved) : '';
    });
  }

  /**
   * Deep resolve all variable references in an object.
   */
  resolveObject(
    obj: any,
    scopeChain: ScopeChain,
    nodeOutputs: Map<string, Record<string, any>>,
    prevNodeId?: string
  ): any {
    if (typeof obj === 'string') {
      return this.resolveVariables(obj, scopeChain, nodeOutputs, prevNodeId);
    }
    if (Array.isArray(obj)) {
      return obj.map((v) => this.resolveObject(v, scopeChain, nodeOutputs, prevNodeId));
    }
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = this.resolveObject(v, scopeChain, nodeOutputs, prevNodeId);
      }
      return result;
    }
    return obj;
  }

  /**
   * Parse a variable path like "nodeId.outputKey" or "global.apiUrl"
   */
  parseVariablePath(path: string): ParsedVariable | null {
    // Strip {{ and }}
    const inner = path.replace(/^\{\{/, '').replace(/\}\}$/, '');
    if (inner === path) return null; // Not a variable reference

    const dotIndex = inner.indexOf('.');
    if (dotIndex === -1) {
      // Shorthand: {{key}} → workflow scope
      return { scope: 'workflow', name: inner };
    }

    const scope = inner.slice(0, dotIndex);
    const rest = inner.slice(dotIndex + 1);

    // Handle nested paths like nodeId.output.subKey
    const subDotIndex = rest.indexOf('.');
    if (subDotIndex === -1) {
      return { scope, name: rest };
    }
    return { scope, name: rest.slice(0, subDotIndex), subPath: rest.slice(subDotIndex + 1) };
  }

  /**
   * Escape variable references so they are treated as literals.
   * {{...}} → \{{...}}
   */
  escape(text: string): string {
    return text.replace(VAR_PATTERN, (match) => '\\' + match);
  }

  /**
   * Unescape previously escaped variable references.
   * \{{...}} → {{...}}
   */
  unescape(text: string): string {
    return text.replace(ESCAPED_VAR_PATTERN, (match) => match.slice(1));
  }

  /**
   * Detect if a string contains variable references.
   */
  hasVariables(text: string): boolean {
    return VAR_PATTERN.test(text);
  }
}

// Helper: replace {{...}} with placeholder and record mapping
function replaceVars(text: string, placeholders: Record<string, string>): string {
  return text.replace(VAR_PATTERN, (match, inner) => {
    const hash = createHash('sha256').update(inner).digest('hex').slice(0, 8);
    placeholders[hash] = inner;
    return `__VAR__${hash}__`;
  });
}

export const variableResolver = new VariableResolver();
