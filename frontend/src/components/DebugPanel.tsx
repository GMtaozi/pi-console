import React from 'react';
import { X } from 'lucide-react';
import type { RuntimeStateSnapshot } from '../hooks/useWebSocket';

interface DebugPanelProps {
  snapshot?: RuntimeStateSnapshot;
  onClose: () => void;
}

export function DebugPanel({ snapshot, onClose }: DebugPanelProps) {
  if (!snapshot) {
    return (
      <div
        style={{
          width: '320px',
          background: '#1E293B',
          borderLeft: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC' }}>Debug Info</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }}><X size={16} /></button>
        </div>
        <div style={{ color: '#94A3B8', fontSize: '13px', textAlign: 'center', marginTop: '40px' }}>
          Execution not paused.
          <br />
          Start debugging to see state.
        </div>
      </div>
    );
  }

  const { nodeStates, contextSnapshot, callStack, currentNodeId } = snapshot;

  return (
    <div
      style={{
        width: '340px',
        background: '#1E293B',
        borderLeft: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #334155' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC' }}>Debug State</span>
        <button onClick={onClose} style={{ color: '#94A3B8' }}><X size={16} /></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Current Node */}
        <div>
          <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Current Node</div>
          <div style={{ background: '#0B1120', borderRadius: '6px', padding: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '13px', color: '#F8FAFC', fontWeight: 500 }}>
              {currentNodeId || '—'}
            </div>
            {currentNodeId && nodeStates[currentNodeId] && (
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                Type: {nodeStates[currentNodeId].nodeType} · Status: {nodeStates[currentNodeId].status}
              </div>
            )}
          </div>
        </div>

        {/* Node States */}
        <div>
          <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Node States</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.values(nodeStates).map((ns) => (
              <div
                key={ns.nodeId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  background: '#0B1120',
                  borderRadius: '4px',
                  fontSize: '12px',
                  border: '1px solid #334155',
                }}
              >
                <span style={{ color: '#F8FAFC' }}>{ns.nodeId}</span>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500,
                    background:
                      ns.status === 'success' ? 'rgba(16,185,129,0.15)' :
                      ns.status === 'error' ? 'rgba(239,68,68,0.15)' :
                      ns.status === 'running' ? 'rgba(59,130,246,0.15)' :
                      ns.status === 'retrying' ? 'rgba(245,158,11,0.15)' :
                      ns.status === 'skipped' ? 'rgba(148,163,184,0.1)' :
                      'transparent',
                    color:
                      ns.status === 'success' ? '#10B981' :
                      ns.status === 'error' ? '#EF4444' :
                      ns.status === 'running' ? '#3B82F6' :
                      ns.status === 'retrying' ? '#F59E0B' :
                      ns.status === 'skipped' ? '#94A3B8' :
                      '#94A3B8',
                  }}
                >
                  {ns.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Context Snapshot */}
        <div>
          <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Context Snapshot</div>
          <SnapshotSection title="Outputs" data={contextSnapshot.outputs} />
          <SnapshotSection title="Global Variables" data={contextSnapshot.globalVars} />
          <SnapshotSection title="Workflow Inputs" data={contextSnapshot.workflowInputs} />
        </div>

        {/* Call Stack */}
        {callStack.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Call Stack</div>
            <div style={{ background: '#0B1120', borderRadius: '6px', padding: '10px', border: '1px solid #334155', fontSize: '12px', color: '#F8FAFC', fontFamily: 'monospace' }}>
              {callStack.map((item, i) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  {i}: {item}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotSection({ title, data }: { title: string; data: Record<string, any> }) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return (
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>Empty</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>{title}</div>
      <div style={{ background: '#0B1120', borderRadius: '6px', padding: '8px', border: '1px solid #334155', fontSize: '12px', fontFamily: 'monospace', color: '#F8FAFC', maxHeight: '120px', overflow: 'auto' }}>
        {keys.map((key) => (
          <div key={key} style={{ marginBottom: '4px', wordBreak: 'break-all' }}>
            <span style={{ color: '#94A3B8' }}>{key}:</span>{' '}
            {typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key])}
          </div>
        ))}
      </div>
    </div>
  );
}
