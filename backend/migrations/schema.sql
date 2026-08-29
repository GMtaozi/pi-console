-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (chat sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Workflow Nodes
CREATE TABLE IF NOT EXISTS workflow_nodes (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT,
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  data TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Workflow Edges
CREATE TABLE IF NOT EXISTS workflow_edges (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  edge_id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Workflow Executions
CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  result TEXT,
  error TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Agent Config
CREATE TABLE IF NOT EXISTS agent_config (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  model TEXT DEFAULT 'gpt-4o',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2048,
  system_prompt TEXT,
  tools_enabled TEXT DEFAULT '[]',
  api_key TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Workflow Templates
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  nodes TEXT NOT NULL DEFAULT '[]',
  edges TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extensions
CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  enabled INTEGER DEFAULT 1,
  config TEXT DEFAULT '{}',
  package_name TEXT,
  install_path TEXT,
  installed_version TEXT,
  exports TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_workflow ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_edges_workflow ON workflow_edges(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_extensions_user ON extensions(user_id);

-- Migration: add api_key to agent_config
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS api_key TEXT;

-- Migration: add is_default to agent_config
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS is_default INTEGER DEFAULT 0;

-- Migration: drop unique constraint on agent_config.user_id if exists (PostgreSQL only)
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_config_user_id_key') THEN ALTER TABLE agent_config DROP CONSTRAINT agent_config_user_id_key; END IF; END $$;

-- Migration: add columns to extensions
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS install_path TEXT;
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS installed_version TEXT;
ALTER TABLE extensions ADD COLUMN IF NOT EXISTS exports TEXT DEFAULT '[]';
