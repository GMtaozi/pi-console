import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Cpu } from 'lucide-react';

export function LLMNode({ data }: { data: any }) {
  return (
    <div
      style={{
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
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#3B82F6', width: '10px', height: '10px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Cpu size={14} color="#3B82F6" />
        <span>{data.label || 'LLM'}</span>
      </div>
      {data.model && (
        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 400 }}>
          {data.model}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#3B82F6', width: '10px', height: '10px' }} />
    </div>
  );
}
