-- Planner tasks per organization (isolated via organization_id + RLS)

CREATE TABLE IF NOT EXISTS planner_tasks (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    deadline DATE,
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in-progress', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planner_tasks_org_idx
    ON planner_tasks (organization_id);

CREATE INDEX IF NOT EXISTS planner_tasks_org_status_idx
    ON planner_tasks (organization_id, status);

ALTER TABLE planner_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planner_tasks_select ON planner_tasks;
DROP POLICY IF EXISTS planner_tasks_insert ON planner_tasks;
DROP POLICY IF EXISTS planner_tasks_update ON planner_tasks;
DROP POLICY IF EXISTS planner_tasks_delete ON planner_tasks;

-- Org isolation: only own organization (or superadmin for any org)
CREATE POLICY planner_tasks_select ON planner_tasks
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY planner_tasks_insert ON planner_tasks
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY planner_tasks_update ON planner_tasks
    FOR UPDATE TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin())
    WITH CHECK (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY planner_tasks_delete ON planner_tasks
    FOR DELETE TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());
