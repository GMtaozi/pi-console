import { WorkflowNode, WorkflowEdge, DAG } from './types';

export function buildDAG(nodes: WorkflowNode[], edges: WorkflowEdge[]): DAG {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const edgeMap = new Map<string, { source: string; sourceHandle?: string; targetHandle?: string }[]>();

  // Initialize all nodes
  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
    edgeMap.set(node.id, []);
  }

  // Build adjacency and in-degree from edges
  for (const edge of edges) {
    const sourceList = adjacency.get(edge.source);
    if (sourceList) {
      sourceList.push(edge.target);
    }

    const currentInDegree = inDegree.get(edge.target) || 0;
    inDegree.set(edge.target, currentInDegree + 1);

    const incoming = edgeMap.get(edge.target) || [];
    incoming.push({
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    });
    edgeMap.set(edge.target, incoming);
  }

  return { adjacency, inDegree, edges: edgeMap };
}
