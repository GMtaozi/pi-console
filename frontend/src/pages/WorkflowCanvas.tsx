import React, { useCallback, useEffect, useState, useRef } from 'react';
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
import { Plus, Save, Play, Trash2, LayoutTemplate, BookmarkPlus, History, Bug } from 'lucide-react';
import { StartNode } from '../components/nodes/StartNode';
import { LLMNode } from '../components/nodes/LLMNode';
import { EndNode } from '../components/nodes/EndNode';
import { DebugToolbar } from '../components/DebugToolbar';
import { DebugPanel } from '../components/DebugPanel';
import { ExecutionLogDrawer } from '../components/ExecutionLogDrawer';
import { useWebSocket, type ServerMessage, type RuntimeStateSnapshot, type NodeState } from '../hooks/useWebSocket';
import type { NodeExecutionStatus } from '../components/nodes/NodeStatusStyles';

const nodeTypes = {
  start: StartNode,
  llm: LLMNode,
  end: EndNode,
};

const WS_URL = (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host.replace(/:\d+$/, '')}:3001`;
})();

export function WorkflowCanvas() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedWf, setSelectedWf] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [wfName, setWfName] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateModal, setSaveTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', tags: '', category: '' });

  // Debug state
  const [debugMode, setDebugMode] = useState<'normal' | 'step' | 'breakpoint'>('normal');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [nodeExecutionStates, setNodeExecutionStates] = useState<Record<string, NodeState>>({});
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [snapshot, setSnapshot] = useState<RuntimeStateSnapshot | undefined>(undefined);
  const [breakpoints, setBreakpoints] = useState<Record<string, { condition?: string }>>({});
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; nodeId: string } | null>(null);
  const [breakpointModal, setBreakpointModal] = useState<{ visible: boolean; nodeId: string; condition: string } | null>(null);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const executionIdRef = useRef<string | null>(null);
  executionIdRef.current = executionId;

  useEffect(() => {
    api.workflows.list().then((r) => {
      const list = r.data || [];
      setWorkflows(list);
      const selectId = sessionStorage.getItem('selectWorkflowId');
      if (selectId) {
        sessionStorage.removeItem('selectWorkflowId');
        const wf = list.find((w: any) => w.id === selectId);
        if (wf) selectWorkflow(wf);
      }
    });
    api.workflows.templates().then((r) => setTemplates(r.data || []));
  }, []);

  // WebSocket
  const { connected, send } = useWebSocket(WS_URL, {
    onMessage: handleServerMessage,
  });

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'started': {
        setExecutionId(msg.executionId);
        setIsRunning(true);
        setIsPaused(false);
        setShowDebugPanel(true);
        break;
      }
      case 'nodeStart': {
        setNodeExecutionStates((prev) => ({
          ...prev,
          [msg.nodeId]: {
            nodeId: msg.nodeId,
            nodeType: msg.nodeType,
            status: 'running',
          },
        }));
        break;
      }
      case 'nodeComplete': {
        setNodeExecutionStates((prev) => ({
          ...prev,
          [msg.nodeId]: {
            nodeId: msg.nodeId,
            nodeType: msg.nodeType,
            status: 'success',
            output: msg.output,
            durationMs: msg.durationMs,
          },
        }));
        break;
      }
      case 'paused': {
        setIsPaused(true);
        setSnapshot(msg.snapshot);
        if (msg.snapshot?.nodeStates) {
          setNodeExecutionStates(msg.snapshot.nodeStates);
        }
        break;
      }
      case 'resumed': {
        setIsPaused(false);
        break;
      }
      case 'completed':
      case 'failed': {
        setIsRunning(false);
        setIsPaused(false);
        setExecutionId(null);
        if (msg.type === 'failed') {
          // Mark any running nodes as error
          setNodeExecutionStates((prev) => {
            const updated = { ...prev };
            Object.keys(updated).forEach((k) => {
              if (updated[k].status === 'running') {
                updated[k] = { ...updated[k], status: 'error' as NodeExecutionStatus, error: msg.error };
              }
            });
            return updated;
          });
        }
        break;
      }
      case 'log': {
        // Could show toast or log to console
        console.log(`[${msg.level}] ${msg.message}`);
        break;
      }
      case 'breakpointSet': {
        setBreakpoints((prev) => ({
          ...prev,
          [msg.nodeId]: { condition: msg.condition },
        }));
        break;
      }
      case 'breakpointRemoved': {
        setBreakpoints((prev) => {
          const next = { ...prev };
          delete next[msg.nodeId];
          return next;
        });
        break;
      }
      case 'error': {
        console.error('WebSocket error:', msg.message);
        break;
      }
    }
  }

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
    setNodeExecutionStates({});
    setSnapshot(undefined);
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
    // Use REST API for normal execution, WebSocket for debug modes
    if (debugMode === 'normal') {
      await api.workflows.execute(selectedWf.id);
      return;
    }
    // WebSocket debug execution
    if (!connected) {
      alert('WebSocket not connected. Please wait or refresh.');
      return;
    }
    const id = crypto.randomUUID();
    setExecutionId(id);
    send({
      type: 'start',
      executionId: id,
      workflow: {
        id: selectedWf.id,
        name: selectedWf.name,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type || 'default',
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        })),
      },
      options: {
        mode: debugMode,
        inputs: {},
      },
    });
  }

  function handleStep() {
    if (executionIdRef.current) {
      send({ type: 'step', executionId: executionIdRef.current });
    }
  }

  function handleResume() {
    if (executionIdRef.current) {
      send({ type: 'resume', executionId: executionIdRef.current });
    }
  }

  function handleAbort() {
    if (executionIdRef.current) {
      send({ type: 'abort', executionId: executionIdRef.current });
    }
    setIsRunning(false);
    setIsPaused(false);
    setExecutionId(null);
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

  async function saveAsTemplate() {
    if (!selectedWf) return;
    try {
      const tags = templateForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
      await api.workflows.createTemplate({
        name: templateForm.name || `${selectedWf.name} Template`,
        description: templateForm.description,
        tags,
        category: templateForm.category,
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
      setSaveTemplateModal(false);
      setTemplateForm({ name: '', description: '', tags: '', category: '' });
      alert('Template saved successfully!');
    } catch (e: any) {
      alert('Failed to save template: ' + e.message);
    }
  }

  function addNode(type: string) {
    const id = `node_${Date.now()}`;
    const nodeTypeMap: Record<string, string> = {
      Start: 'start',
      LLM: 'llm',
      End: 'end',
      Parallel: 'parallel',
      Join: 'join',
    };
    const nodeType = nodeTypeMap[type] || 'default';
    const position = { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 };
    const newNode: Node = {
      id,
      type: nodeType,
      position,
      data: { label: type, model: nodeType === 'llm' ? 'gpt-4o' : undefined },
    };

    // When creating a Parallel node, atomically create an associated Join node
    if (nodeType === 'parallel') {
      const joinId = `${id}_join`;
      const joinNode: Node = {
        id: joinId,
        type: 'join',
        position: { x: position.x + 200, y: position.y },
        data: { label: 'Join', parallelId: id },
      };
      const joinEdge: Edge = {
        id: `edge_${id}_${joinId}`,
        source: id,
        target: joinId,
      };
      setNodes((nds) => [...nds, newNode, joinNode]);
      setEdges((eds) => [...eds, joinEdge]);
    } else {
      setNodes((nds) => [...nds, newNode]);
    }
  }

  // Merge node execution states into ReactFlow nodes data
  const nodesWithStatus = nodes.map((n) => {
    const execState = nodeExecutionStates[n.id];
    const bp = breakpoints[n.id];
    return {
      ...n,
      data: {
        ...n.data,
        status: execState?.status,
        durationMs: execState?.durationMs,
        retryCount: execState?.retryCount,
        breakpoint: !!bp,
        condition: bp?.condition,
      },
    };
  });

  // Context menu
  function handleNodeContextMenu(event: React.MouseEvent, node: Node) {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function handleSetBreakpoint(nodeId: string) {
    setBreakpointModal({ visible: true, nodeId, condition: '' });
    closeContextMenu();
  }

  function handleSetConditionalBreakpoint() {
    if (!breakpointModal) return;
    const { nodeId, condition } = breakpointModal;
    if (!selectedWf) return;
    send({
      type: 'setBreakpoint',
      workflowId: selectedWf.id,
      nodeId,
      condition: condition.trim() || undefined,
    });
    setBreakpointModal(null);
  }

  function handleRemoveBreakpoint(nodeId: string) {
    if (!selectedWf) return;
    send({
      type: 'removeBreakpoint',
      workflowId: selectedWf.id,
      nodeId,
    });
    closeContextMenu();
  }

  async function handleRetryNode(nodeId: string) {
    if (!selectedWf) return;
    closeContextMenu();
    // Retry from this node using WebSocket with startNodeId
    if (!connected) {
      alert('WebSocket not connected.');
      return;
    }
    const id = crypto.randomUUID();
    setExecutionId(id);
    send({
      type: 'start',
      executionId: id,
      workflow: {
        id: selectedWf.id,
        name: selectedWf.name,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type || 'default',
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        })),
      },
      options: {
        mode: debugMode,
        startNodeId: nodeId,
        inputs: {},
      },
    });
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 48px)' }} onClick={closeContextMenu}>
      {/* Left sidebar */}
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
                style={{ padding: '10px', background: '#0B1120', borderRadius: '6px', cursor: 'pointer', border: '1px solid transparent' }}
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

      {/* Main canvas area */}
      <div style={{ flex: 1, background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedWf ? (
          <>
            {/* Top toolbar */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input value={wfName} onChange={(e) => setWfName(e.target.value)} style={{ flex: 1, fontSize: '16px', fontWeight: 600, background: 'transparent', border: 'none', padding: 0 }} />
              <button onClick={saveWorkflow} style={{ padding: '6px 12px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <Save size={14} /> Save
              </button>
              <button onClick={executeWorkflow} style={{ padding: '6px 12px', background: '#10B981', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <Play size={14} /> Run
              </button>
              <button onClick={() => setShowLogDrawer(true)} style={{ padding: '6px 12px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <History size={14} /> Logs
              </button>
              <button onClick={() => setShowDebugPanel((s) => !s)} style={{ padding: '6px 12px', background: debugMode !== 'normal' || showDebugPanel ? '#3B82F6' : '#334155', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <Bug size={14} /> Debug
              </button>
              <button onClick={() => setSaveTemplateModal(true)} style={{ padding: '6px 12px', background: '#8B5CF6', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <BookmarkPlus size={14} /> Save as Template
              </button>
            </div>

            {/* Debug toolbar */}
            {(debugMode !== 'normal' || isRunning || isPaused) && (
              <DebugToolbar
                mode={debugMode}
                onModeChange={setDebugMode}
                isRunning={isRunning}
                isPaused={isPaused}
                onStart={executeWorkflow}
                onStep={handleStep}
                onResume={handleResume}
                onAbort={handleAbort}
              />
            )}

            {/* Canvas + optional debug panel */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1 }} ref={reactFlowWrapper}>
                <ReactFlow
                  nodes={nodesWithStatus}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  onNodeContextMenu={handleNodeContextMenu}
                  fitView
                  style={{ background: '#0B1120' }}
                >
                  <Background color="#334155" gap={20} />
                  <Controls />
                  <MiniMap nodeStrokeWidth={3} zoomable pannable style={{ background: '#1E293B' }} />
                  <Panel position="top-right">
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['Start', 'LLM', 'End', 'Parallel', 'Join'].map((t) => (
                        <button key={t} onClick={() => addNode(t)} style={{ padding: '6px 10px', background: '#334155', borderRadius: '6px', color: '#F8FAFC', fontSize: '12px' }}>
                          + {t}
                        </button>
                      ))}
                    </div>
                  </Panel>
                </ReactFlow>
              </div>

              {showDebugPanel && (
                <DebugPanel snapshot={snapshot} onClose={() => setShowDebugPanel(false)} />
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
            Select or create a workflow
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu?.visible && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#1E293B',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '6px 0',
            zIndex: 300,
            minWidth: '160px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {breakpoints[contextMenu.nodeId] ? (
            <div
              onClick={() => handleRemoveBreakpoint(contextMenu.nodeId)}
              style={{ padding: '8px 14px', fontSize: '13px', color: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#334155'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ width: '8px', height: '8px', background: '#EF4444', borderRadius: '50%' }} />
              Remove Breakpoint
            </div>
          ) : (
            <div
              onClick={() => handleSetBreakpoint(contextMenu.nodeId)}
              style={{ padding: '8px 14px', fontSize: '13px', color: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#334155'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ width: '8px', height: '8px', background: '#EF4444', borderRadius: '50%' }} />
              Set Breakpoint
            </div>
          )}
          <div
            onClick={() => handleRetryNode(contextMenu.nodeId)}
            style={{ padding: '8px 14px', fontSize: '13px', color: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #334155' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#334155'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span>↻</span> Retry This Node
          </div>
        </div>
      )}

      {/* Breakpoint condition modal */}
      {breakpointModal?.visible && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px' }}
          onClick={() => setBreakpointModal(null)}
        >
          <div style={{ background: '#1E293B', borderRadius: '12px', border: '1px solid #334155', width: '100%', maxWidth: '400px', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F8FAFC', marginBottom: '12px' }}>Set Breakpoint</h3>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '12px' }}>Node: {breakpointModal.nodeId}</p>
            <label style={{ fontSize: '12px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>Condition (optional)</label>
            <input
              value={breakpointModal.condition}
              onChange={(e) => setBreakpointModal({ ...breakpointModal, condition: e.target.value })}
              placeholder="e.g. {{prev.status}} == 'error'"
              style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', fontSize: '13px', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setBreakpointModal(null)} style={{ flex: 1, padding: '10px', background: '#334155', borderRadius: '8px', color: '#F8FAFC' }}>Cancel</button>
              <button onClick={handleSetConditionalBreakpoint} style={{ flex: 1, padding: '10px', background: '#EF4444', borderRadius: '8px', color: '#fff' }}>Set Breakpoint</button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Log Drawer */}
      {selectedWf && (
        <ExecutionLogDrawer workflowId={selectedWf.id} open={showLogDrawer} onClose={() => setShowLogDrawer(false)} />
      )}

      {/* Save as Template Modal */}
      {saveTemplateModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}
          onClick={() => setSaveTemplateModal(false)}
        >
          <div style={{ background: '#1E293B', borderRadius: '16px', border: '1px solid #334155', width: '100%', maxWidth: '440px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F8FAFC', marginBottom: '16px' }}>Save as Template</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Name</label>
                <input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder={`${selectedWf?.name || 'Workflow'} Template`} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Description</label>
                <textarea value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Tags (comma-separated)</label>
                <input value={templateForm.tags} onChange={(e) => setTemplateForm({ ...templateForm, tags: e.target.value })} placeholder="e.g. nlp, content" style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Category</label>
                <input value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} placeholder="e.g. content, dev, data" style={{ width: '100%', padding: '10px', background: '#0B1120', border: '1px solid #334155', borderRadius: '8px', color: '#F8FAFC' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setSaveTemplateModal(false)} style={{ flex: 1, padding: '10px', background: '#334155', borderRadius: '8px', color: '#F8FAFC' }}>Cancel</button>
              <button onClick={saveAsTemplate} style={{ flex: 1, padding: '10px', background: '#8B5CF6', borderRadius: '8px', color: '#fff' }}>Save Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
