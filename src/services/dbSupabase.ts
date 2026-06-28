import { AppData, Teacher, Subject, ClassEntity, Room, ScheduleItem, Substitution, DutyRecord, NutritionRecord, AbsenteeismRecord, Settings, DutyZone, Bell } from '../types';
import { INITIAL_DATA } from '../constants';
import { logger } from '../utils/logger';
import { supabase } from './supabase';
import { isSupabase } from './dbProvider';

const toSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key
            .replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
            .replace(/([a-zA-Z])(\d)$/g, '$1_$2')
            .toLowerCase();
        result[snakeKey] = obj[key];
    }
    return result;
};

const fromSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const camelKey = key
            .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
            .replace(/_(\d)$/g, '$1');
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
                    absenteeismRes,
                    dutyZonesRes,
                    bellScheduleRes
                ] = await Promise.all([
                    supabase.from('teachers').select('*'),
                    supabase.from('subjects').select('*'),
                    supabase.from('classes').select('*'),
                    supabase.from('rooms').select('*'),
                    supabase.from('schedule_items').select('*').eq('semester', 1),
                    supabase.from('schedule_items').select('*').eq('semester', 2),
                    supabase.from('substitutions').select('*'),
                    supabase.from('settings').select('*').maybeSingle(),
                    supabase.from('duty').select('*'),
                    supabase.from('nutrition').select('*'),
                    supabase.from('absenteeism').select('*'),
                    supabase.from('duty_zones').select('*'),
                    supabase.from('bell_schedule').select('*')
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
                if (dutyZonesRes.error) throw dutyZonesRes.error;
                if (bellScheduleRes.error) throw bellScheduleRes.error;

                const data: AppData = {
                    ...INITIAL_DATA,
                    teachers: (teachersRes.data || []).map((t: Record<string, unknown>) => ({ ...fromSnakeCase(t), id: t.id })) as Teacher[],
                    subjects: (subjectsRes.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })) as Subject[],
                    classes: (classesRes.data || []).map((c: Record<string, unknown>) => ({ ...fromSnakeCase(c), id: c.id })) as ClassEntity[],
                    rooms: (roomsRes.data || []).map((r: Record<string, unknown>) => ({ ...fromSnakeCase(r), id: r.id })) as Room[],
                    schedule: (schedule1Res.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })) as ScheduleItem[],
                    schedule2: (schedule2Res.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })) as ScheduleItem[],
                    substitutions: (substitutionsRes.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })) as Substitution[],
                    dutySchedule: (dutyRes.data || []).map((d: Record<string, unknown>) => ({ ...fromSnakeCase(d), id: d.id })) as DutyRecord[],
                    nutritionRecords: (nutritionRes.data || []).map((n: Record<string, unknown>) => ({ ...fromSnakeCase(n), id: n.id })) as NutritionRecord[],
                    absenteeismRecords: (absenteeismRes.data || []).map((a: Record<string, unknown>) => ({ ...fromSnakeCase(a), id: a.id })) as AbsenteeismRecord[],
                    settings: settingsRes.data ? { ...fromSnakeCase(settingsRes.data), id: settingsRes.data.id } as Settings : INITIAL_DATA.settings,
                    dutyZones: (dutyZonesRes.data || []).map((z: Record<string, unknown>) => ({ ...fromSnakeCase(z), id: z.id })) as DutyZone[],
                    bellSchedule: (bellScheduleRes.data || []).map((b: Record<string, unknown>) => ({
                        id: b.id,
                        shift: b.shift,
                        period: b.period,
                        start: b.start_time,
                        end: b.end_time,
                        day: b.day,
                        cancelled: b.cancelled
                    })) as Bell[],
                    privateSettings: settingsRes.data ? {
                        telegramToken: (settingsRes.data as Record<string, unknown>).telegram_token as string,
                        weatherApiKey: (settingsRes.data as Record<string, unknown>).weather_api_key as string
                    } : INITIAL_DATA.privateSettings
                };

                onData(data);
            } catch (error) {
                onError(error as Error);
            }
        };

        // Prevent hanging forever
        const timeoutMs = 15000;
        const timeout = setTimeout(() => {
            logger.error(`Data loading timed out after ${timeoutMs}ms`);
            onError(new Error(`Data loading timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        loadAll().then(() => clearTimeout(timeout)).catch(() => clearTimeout(timeout));

        const channelPrefix = Date.now();
        const channels = [
            supabase.channel(`teachers_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, loadAll).subscribe(),
            supabase.channel(`subjects_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'subjects' }, loadAll).subscribe(),
            supabase.channel(`classes_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, loadAll).subscribe(),
            supabase.channel(`rooms_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadAll).subscribe(),
            supabase.channel(`schedule_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, loadAll).subscribe(),
            supabase.channel(`substitutions_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'substitutions' }, loadAll).subscribe(),
            supabase.channel(`duty_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'duty' }, loadAll).subscribe(),
            supabase.channel(`nutrition_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'nutrition' }, loadAll).subscribe(),
            supabase.channel(`absenteeism_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'absenteeism' }, loadAll).subscribe(),
            supabase.channel(`duty_zones_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'duty_zones' }, loadAll).subscribe(),
            supabase.channel(`bell_schedule_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'bell_schedule' }, loadAll).subscribe()
        ];

        return () => {
            clearTimeout(timeout);
            channels.forEach((ch) => supabase.removeChannel(ch));
        };
    },

    save: async (data: Partial<AppData>, _user?: unknown): Promise<void> => {
        const ORG_ID = 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7';
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        
        // Save each collection to Supabase
        if (data.teachers) {
            await supabase.from('teachers').upsert(data.teachers.map((t) => {
                const obj = toSnakeCase(t as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.subjects) {
            await supabase.from('subjects').upsert(data.subjects.map((s) => {
                const obj = toSnakeCase(s as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.classes) {
            await supabase.from('classes').upsert(data.classes.map((c) => {
                const obj = toSnakeCase(c as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.rooms) {
            await supabase.from('rooms').upsert(data.rooms.map((r) => {
                const obj = toSnakeCase(r as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.schedule) {
            // Delete all existing schedule items for semester 1, then insert fresh
            await supabase.from('schedule_items').delete().eq('semester', 1).eq('organization_id', ORG_ID);
            await supabase.from('schedule_items').insert(data.schedule.map((s) => {
                const obj = toSnakeCase(s as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                obj.semester = 1;
                return obj;
            }));
        }
        if (data.schedule2) {
            // Delete all existing schedule items for semester 2, then insert fresh
            await supabase.from('schedule_items').delete().eq('semester', 2).eq('organization_id', ORG_ID);
            await supabase.from('schedule_items').insert(data.schedule2.map((s) => {
                const obj = toSnakeCase(s as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                obj.semester = 2;
                return obj;
            }));
        }
        if (data.substitutions) {
            await supabase.from('substitutions').upsert(data.substitutions.map((s) => {
                const obj = toSnakeCase(s as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.dutySchedule) {
            await supabase.from('duty').upsert(data.dutySchedule.map((d) => {
                const obj = toSnakeCase(d as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.nutritionRecords) {
            await supabase.from('nutrition').upsert(data.nutritionRecords.map((n) => {
                const obj = toSnakeCase(n as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.absenteeismRecords) {
            await supabase.from('absenteeism').upsert(data.absenteeismRecords.map((a) => {
                const obj = toSnakeCase(a as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.dutyZones) {
            await supabase.from('duty_zones').upsert(data.dutyZones.map((z) => {
                const obj = toSnakeCase(z as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = ORG_ID;
                return obj;
            }));
        }
        if (data.bellSchedule) {
            await supabase.from('bell_schedule').upsert(data.bellSchedule.map((b) => ({
                id: b.id || genId(),
                organization_id: ORG_ID,
                shift: b.shift,
                period: b.period,
                start_time: b.start,
                end_time: b.end,
                day: b.day || 'default',
                cancelled: b.cancelled || false
            })));
        }
        if (data.settings) {
            const settingsToSave = { ...data.settings };
            if (data.privateSettings) {
                settingsToSave.telegramToken = data.privateSettings.telegramToken || settingsToSave.telegramToken;
                settingsToSave.weatherApiKey = data.privateSettings.weatherApiKey || settingsToSave.weatherApiKey;
            }
            const snake = toSnakeCase(settingsToSave as Record<string, unknown>);
            snake.organization_id = ORG_ID;
            // Remove fields that don't exist in DB schema
            delete (snake as Record<string, unknown>).app_announcement;
            await supabase.from('settings').upsert(snake, { onConflict: 'organization_id' });
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
