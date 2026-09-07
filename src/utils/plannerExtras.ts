import { safeLocalStorageGet, safeLocalStorageSet } from './localStorage';

export type PlannerScope = 'personal' | 'school';

export interface PlannerExtras {
    scope: PlannerScope;
    assigneeId?: string;
    calendarEventId?: string;
}

const storageKey = (orgId?: string | null) => `gym_planner_extras_v1_${orgId || 'local'}`;

export function loadPlannerExtras(orgId?: string | null): Record<string, PlannerExtras> {
    try {
        const raw = safeLocalStorageGet(storageKey(orgId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function savePlannerExtras(orgId: string | null | undefined, map: Record<string, PlannerExtras>) {
    safeLocalStorageSet(storageKey(orgId), JSON.stringify(map));
}

export function upsertPlannerExtra(
    orgId: string | null | undefined,
    taskId: string,
    extra: PlannerExtras
) {
    const map = loadPlannerExtras(orgId);
    map[taskId] = extra;
    savePlannerExtras(orgId, map);
}

export function removePlannerExtra(orgId: string | null | undefined, taskId: string) {
    const map = loadPlannerExtras(orgId);
    delete map[taskId];
    savePlannerExtras(orgId, map);
}
