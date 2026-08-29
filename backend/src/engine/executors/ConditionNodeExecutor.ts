import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';
import { ExecutionError } from '../ExecutionError';

export interface ConditionNodeConfig {
  condition?: string;
  operator?: string;
  operand?: string;
}

export class ConditionNodeExecutor implements NodeExecutor {
  type = 'condition';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: ConditionNodeConfig = node.data || {};
    const conditionValue = this.resolveValue(config.condition || '', context, inputs);
    const operator = config.operator || '==';
    const operand = this.resolveValue(config.operand || '', context, inputs);

    const result = this.evaluate(conditionValue, operator, operand);

    return {
      result,
      trueOutput: result ? (inputs.input !== undefined ? inputs.input : conditionValue) : undefined,
      falseOutput: result ? undefined : (inputs.input !== undefined ? inputs.input : conditionValue),
    };
  }

  private resolveValue(value: string, context: ExecutionContext, inputs: Record<string, any>): any {
    if (typeof value !== 'string') return value;
    if (value.startsWith('{{') && value.endsWith('}}')) {
      if ('resolveVariables' in context && typeof (context as any).resolveVariables === 'function') {
        const resolved = (context as any).resolveVariables(value);
        // Try parse as number/boolean if appropriate
        if (resolved === 'true') return true;
        if (resolved === 'false') return false;
        const num = Number(resolved);
        if (!Number.isNaN(num) && resolved !== '') return num;
        return resolved;
      }
    }
    // Try parse literal
    if (value === 'true') return true;
    if (value === 'false') return false;
    const num = Number(value);
    if (!Number.isNaN(num) && value !== '') return num;
    return value;
  }

  private evaluate(left: any, op: string, right: any): boolean {
    switch (op) {
      case '==':
        // eslint-disable-next-line eqeqeq
        return left == right;
      case '!=':
        // eslint-disable-next-line eqeqeq
        return left != right;
      case '>':
        return Number(left) > Number(right);
      case '<':
        return Number(left) < Number(right);
      case '>=':
        return Number(left) >= Number(right);
      case '<=':
        return Number(left) <= Number(right);
      case 'contains':
        return String(left).includes(String(right));
      case 'startsWith':
        return String(left).startsWith(String(right));
      case 'endsWith':
        return String(left).endsWith(String(right));
      case 'regex': {
        try {
          return new RegExp(String(right)).test(String(left));
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  }
}
