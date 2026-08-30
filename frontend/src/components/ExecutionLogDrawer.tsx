import React, { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronRight, Clock, Filter } from 'lucide-react';
import { api } from '../services/api';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

interface ExecutionLog {
  id: string;
  workflow_id: string;
  status: ExecutionStatus;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  trigger_type: string;
  error_message?: string;
}

interface NodeExecutionLog {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: string;
  status: string;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  retry_count?: number;
  error_message?: string;
  details?: Record<string, any>;
}

interface ExecutionLogDrawerProps {
  workflowId: string;
  open: boolean;
  onClose: () => void;
}

export function ExecutionLogDrawer({ workflowId, open, onClose }: ExecutionLogDrawerProps) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | ''>('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nodeLogs, setNodeLogs] = useState<Record<string, NodeExecutionLog[]>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    if (open && workflowId) {
      loadLogs();
    }
  }, [open, workflowId, statusFilter, startTime, endTime, page]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params: any = { page, pageSize };
      if (statusFilter) params.status = statusFilter;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const res = await api.executions.list(workflowId, params);
      setLogs(res.data || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      console.error('Failed to load execution logs:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function expandExecution(executionId: string) {
    if (expandedId === executionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(executionId);
    if (!nodeLogs[executionId]) {
      try {
        const res = await api.executions.nodes(executionId);
        setNodeLogs((prev) => ({ ...prev, [executionId]: res.data || [] }));
      } catch (e: any) {
        console.error('Failed to load node logs:', e.message);
      }
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        height: '100vh',
        background: '#1E293B',
        borderLeft: '1px solid #334155',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #334155' }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>Execution History</span>
        <button onClick={onClose} style={{ color: '#94A3B8' }}><X size={18} /></button>
      </div>

      {/* Filters */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} color="#94A3B8" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ExecutionStatus | ''); setPage(1); }}
            style={{ flex: 1, padding: '5px 8px', fontSize: '12px', background: '#0B1120', border: '1px solid #334155', borderRadius: '4px', color: '#F8FAFC' }}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="stopped">Stopped</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => { setStartTime(e.target.value); setPage(1); }}
            style={{ flex: 1, padding: '5px 8px', fontSize: '11px', background: '#0B1120', border: '1px solid #334155', borderRadius: '4px', color: '#F8FAFC' }}
            placeholder="Start"
          />
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => { setEndTime(e.target.value); setPage(1); }}
            style={{ flex: 1, padding: '5px 8px', fontSize: '11px', background: '#0B1120', border: '1px solid #334155', borderRadius: '4px', color: '#F8FAFC' }}
            placeholder="End"
          />
        </div>
      </div>

      {/* Log list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {loading && <div style={{ color: '#94A3B8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Loading...</div>}
        {!loading && logs.length === 0 && (
          <div style={{ color: '#94A3B8', fontSize: '13px', textAlign: 'center', padding: '40px 20px' }}>No execution logs found</div>
        )}
        {logs.map((log) => (
          <div key={log.id} style={{ marginBottom: '6px' }}>
            <div
              onClick={() => expandExecution(log.id)}
              style={{
                padding: '10px 12px',
                background: '#0B1120',
                borderRadius: '6px',
                border: '1px solid #334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {expandedId === log.id ? <ChevronDown size={14} color="#94A3B8" /> : <ChevronRight size={14} color="#94A3B8" />}
                <div>
                  <div style={{ fontSize: '12px', color: '#F8FAFC', fontWeight: 500 }}>{log.id.slice(0, 8)}...</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <Clock size={11} />
                    {new Date(log.started_at).toLocaleString()}
                    {log.duration_ms !== undefined && ` · ${(log.duration_ms / 1000).toFixed(1)}s`}
                  </div>
                </div>
              </div>
              <StatusBadge status={log.status} />
            </div>

            {expandedId === log.id && (
              <div style={{ marginTop: '4px', marginLeft: '12px', padding: '10px', background: '#0B1120', borderRadius: '6px', border: '1px solid #334155' }}>
                {nodeLogs[log.id] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {nodeLogs[log.id].map((nl) => (
                      <div key={nl.id} style={{ padding: '8px', background: '#1E293B', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#F8FAFC', fontWeight: 500 }}>{nl.node_id}</span>
                          <NodeStatusBadge status={nl.status} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                          Type: {nl.node_type}
                          {nl.duration_ms !== undefined && ` · ${(nl.duration_ms / 1000).toFixed(1)}s`}
                          {nl.retry_count !== undefined && nl.retry_count > 0 && ` · Retries: ${nl.retry_count}`}
                        </div>
                        {nl.error_message && (
                          <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>{nl.error_message}</div>
                        )}
                        {nl.details && Object.keys(nl.details).length > 0 && (
                          <div style={{ marginTop: '6px', padding: '6px', background: '#0B1120', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', color: '#94A3B8', maxHeight: '100px', overflow: 'auto' }}>
                            {Object.entries(nl.details).map(([k, v]) => (
                              <div key={k} style={{ marginBottom: '2px' }}>
                                <span style={{ color: '#64748B' }}>{k}:</span>{' '}
                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#94A3B8', fontSize: '12px', textAlign: 'center' }}>Loading node details...</div>
                )}
                {log.error_message && (
                  <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', fontSize: '11px', color: '#EF4444' }}>
                    <strong>Error:</strong> {log.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '4px 10px', fontSize: '12px', background: '#334155', borderRadius: '4px', color: '#F8FAFC', opacity: page <= 1 ? 0.5 : 1 }}
          >
            Prev
          </button>
          <span style={{ fontSize: '12px', color: '#94A3B8' }}>
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / pageSize)}
            style={{ padding: '4px 10px', fontSize: '12px', background: '#334155', borderRadius: '4px', color: '#F8FAFC', opacity: page >= Math.ceil(total / pageSize) ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ExecutionStatus }) {
  const colors: Record<string, { bg: string; color: string }> = {
    pending: { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' },
    running: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
    completed: { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
    failed: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
    stopped: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function NodeStatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    pending: { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' },
    running: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
    success: { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
    error: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
    retrying: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
    skipped: { bg: 'rgba(148,163,184,0.1)', color: '#94A3B8' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}
