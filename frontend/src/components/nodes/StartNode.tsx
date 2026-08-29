import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play } from 'lucide-react';

export function StartNode({ data }: { data: any }) {
  return (
    <div
      style={{
        padding: '12px 20px',
        background: '#064E3B',
        border: '2px solid #10B981',
        borderRadius: '24px',
        color: '#F8FAFC',
        fontSize: '14px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: '100px',
        justifyContent: 'center',
      }}
    >
      <Play size={14} color="#10B981" />
      {data.label || 'Start'}
      <Handle type="source" position={Position.Bottom} style={{ background: '#10B981', width: '10px', height: '10px' }} />
    </div>
  );
}
