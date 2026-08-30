import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Flag } from 'lucide-react';
import { getNodeStatusStyle, formatDuration, type NodeExecutionStatus } from './NodeStatusStyles';

interface EndNodeData {
  label?: string;
  status?: NodeExecutionStatus;
  durationMs?: number;
  breakpoint?: boolean;
  condition?: string;
}

export function EndNode({ data }: { data: EndNodeData }) {
  const baseStyle: React.CSSProperties = {
    padding: '12px 20px',
    background: '#7C2D12',
    border: '2px solid #F97316',
    borderRadius: '24px',
    color: '#F8FAFC',
    fontSize: '14px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '100px',
    justifyContent: 'center',
    position: 'relative',
  };

  const style = getNodeStatusStyle(baseStyle, data.status);

  return (
    <div style={style} className={data.status === 'running' ? 'node-pulse' : ''}>
      <Handle type="target" position={Position.Top} style={{ background: '#F97316', width: '10px', height: '10px' }} />
      <Flag size={14} color="#F97316" />
      <span>{data.label || 'End'}</span>
      {data.durationMs !== undefined && data.durationMs > 0 && (
        <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 400, marginLeft: '2px' }}>
          {formatDuration(data.durationMs)}
        </span>
      )}
      {data.status === 'success' && <span style={{ color: '#10B981', fontSize: '12px' }}>✓</span>}
      {data.status === 'error' && <span style={{ color: '#EF4444', fontSize: '12px' }}>✕</span>}
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
    </div>
  );
}
