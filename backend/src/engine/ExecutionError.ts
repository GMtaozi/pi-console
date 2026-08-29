import { ExecutionErrorInfo } from './types';

export class ExecutionError extends Error {
  nodeId?: string;
  originalError?: any;

  constructor(message: string, info?: Partial<ExecutionErrorInfo>) {
    super(message);
    this.name = 'ExecutionError';
    this.nodeId = info?.nodeId;
    this.originalError = info?.originalError;
  }

  toJSON(): ExecutionErrorInfo {
    return {
      message: this.message,
      nodeId: this.nodeId,
      originalError: this.originalError?.message || this.originalError,
    };
  }
}
