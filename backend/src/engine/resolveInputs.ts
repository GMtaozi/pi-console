import { DAG, ExecutionContext } from './types';

export function resolveInputs(
  nodeId: string,
  dag: DAG,
  context: ExecutionContext
): Record<string, any> {
  const inputs: Record<string, any> = {};
  const incomingEdges = dag.edges.get(nodeId) || [];

  for (const edge of incomingEdges) {
    const sourceOutput = context.getOutput(edge.source);
    if (sourceOutput) {
      // Map upstream output to current node input
      const key = edge.targetHandle || 'default';
      inputs[key] = sourceOutput[edge.sourceHandle || 'default'];
    }
  }

  return inputs;
}
