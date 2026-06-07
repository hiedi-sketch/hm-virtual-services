-- Migration: agent layer tables
-- Depends on: clients table with uuid primary key

-- ============================================================
-- Trigger function: stamp updated_at on row modification
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. agents
-- ============================================================
CREATE TABLE agents (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          varchar(100)  NOT NULL,
  description   text,
  system_prompt text          NOT NULL,
  model         varchar(50)   NOT NULL DEFAULT 'claude-sonnet-4-6',
  status        varchar(20)   NOT NULL DEFAULT 'active',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER agents_set_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. agent_tools
-- ============================================================
CREATE TABLE agent_tools (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name  varchar(100) NOT NULL,
  enabled    boolean      NOT NULL DEFAULT true
);

-- ============================================================
-- 3. agent_triggers
-- ============================================================
CREATE TABLE agent_triggers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trigger_type   varchar(50) NOT NULL,
  trigger_config jsonb
);

-- ============================================================
-- 4. agent_runs
-- ============================================================
CREATE TABLE agent_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trigger_type varchar(50),
  status       varchar(20),
  input        jsonb,
  output       jsonb,
  steps        jsonb,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX agent_runs_agent_id_idx ON agent_runs(agent_id);
CREATE INDEX agent_runs_status_idx   ON agent_runs(status);

-- ============================================================
-- 5. agent_memory
-- ============================================================
CREATE TABLE agent_memory (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_id  uuid         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key        varchar(200) NOT NULL,
  value      text,
  updated_at timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (agent_id, client_id, key)
);

CREATE INDEX agent_memory_agent_client_idx ON agent_memory(agent_id, client_id);

CREATE TRIGGER agent_memory_set_updated_at
  BEFORE UPDATE ON agent_memory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
