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
      const sourceKey = edge.sourceHandle || 'default';
      let value = sourceOutput[sourceKey];

      // Fallback for edges without explicit source handles:
      // When the default key is missing, try common output property names
      // or the whole output object as a last resort.
      if (value === undefined && !edge.sourceHandle) {
        if (sourceOutput.output !== undefined) {
          value = sourceOutput.output;
        } else if (sourceOutput.result !== undefined) {
          value = sourceOutput.result;
        } else {
          const keys = Object.keys(sourceOutput);
          if (keys.length === 1) {
            value = sourceOutput[keys[0]];
          } else if (keys.length > 1) {
            value = sourceOutput;
          }
        }
      }

      inputs[key] = value;
    }
  }

  return inputs;
}
