import { AppData } from '../types';
import { INITIAL_DATA } from '../constants';
import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { isSupabase } from './dbProvider';

interface SaveDataPayload {
    teachers: Record<string, unknown>[];
    subjects: Record<string, unknown>[];
    classes: Record<string, unknown>[];
    rooms: Record<string, unknown>[];
    schedule1: Record<string, unknown>[];
    schedule2: Record<string, unknown>[];
    substitutions: Record<string, unknown>[];
    dutyZones: Record<string, unknown>[];
    dutySchedule: Record<string, unknown>[];
    nutritionRecords: Record<string, unknown>[];
    absenteeismRecords: Record<string, unknown>[];
    settings: Record<string, unknown>;
}

const toSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
};

const fromSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        result[camelKey] = obj[key];
    }
    return result;
};

export const supabaseDbService = {
    subscribe: (onData: (data: AppData) => void, onError: (error: Error) => void) => {
        const loadAll = async () => {
            try {
                const [
                    teachersRes,
                    subjectsRes,
                    classesRes,
                    roomsRes,
                    schedule1Res,
                    schedule2Res,
                    substitutionsRes,
                    settingsRes,
                    dutyRes,
                    nutritionRes,
                    absenteeismRes
                ] = await Promise.all([
                    supabase.from('teachers').select('*'),
                    supabase.from('subjects').select('*'),
                    supabase.from('classes').select('*'),
                    supabase.from('rooms').select('*'),
                    supabase.from('schedule_items').select('*').eq('semester', 1),
                    supabase.from('schedule_items').select('*').eq('semester', 2),
                    supabase.from('substitutions').select('*'),
                    supabase.from('settings').select('*').single(),
                    supabase.from('duty').select('*'),
                    supabase.from('nutrition').select('*'),
                    supabase.from('absenteeism').select('*')
                ]);

                if (teachersRes.error) throw teachersRes.error;
                if (subjectsRes.error) throw subjectsRes.error;
                if (classesRes.error) throw classesRes.error;
                if (roomsRes.error) throw roomsRes.error;
                if (schedule1Res.error) throw schedule1Res.error;
                if (schedule2Res.error) throw schedule2Res.error;
                if (substitutionsRes.error) throw substitutionsRes.error;
                if (dutyRes.error) throw dutyRes.error;
                if (nutritionRes.error) throw nutritionRes.error;
                if (absenteeismRes.error) throw absenteeismRes.error;

                const data: AppData = {
                    ...INITIAL_DATA,
                    teachers: (teachersRes.data || []).map((t: Record<string, unknown>) => ({ ...fromSnakeCase(t), id: t.id })),
                    subjects: (subjectsRes.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })),
                    classes: (classesRes.data || []).map((c: Record<string, unknown>) => ({ ...fromSnakeCase(c), id: c.id })),
                    rooms: (roomsRes.data || []).map((r: Record<string, unknown>) => ({ ...fromSnakeCase(r), id: r.id })),
                    schedule1: (schedule1Res.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })),
                    schedule2: (schedule2Res.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })),
                    substitutions: (substitutionsRes.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })),
                    dutySchedule: (dutyRes.data || []).map((d: Record<string, unknown>) => ({ ...fromSnakeCase(d), id: d.id })),
                    nutritionRecords: (nutritionRes.data || []).map((n: Record<string, unknown>) => ({ ...fromSnakeCase(n), id: n.id })),
                    absenteeismRecords: (absenteeismRes.data || []).map((a: Record<string, unknown>) => ({ ...fromSnakeCase(a), id: a.id })),
                    settings: settingsRes.data ? { ...fromSnakeCase(settingsRes.data), id: settingsRes.data.id } : INITIAL_DATA.settings
                };

                onData(data);
            } catch (error) {
                onError(error as Error);
            }
        };

        loadAll();

        const channels = [
            supabase.channel('teachers_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, loadAll).subscribe(),
            supabase.channel('subjects_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'subjects' }, loadAll).subscribe(),
            supabase.channel('classes_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, loadAll).subscribe(),
            supabase.channel('rooms_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadAll).subscribe(),
            supabase.channel('schedule_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, loadAll).subscribe(),
            supabase.channel('substitutions_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'substitutions' }, loadAll).subscribe(),
            supabase.channel('duty_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'duty' }, loadAll).subscribe(),
            supabase.channel('nutrition_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'nutrition' }, loadAll).subscribe(),
            supabase.channel('absenteeism_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'absenteeism' }, loadAll).subscribe()
        ];

        return () => {
            channels.forEach((ch) => supabase.removeChannel(ch));
        };
    },

    save: async (data: Partial<AppData>, _user?: unknown): Promise<void> => {
        // Save each collection to Supabase
        if (data.teachers) {
            await supabase.from('teachers').upsert(data.teachers.map((t) => toSnakeCase(t as Record<string, unknown>)));
        }
        if (data.subjects) {
            await supabase.from('subjects').upsert(data.subjects.map((s) => toSnakeCase(s as Record<string, unknown>)));
        }
        if (data.classes) {
            await supabase.from('classes').upsert(data.classes.map((c) => toSnakeCase(c as Record<string, unknown>)));
        }
        if (data.rooms) {
            await supabase.from('rooms').upsert(data.rooms.map((r) => toSnakeCase(r as Record<string, unknown>)));
        }
        if (data.schedule1) {
            await supabase.from('schedule_items').upsert(data.schedule1.map((s) => ({ ...toSnakeCase(s as Record<string, unknown>), semester: 1 })));
        }
        if (data.schedule2) {
            await supabase.from('schedule_items').upsert(data.schedule2.map((s) => ({ ...toSnakeCase(s as Record<string, unknown>), semester: 2 })));
        }
        if (data.substitutions) {
            await supabase.from('substitutions').upsert(data.substitutions.map((s) => toSnakeCase(s as Record<string, unknown>)));
        }
        if (data.dutySchedule) {
            await supabase.from('duty').upsert(data.dutySchedule.map((d) => toSnakeCase(d as Record<string, unknown>)));
        }
        if (data.nutritionRecords) {
            await supabase.from('nutrition').upsert(data.nutritionRecords.map((n) => toSnakeCase(n as Record<string, unknown>)));
        }
        if (data.absenteeismRecords) {
            await supabase.from('absenteeism').upsert(data.absenteeismRecords.map((a) => toSnakeCase(a as Record<string, unknown>)));
        }
        if (data.settings) {
            await supabase.from('settings').upsert(toSnakeCase(data.settings as Record<string, unknown>));
        }
    },

    publishPublicData: async (_id: string, _data: AppData): Promise<void> => {
        // TODO: implement public data publishing for Supabase
        logger.warn('publishPublicData not yet implemented for Supabase');
    },

    getPublicData: async (_id: string): Promise<AppData | null> => {
        // TODO: implement public data retrieval for Supabase
        return null;
    },

    deletePublicData: async (_id: string): Promise<void> => {
        // TODO: implement public data deletion for Supabase
    }
};

export const dataService = isSupabase ? supabaseDbService : null;
