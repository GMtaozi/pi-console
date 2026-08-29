import { WorkflowNode, ExecutionContext } from './types';

export interface NodeExecutor {
  type: string;
  execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>>;
}

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
