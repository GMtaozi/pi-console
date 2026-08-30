import { ExecutionContext } from './types';
import { ScopeChain, TypedValue, VariableResolver, variableResolver } from './VariableResolver';
import { TypeConverter } from './TypeConverter';

export class ExecutionContextImpl implements ExecutionContext {
  outputs = new Map<string, Record<string, any>>();
  status: ExecutionContext['status'] = 'running';
  error?: any;
  startTime = new Date();
  currentNodeId?: string;
  /** Phase 2: Per-execution sub-workflow call stack for cycle detection */
  subWorkflowCallStack = new Set<string>();

  // Phase 2: Enhanced scope chain
  scopeChain: ScopeChain = {
    global: {},
    workflow: {},
    nodeContext: new Map(),
    env: {},
  };

  // Phase 2: Previous executed node ID for {{prev.x}} support
  prevNodeId?: string;

  // Internal resolver instance
  private resolver = variableResolver;

  setOutput(nodeId: string, output: Record<string, any>): void {
    this.outputs.set(nodeId, output);
  }

  getOutput(nodeId: string): Record<string, any> | undefined {
    return this.outputs.get(nodeId);
  }

  /**
   * Phase 2: Enhanced variable resolution with multi-layer scope chain.
   * Supports:
   * - {{nodeId.outputKey}} (Phase 1 compatible)
   * - {{global.key}}
   * - {{workflow.key}}
   * - {{env.KEY}}
   * - {{prev.key}}
   * - {{key}} (shorthand for workflow scope)
   */
  getVariable(path: string): any {
    return this.resolver.resolve(path, this.scopeChain, this.outputs, this.prevNodeId);
  }

  /**
   * Phase 2: Enhanced variable resolution in text.
   * Supports all scope syntaxes in strings.
   */
  resolveVariables(text: string): string {
    return this.resolver.resolveVariables(text, this.scopeChain, this.outputs, this.prevNodeId);
  }

  /**
   * Phase 2: Deep resolve all variable references in an object.
   */
  resolveObject(obj: any): any {
    return this.resolver.resolveObject(obj, this.scopeChain, this.outputs, this.prevNodeId);
  }

  /**
   * Phase 2: Set a global variable.
   */
  setGlobalVariable(key: string, value: TypedValue): void {
    this.scopeChain.global[key] = value;
  }

  /**
   * Phase 2: Set a workflow variable.
   */
  setWorkflowVariable(key: string, value: TypedValue): void {
    this.scopeChain.workflow[key] = value;
  }

  /**
   * Phase 2: Set environment variables.
   */
  setEnvVariables(env: Record<string, string>): void {
    this.scopeChain.env = { ...this.scopeChain.env, ...env };
  }

  /**
   * Phase 2: Set node context variable.
   */
  setNodeContext(nodeId: string, key: string, value: TypedValue): void {
    let ctx = this.scopeChain.nodeContext.get(nodeId);
    if (!ctx) {
      ctx = {};
      this.scopeChain.nodeContext.set(nodeId, ctx);
    }
    ctx[key] = value;
  }

  /**
   * Phase 2: Initialize from workflow inputs.
   */
  initializeWorkflowInputs(inputs: Record<string, any>): void {
    for (const [key, value] of Object.entries(inputs)) {
      this.scopeChain.workflow[key] = {
        value,
        type: TypeConverter.inferType(value),
      };
    }
  }

  /**
   * Phase 1 backward-compatible getVariable (raw path without {{}})
   */
  getVariableLegacy(nodeId: string, key: string): unknown {
    const output = this.outputs.get(nodeId);
    return output?.[key];
  }

  /**
   * Get a snapshot of scope variables for debugging.
   */
  getScopeSnapshot(): { globalVars: Record<string, unknown>; workflowInputs: Record<string, unknown> } {
    const globalVars: Record<string, unknown> = {};
    for (const [key, tv] of Object.entries(this.scopeChain.global)) {
      globalVars[key] = tv.value;
    }
    const workflowInputs: Record<string, unknown> = {};
    for (const [key, tv] of Object.entries(this.scopeChain.workflow)) {
      workflowInputs[key] = tv.value;
    }
    return { globalVars, workflowInputs };
  }

  /**
   * Get the sub-workflow call stack.
   */
  getCallStack(): string[] {
    return Array.from(this.subWorkflowCallStack);
  }
}
