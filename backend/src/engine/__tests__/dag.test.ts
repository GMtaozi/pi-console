import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildDAG } from '../DAGBuilder';
import { topologicalSort } from '../topologicalSort';
import { WorkflowNode, WorkflowEdge } from '../types';

describe('DAG Builder (P0-1)', () => {
  it('builds adjacency and in-degree from nodes and edges', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'llm' },
      { id: 'c', type: 'end' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];

    const dag = buildDAG(nodes, edges);

    assert.deepStrictEqual(dag.adjacency.get('a'), ['b']);
    assert.deepStrictEqual(dag.adjacency.get('b'), ['c']);
    assert.deepStrictEqual(dag.adjacency.get('c'), []);

    assert.strictEqual(dag.inDegree.get('a'), 0);
    assert.strictEqual(dag.inDegree.get('b'), 1);
    assert.strictEqual(dag.inDegree.get('c'), 1);

    const bEdges = dag.edges.get('b');
    assert.strictEqual(bEdges?.length, 1);
    assert.strictEqual(bEdges?.[0].source, 'a');
  });

  it('handles multi-source nodes', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'start' },
      { id: 'c', type: 'llm' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'c' },
      { id: 'e2', source: 'b', target: 'c' },
    ];

    const dag = buildDAG(nodes, edges);
    assert.strictEqual(dag.inDegree.get('c'), 2);
    assert.strictEqual(dag.edges.get('c')?.length, 2);
  });

  it('handles empty workflow', () => {
    const dag = buildDAG([], []);
    assert.strictEqual(dag.adjacency.size, 0);
    assert.strictEqual(dag.inDegree.size, 0);
  });

  it('handles single node', () => {
    const nodes: WorkflowNode[] = [{ id: 'solo', type: 'start' }];
    const dag = buildDAG(nodes, []);
    assert.strictEqual(dag.inDegree.get('solo'), 0);
    assert.deepStrictEqual(dag.adjacency.get('solo'), []);
  });
});

describe('Topological Sort (P0-2)', () => {
  it('returns correct execution order for linear chain', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'llm' },
      { id: 'c', type: 'end' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];

    const dag = buildDAG(nodes, edges);
    const order = topologicalSort(dag, nodes);
    assert.deepStrictEqual(order, ['a', 'b', 'c']);
  });

  it('returns correct order for diamond shape', () => {
    const nodes: WorkflowNode[] = [
      { id: 'start', type: 'start' },
      { id: 'branch1', type: 'llm' },
      { id: 'branch2', type: 'llm' },
      { id: 'merge', type: 'end' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'start', target: 'branch1' },
      { id: 'e2', source: 'start', target: 'branch2' },
      { id: 'e3', source: 'branch1', target: 'merge' },
      { id: 'e4', source: 'branch2', target: 'merge' },
    ];

    const dag = buildDAG(nodes, edges);
    const order = topologicalSort(dag, nodes);
    assert.strictEqual(order[0], 'start');
    assert.strictEqual(order[order.length - 1], 'merge');
    // merge must come after both branches
    const mergeIdx = order.indexOf('merge');
    assert(mergeIdx > order.indexOf('branch1'), 'merge after branch1');
    assert(mergeIdx > order.indexOf('branch2'), 'merge after branch2');
  });

  it('detects cyclic dependency', () => {
    const nodes: WorkflowNode[] = [
      { id: 'a', type: 'start' },
      { id: 'b', type: 'llm' },
      { id: 'c', type: 'end' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'a' },
    ];

    const dag = buildDAG(nodes, edges);
    assert.throws(() => topologicalSort(dag, nodes), /Cyclic dependency/);
  });

  it('handles single node', () => {
    const nodes: WorkflowNode[] = [{ id: 'solo', type: 'start' }];
    const dag = buildDAG(nodes, []);
    const order = topologicalSort(dag, nodes);
    assert.deepStrictEqual(order, ['solo']);
  });

  it('handles empty workflow', () => {
    const dag = buildDAG([], []);
    const order = topologicalSort(dag, []);
    assert.deepStrictEqual(order, []);
  });
});
