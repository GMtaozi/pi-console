import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Cpu, RefreshCw } from 'lucide-react';
import { getNodeStatusStyle, formatDuration, type NodeExecutionStatus } from './NodeStatusStyles';

interface LLMNodeData {
  label?: string;
  model?: string;
  status?: NodeExecutionStatus;
  durationMs?: number;
  retryCount?: number;
  breakpoint?: boolean;
  condition?: string;
}

export function LLMNode({ data }: { data: LLMNodeData }) {
  const baseStyle: React.CSSProperties = {
    padding: '12px 16px',
    background: '#1E3A5F',
    border: '2px solid #3B82F6',
    borderRadius: '10px',
    color: '#F8FAFC',
    fontSize: '14px',
    fontWeight: 600,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    minWidth: '140px',
    position: 'relative',
  };

  const style = getNodeStatusStyle(baseStyle, data.status);

  return (
    <div style={style} className={data.status === 'running' ? 'node-pulse' : ''}>
      <Handle type="target" position={Position.Top} style={{ background: '#3B82F6', width: '10px', height: '10px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {data.status === 'retrying' ? (
          <RefreshCw size={14} color="#F59E0B" className="spin-icon" />
        ) : (
          <Cpu size={14} color="#3B82F6" />
        )}
        <span>{data.label || 'LLM'}</span>
      </div>
      {data.model && (
        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 400 }}>
          {data.model}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {data.durationMs !== undefined && data.durationMs > 0 && (
          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 400 }}>
            {formatDuration(data.durationMs)}
          </span>
        )}
        {data.retryCount !== undefined && data.retryCount > 0 && (
          <span style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 500 }}>
            r{data.retryCount}
          </span>
        )}
        {data.status === 'success' && <span style={{ color: '#10B981', fontSize: '12px' }}>✓</span>}
        {data.status === 'error' && <span style={{ color: '#EF4444', fontSize: '12px' }}>✕</span>}
        {data.status === 'skipped' && <span style={{ color: '#94A3B8', fontSize: '12px' }}>⊘</span>}
      </div>
      {data.breakpoint && (
        <div
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            width: '10px',
            height: '10px',
            background: '#EF4444',
            borderRadius: '50%',
            border: '2px solid #1E293B',
          }}
          title={data.condition ? `Breakpoint: ${data.condition}` : 'Breakpoint'}
        />
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#3B82F6', width: '10px', height: '10px' }} />
    </div>
  );
}
