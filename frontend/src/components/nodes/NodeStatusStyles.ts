/**
 * Node execution status styles for ReactFlow nodes.
 * Supports 6 states: idle, running, success, error, retrying, skipped.
 */

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'retrying' | 'skipped';

export interface NodeStatusData {
  status?: NodeExecutionStatus;
  durationMs?: number;
  retryCount?: number;
  breakpoint?: boolean;
  condition?: string;
}

const statusBorderColors: Record<NodeExecutionStatus, string> = {
  idle: 'transparent',
  running: '#3B82F6',
  success: '#10B981',
  error: '#EF4444',
  retrying: '#F59E0B',
  skipped: '#94A3B8',
};

const statusBgColors: Record<NodeExecutionStatus, string> = {
  idle: '',
  running: 'rgba(59,130,246,0.08)',
  success: 'rgba(16,185,129,0.08)',
  error: 'rgba(239,68,68,0.08)',
  retrying: 'rgba(245,158,11,0.08)',
  skipped: 'rgba(148,163,184,0.04)',
};

export function getNodeStatusStyle(
  baseStyle: React.CSSProperties,
  status?: NodeExecutionStatus
): React.CSSProperties {
  if (!status || status === 'idle') return baseStyle;

  const borderColor = statusBorderColors[status];
  const bgColor = statusBgColors[status];

  const style: React.CSSProperties = {
    ...baseStyle,
    borderColor,
    borderWidth: '2px',
    borderStyle: status === 'skipped' ? 'dashed' : 'solid',
  };

  if (bgColor) {
    style.background = bgColor;
  }

  return style;
}

export function getStatusIcon(status?: NodeExecutionStatus): string {
  switch (status) {
    case 'success': return '✓';
    case 'error': return '✕';
    case 'retrying': return '↻';
    case 'skipped': return '⊘';
    default: return '';
  }
}

export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
