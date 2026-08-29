import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../services/api';
import { Plus, Save, Play, Trash2, LayoutTemplate } from 'lucide-react';
import { StartNode } from '../components/nodes/StartNode';
import { LLMNode } from '../components/nodes/LLMNode';
import { EndNode } from '../components/nodes/EndNode';

const nodeTypes = {
  start: StartNode,
  llm: LLMNode,
  end: EndNode,
};

export function WorkflowCanvas() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedWf, setSelectedWf] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [wfName, setWfName] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    api.workflows.list().then((r) => setWorkflows(r.data || []));
    api.workflows.templates().then((r) => setTemplates(r.data || []));
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  async function createWorkflow() {
    const w = await api.workflows.create('New Workflow', '');
    setWorkflows([w, ...workflows]);
    selectWorkflow(w);
  }

  async function createFromTemplate(templateId: string) {
    const w = await api.workflows.fromTemplate(templateId);
    setWorkflows([w, ...workflows]);
    setShowTemplates(false);
    selectWorkflow(w);
  }

  async function selectWorkflow(w: any) {
    setSelectedWf(w);
    setWfName(w.name);
    const detail: any = await api.workflows.get(w.id);
    const rawNodes: any[] = detail.nodes || [];
    const rawEdges: any[] = detail.edges || [];
    const ns: Node[] = rawNodes.map((n: any) => ({
      id: n.node_id,
      type: n.type || 'default',
      position: { x: n.position_x || 0, y: n.position_y || 0 },
      data: { label: n.label, ...(n.data ? JSON.parse(n.data) : {}) },
    }));
    const es: Edge[] = rawEdges.map((e: any) => ({
      id: e.edge_id,
      source: e.source,
      target: e.target,
      label: e.label,
    }));
    setNodes(ns);
    setEdges(es);
  }

  async function saveWorkflow() {
    if (!selectedWf) return;
    await api.workflows.update(selectedWf.id, {
      name: wfName,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type || 'default',
        label: n.data?.label || n.id,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
      })),
    });
    const updated = workflows.map((w) => (w.id === selectedWf.id ? { ...w, name: wfName } : w));
    setWorkflows(updated);
  }

  async function executeWorkflow() {
    if (!selectedWf) return;
    await api.workflows.execute(selectedWf.id);
    alert('Workflow execution started');
  }

  async function deleteWorkflow(id: string) {
    await api.workflows.delete(id);
    if (selectedWf?.id === id) {
      setSelectedWf(null);
      setNodes([]);
      setEdges([]);
    }
    setWorkflows(workflows.filter((w) => w.id !== id));
  }

  function addNode(type: string) {
    const id = `node_${Date.now()}`;
    const nodeTypeMap: Record<string, string> = {
      Start: 'start',
      LLM: 'llm',
      End: 'end',
    };
    const nodeType = nodeTypeMap[type] || 'default';
    const newNode: Node = {
      id,
      type: nodeType,
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
      data: { label: type, model: nodeType === 'llm' ? 'gpt-4o' : undefined },
    };
    setNodes((nds) => [...nds, newNode]);
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 48px)' }}>
      <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={createWorkflow} style={{ flex: 1, padding: '8px', background: '#3B82F6', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={16} /> New
          </button>
          <button onClick={() => setShowTemplates(!showTemplates)} style={{ flex: 1, padding: '8px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <LayoutTemplate size={16} /> Template
          </button>
        </div>

        {showTemplates && (
          <div style={{ background: '#1E293B', borderRadius: '8px', border: '1px solid #334155', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Choose a template</div>
            {templates.map((t) => (
              <div
                key={t.id}
                onClick={() => createFromTemplate(t.id)}
                style={{
                  padding: '10px',
                  background: '#0B1120',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#334155'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
              >
                <div style={{ fontWeight: 500, color: '#F8FAFC', fontSize: '13px' }}>{t.name}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{t.description}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {workflows.map((w) => (
            <div
              key={w.id}
              onClick={() => selectWorkflow(w)}
              style={{
                padding: '12px',
                background: selectedWf?.id === w.id ? 'rgba(59,130,246,0.15)' : '#1E293B',
                borderRadius: '8px',
                cursor: 'pointer',
                border: selectedWf?.id === w.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 500, color: '#F8FAFC', fontSize: '14px' }}>{w.name}</div>
              <button onClick={(e) => { e.stopPropagation(); deleteWorkflow(w.id); }} style={{ color: '#94A3B8' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedWf ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input value={wfName} onChange={(e) => setWfName(e.target.value)} style={{ flex: 1, fontSize: '16px', fontWeight: 600, background: 'transparent', border: 'none', padding: 0 }} />
              <button onClick={saveWorkflow} style={{ padding: '6px 12px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <Save size={14} /> Save
              </button>
              <button onClick={executeWorkflow} style={{ padding: '6px 12px', background: '#10B981', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <Play size={14} /> Run
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                style={{ background: '#0B1120' }}
              >
                <Background color="#334155" gap={20} />
                <Controls />
                <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ background: '#1E293B' }} />
                <Panel position="top-right">
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['Start', 'LLM', 'End'].map((t) => (
                      <button key={t} onClick={() => addNode(t)} style={{ padding: '6px 10px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', fontSize: '12px' }}>
                        + {t}
                      </button>
                    ))}
                  </div>
                </Panel>
              </ReactFlow>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
            Select or create a workflow
          </div>
        )}
      </div>
    </div>
  );
}
