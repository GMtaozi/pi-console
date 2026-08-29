import { NodeExecutor } from '../NodeExecutorRegistry';
import { WorkflowNode, ExecutionContext } from '../types';

export class StartNodeExecutor implements NodeExecutor {
  type = 'start';

  async execute(
    _node: WorkflowNode,
    inputs: Record<string, any>,
    _context: ExecutionContext
  ): Promise<Record<string, any>> {
    return { started: true, ...inputs };
  }
}
