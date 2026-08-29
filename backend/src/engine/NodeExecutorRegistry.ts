import { WorkflowNode, ExecutionContext } from './types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface NodeExecutor {
  type: string;
  execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>>;
  validate?(config: Record<string, any>): ValidationError[];
  abort?(): void;
}

/**
 * Phase 1 compatible NodeExecutorRegistry.
 * Kept for backward compatibility; new code should use NodeRegistry.
 */
class Registry {
  private executors = new Map<string, NodeExecutor>();

  register(executor: NodeExecutor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: string): NodeExecutor | undefined {
    return this.executors.get(type);
  }

  unregister(type: string): boolean {
    return this.executors.delete(type);
  }

  list(): string[] {
    return Array.from(this.executors.keys());
  }
}

export const NodeExecutorRegistry = new Registry();
