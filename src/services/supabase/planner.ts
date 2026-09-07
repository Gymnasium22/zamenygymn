import { supabase } from '../supabase';
import { PlannerExtras } from '../../utils/plannerExtras';

export type PlannerTaskPriority = 'low' | 'medium' | 'high';
export type PlannerTaskStatus = 'todo' | 'in-progress' | 'done';

export interface PlannerTask {
    id: string;
    title: string;
    description?: string;
    deadline?: string;
    priority: PlannerTaskPriority;
    status: PlannerTaskStatus;
    createdAt: string;
    completedAt?: string;
    organizationId?: string;
    extras?: PlannerExtras;
}

function parseExtras(raw: unknown): PlannerExtras | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const o = raw as Record<string, unknown>;
    const scope = o.scope === 'personal' ? 'personal' : o.scope === 'school' ? 'school' : undefined;
    if (!scope && !o.assigneeId && !o.calendarEventId) return undefined;
    return {
        scope: scope || 'school',
        assigneeId: typeof o.assigneeId === 'string' ? o.assigneeId : undefined,
        calendarEventId: typeof o.calendarEventId === 'string' ? o.calendarEventId : undefined
    };
}

function mapRow(row: Record<string, unknown>): PlannerTask {
    return {
        id: row.id as string,
        title: (row.title as string) || '',
        description: (row.description as string) || undefined,
        deadline: row.deadline
            ? String(row.deadline).split('T')[0]
            : undefined,
        priority: (row.priority as PlannerTaskPriority) || 'medium',
        status: (row.status as PlannerTaskStatus) || 'todo',
        createdAt: (row.created_at as string) || new Date().toISOString(),
        completedAt: (row.completed_at as string) || undefined,
        organizationId: row.organization_id as string | undefined,
        extras: parseExtras(row.extras)
    };
}

function toRow(task: PlannerTask, organizationId: string): Record<string, unknown> {
    return {
        id: task.id,
        organization_id: organizationId,
        title: task.title,
        description: task.description || null,
        deadline: task.deadline || null,
        priority: task.priority,
        status: task.status,
        created_at: task.createdAt || new Date().toISOString(),
        completed_at: task.completedAt || null,
        updated_at: new Date().toISOString(),
        extras: task.extras || {}
    };
}

export const plannerService = {
    list: async (organizationId: string): Promise<PlannerTask[]> => {
        const { data, error } = await supabase
            .from('planner_tasks')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((r) => mapRow(r as Record<string, unknown>));
    },

    upsert: async (task: PlannerTask, organizationId: string): Promise<void> => {
        const { error } = await supabase.from('planner_tasks').upsert(toRow(task, organizationId));
        if (error) throw error;
    },

    remove: async (id: string, organizationId: string): Promise<void> => {
        const { error } = await supabase
            .from('planner_tasks')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);
        if (error) throw error;
    },

    /** One-shot migrate of localStorage tasks into Supabase for this org. */
    migrateFromLocal: async (organizationId: string, localTasks: PlannerTask[]): Promise<number> => {
        if (!localTasks.length) return 0;
        const rows = localTasks.map((t) => toRow(t, organizationId));
        const { error } = await supabase.from('planner_tasks').upsert(rows);
        if (error) throw error;
        return rows.length;
    }
};
