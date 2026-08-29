-- =============================================
-- Phase 2: Execution Logs & Global Variables
-- =============================================

-- Execution logs (per workflow run)
CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','stopped')),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_ms INTEGER,
  error_message TEXT,
  trigger_type TEXT DEFAULT 'manual' CHECK(trigger_type IN ('manual','webhook','scheduled','api')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Node execution logs (per node execution)
CREATE TABLE IF NOT EXISTS node_execution_logs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','success','error','retrying','skipped')),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_ms INTEGER,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (execution_id) REFERENCES execution_logs(id) ON DELETE CASCADE
);

-- Execution log details (inputs/outputs/config snapshots)
CREATE TABLE IF NOT EXISTS execution_log_details (
  id TEXT PRIMARY KEY,
  node_execution_id TEXT NOT NULL,
  detail_type TEXT CHECK(detail_type IN ('input','output','config','error')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_execution_id) REFERENCES node_execution_logs(id) ON DELETE CASCADE
);

-- Global variables (environment-isolated)
CREATE TABLE IF NOT EXISTS global_variables (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string' CHECK(type IN ('string','number','boolean','json')),
  environment TEXT DEFAULT 'development' CHECK(environment IN ('development','staging','production')),
  is_sensitive INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, key, environment)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exec_logs_workflow ON execution_logs(workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_logs_user ON execution_logs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_node_exec_logs_execution ON node_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_exec_details_node ON execution_log_details(node_execution_id);
CREATE INDEX IF NOT EXISTS idx_global_vars_user_env ON global_variables(user_id, environment);
