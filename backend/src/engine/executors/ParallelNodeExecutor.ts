import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';

export interface ParallelNodeConfig {
  branches?: number;
  strategy?: 'allSuccess' | 'anySuccess' | 'ignoreFailure';
}

export class ParallelNodeExecutor implements NodeExecutor {
  type = 'parallel';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    _context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: ParallelNodeConfig = node.data || {};
    const branches = Math.max(2, Math.min(5, config.branches || 2));
    const strategy = config.strategy || 'allSuccess';

    return {
      branches,
      strategy,
      input: inputs.input,
    };
  }
}

export interface JoinNodeConfig {
  strategy?: 'merge' | 'array' | 'first';
}

export class JoinNodeExecutor implements NodeExecutor {
  type = 'join';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    _context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: JoinNodeConfig = node.data || {};
    const strategy = config.strategy || 'merge';

    switch (strategy) {
      case 'merge':
        return { outputs: inputs };
      case 'array':
        return { outputs: Object.values(inputs) };
      case 'first': {
        const values = Object.values(inputs);
        return { output: values.length > 0 ? values[0] : undefined };
      }
      default:
        return { outputs: inputs };
    }
  }
}
