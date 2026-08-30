-- =============================================
-- Phase 2 Batch 2: Debugging & Observability Schema
-- =============================================

-- Breakpoints table (per-workflow per-node)
CREATE TABLE IF NOT EXISTS breakpoints (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  condition TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  UNIQUE(workflow_id, node_id)
);

-- Execution breakpoints snapshot (record which breakpoints were active during an execution)
CREATE TABLE IF NOT EXISTS execution_breakpoints (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  condition TEXT,
  triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (execution_id) REFERENCES execution_logs(id) ON DELETE CASCADE
);

-- Indexes for debugging schema
CREATE INDEX IF NOT EXISTS idx_breakpoints_workflow ON breakpoints(workflow_id);
CREATE INDEX IF NOT EXISTS idx_exec_breakpoints_execution ON execution_breakpoints(execution_id);
