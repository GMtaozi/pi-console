import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';
import { ExecutionError } from '../ExecutionError';
import { ToolRegistry } from '../ToolRegistry';

export interface ToolNodeConfig {
  toolName?: string;
  parameters?: Record<string, any>;
}

export class ToolNodeExecutor implements NodeExecutor {
  type = 'tool';

  async execute(
    node: WorkflowNode,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const config: ToolNodeConfig = node.data || {};
    const toolName = config.toolName || inputs.toolName;

    if (!toolName) {
      throw new ExecutionError('Tool node requires a toolName', { nodeId: node.id });
    }

    const tool = ToolRegistry.get(toolName);
    if (!tool) {
      throw new ExecutionError(`Tool '${toolName}' not found in registry`, { nodeId: node.id });
    }

    // Resolve parameters: merge config parameters with inputs
    let params: Record<string, any> = { ...inputs };
    if (config.parameters) {
      params = { ...params, ...config.parameters };
    }

    // Resolve variable references in parameter values
    const resolvedParams: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && context && 'resolveVariables' in context) {
        resolvedParams[key] = (context as any).resolveVariables(value);
      } else {
        resolvedParams[key] = value;
      }
    }

    const result = await tool.execute(resolvedParams);
    return { result };
  }
}
