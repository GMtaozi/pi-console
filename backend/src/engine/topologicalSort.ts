import { WorkflowNode, DAG } from './types';
import { ExecutionError } from './ExecutionError';

export function topologicalSort(dag: DAG, nodes: WorkflowNode[]): string[] {
  const queue: string[] = [];
  const inDegree = new Map(dag.inDegree);
  const result: string[] = [];

  // Enqueue all nodes with in-degree 0
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const neighbors = dag.adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Cycle detection: if result length != node count, there's a cycle
  if (result.length !== nodes.length) {
    const missing = nodes.map(n => n.id).filter(id => !result.includes(id));
    throw new ExecutionError(
      `Cyclic dependency detected in workflow. Unresolvable nodes: ${missing.join(', ')}`,
      { nodeId: missing[0] }
    );
  }

  return result;
}
