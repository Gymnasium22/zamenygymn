import { safeLocalStorageGet, safeLocalStorageSet } from './localStorage';

export interface LessonEditEntry {
    at: string;
    by: string;
    summary: string;
}

const key = (orgId?: string | null) => `gym_lesson_history_v1_${orgId || 'local'}`;

const loadAll = (orgId?: string | null): Record<string, LessonEditEntry[]> => {
    try {
        const raw = safeLocalStorageGet(key(orgId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export function getLessonHistory(itemId: string, orgId?: string | null): LessonEditEntry[] {
    return loadAll(orgId)[itemId] || [];
}

export function appendLessonHistory(
    itemId: string,
    entry: LessonEditEntry,
    orgId?: string | null
): LessonEditEntry[] {
    const all = loadAll(orgId);
    const next = [...(all[itemId] || []), entry].slice(-30);
    all[itemId] = next;
    safeLocalStorageSet(key(orgId), JSON.stringify(all));
    return next;
}

export function formatHistoryTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return iso;
    }
}
