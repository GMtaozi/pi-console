import { WorkflowNode, ExecutionContext } from './types';
import { NodeExecutor, ValidationError } from './NodeExecutorRegistry';

export { NodeExecutor, ValidationError } from './NodeExecutorRegistry';

export interface NodePort {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'any';
  required?: boolean;
  description?: string;
}

export interface NodeMetadata {
  type: string;
  label: string;
  category: string;
  description: string;
  icon?: string;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: Record<string, any>; // JSON Schema subset
  defaultConfig?: Record<string, any>;
  executorClass?: string;
}

/**
 * NodeRegistry - declarative node registration with metadata.
 * Replaces/extends the Phase 1 NodeExecutorRegistry with full metadata support.
 */
class Registry {
  private executors = new Map<string, NodeExecutor>();
  private metadata = new Map<string, NodeMetadata>();

  register(metadata: NodeMetadata, executor?: NodeExecutor): void {
    this.metadata.set(metadata.type, metadata);
    if (executor) {
      this.executors.set(metadata.type, executor);
    }
  }

  getExecutor(type: string): NodeExecutor | undefined {
    return this.executors.get(type);
  }

  getMetadata(type: string): NodeMetadata | undefined {
    return this.metadata.get(type);
  }

  unregister(type: string): boolean {
    this.metadata.delete(type);
    return this.executors.delete(type);
  }

  clear(): void {
    this.metadata.clear();
    this.executors.clear();
  }

  list(): string[] {
    return Array.from(this.metadata.keys());
  }

  listMetadata(): NodeMetadata[] {
    return Array.from(this.metadata.values());
  }

  listByCategory(category: string): NodeMetadata[] {
    return this.listMetadata().filter((m) => m.category === category);
  }

  discover(): NodeMetadata[] {
    return this.listMetadata();
  }
}

export const NodeRegistry = new Registry();
