import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Flag } from 'lucide-react';

export function EndNode({ data }: { data: any }) {
  return (
    <div
      style={{
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
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#F97316', width: '10px', height: '10px' }} />
      <Flag size={14} color="#F97316" />
      {data.label || 'End'}
    </div>
  );
}
