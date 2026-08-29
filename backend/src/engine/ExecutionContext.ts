import { ExecutionContext } from './types';

export class ExecutionContextImpl implements ExecutionContext {
  outputs = new Map<string, Record<string, any>>();
  status: ExecutionContext['status'] = 'running';
  error?: any;
  startTime = new Date();
  currentNodeId?: string;

  setOutput(nodeId: string, output: Record<string, any>): void {
    this.outputs.set(nodeId, output);
  }

  getOutput(nodeId: string): Record<string, any> | undefined {
    return this.outputs.get(nodeId);
  }

  getVariable(path: string): any {
    // Parse {{nodeId.outputKey}} syntax
    const match = path.match(/\{\{(\w+)\.(\w+)\}\}/);
    if (!match) return path; // Not a variable reference, return as-is
    const [, nodeId, key] = match;
    const output = this.outputs.get(nodeId);
    return output?.[key];
  }

  resolveVariables(text: string): string {
    return text.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_, nodeId, key) => {
      const output = this.outputs.get(nodeId);
      const value = output?.[key];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }
}
