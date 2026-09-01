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
  private extIdMap = new Map<string, Set<string>>();

  register(executor: NodeExecutor, extId?: string): void {
    this.executors.set(executor.type, executor);
    if (extId) {
      if (!this.extIdMap.has(extId)) {
        this.extIdMap.set(extId, new Set());
      }
      this.extIdMap.get(extId)!.add(executor.type);
    }
  }

  get(type: string): NodeExecutor | undefined {
    return this.executors.get(type);
  }

  unregister(type: string): boolean {
    return this.executors.delete(type);
  }

  unregisterByExtId(extId: string): void {
    const types = this.extIdMap.get(extId);
    if (types) {
      for (const type of types) {
        this.executors.delete(type);
      }
      this.extIdMap.delete(extId);
    }
  }

  list(): string[] {
    return Array.from(this.executors.keys());
  }
}

export const NodeExecutorRegistry = new Registry();
