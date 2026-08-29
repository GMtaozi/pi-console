import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';

export class EndNodeExecutor implements NodeExecutor {
  type = 'end';

  async execute(
    _node: WorkflowNode,
    inputs: Record<string, any>,
    _context: ExecutionContext
  ): Promise<Record<string, any>> {
    return { result: inputs };
  }
}
