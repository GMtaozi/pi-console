import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';
import { ExecutionError } from '../ExecutionError';

export interface SetVariableNodeConfig {
  mode?: 'constant' | 'reference' | 'expression' | 'override' | 'append' | 'conditional';
  name?: string;
  value?: any;
  reference?: string;
  expression?: string;
  condition?: string;
}

export class SetVariableNodeExecutor implements NodeExecutor {
  type = 'setVariable';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: SetVariableNodeConfig = node.data || {};
    const mode = config.mode || 'constant';
    const varName = config.name;

    if (!varName) {
      throw new ExecutionError('SetVariable node requires a variable name', { nodeId: node.id });
    }

    let value: any;

    switch (mode) {
      case 'constant':
        value = config.value;
        break;
      case 'reference': {
        const ref = config.reference || '';
        if ('getVariable' in context && typeof (context as any).getVariable === 'function') {
          value = (context as any).getVariable(ref);
        } else {
          value = ref;
        }
        break;
      }
      case 'expression': {
        const expr = config.expression || '';
        value = this.evaluateExpression(expr, inputs, context);
        break;
      }
      case 'override': {
        // Override: replace existing value unconditionally
        value = config.value !== undefined ? config.value : inputs.input;
        break;
      }
      case 'append': {
        // Append: append to existing array or string
        const existing = 'getVariable' in context && typeof (context as any).getVariable === 'function'
          ? (context as any).getVariable(`{{workflow.${varName}}}`)
          : undefined;
        const newValue = config.value !== undefined ? config.value : inputs.input;
        if (Array.isArray(existing)) {
          value = [...existing, newValue];
        } else if (typeof existing === 'string') {
          value = existing + String(newValue);
        } else {
          value = [existing, newValue].filter((v) => v !== undefined);
        }
        break;
      }
      case 'conditional': {
        // Conditional: only set if condition is true
        const conditionResult = this.evaluateCondition(config.condition || '', inputs, context);
        if (conditionResult) {
          value = config.value !== undefined ? config.value : inputs.input;
        } else {
          // Return current value without change
          const existing = 'getVariable' in context && typeof (context as any).getVariable === 'function'
            ? (context as any).getVariable(`{{workflow.${varName}}}`)
            : undefined;
          value = existing;
        }
        break;
      }
      default:
        value = config.value;
    }

    // Write to workflow context
    if ('setWorkflowVariable' in context && typeof (context as any).setWorkflowVariable === 'function') {
      (context as any).setWorkflowVariable(varName, { value, type: this.inferType(value) });
    }

    return { [varName]: value };
  }

  private evaluateExpression(expr: string, inputs: Record<string, any>, context: ExecutionContext): any {
    // Simple expression evaluator: supports basic arithmetic and input references
    // Replace {{...}} with resolved values
    let resolved = expr;
    if ('resolveVariables' in context && typeof (context as any).resolveVariables === 'function') {
      resolved = (context as any).resolveVariables(expr);
    }

    // Try to safely evaluate simple expressions
    try {
      // Only allow safe characters: digits, operators, parens, dots, spaces
      if (/^[\d\+\-\*\/\.\(\)\s]+$/.test(resolved)) {
        // eslint-disable-next-line no-new-func
        return new Function('return ' + resolved)();
      }
    } catch {
      // Fall through to return resolved string
    }

    return resolved;
  }

  private evaluateCondition(condition: string, inputs: Record<string, any>, context: ExecutionContext): boolean {
    if (!condition) return true;
    let resolved = condition;
    if ('resolveVariables' in context && typeof (context as any).resolveVariables === 'function') {
      resolved = (context as any).resolveVariables(condition);
    }
    return resolved === 'true' || resolved === '1' || resolved === true;
  }

  private inferType(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }
}
