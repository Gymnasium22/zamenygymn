import { AppData, Teacher, Subject, ClassEntity, Room, ScheduleItem, Substitution, DutyRecord, NutritionRecord, AbsenteeismRecord, Settings, DutyZone, Bell } from '../types';
import { INITIAL_DATA } from '../constants';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';
import { supabase } from './supabase';

const toSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const snakeKey = key
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
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


/** Postgres DATE / ISO → YYYY-MM-DD for the app */
const toDateOnly = (value: unknown): string | undefined => {
    if (value == null || value === '') return undefined;
    return String(value).split('T')[0];
};

/** Postgres TIME / "HH:MM:SS" → "HH:MM" for bells UI */
const toTimeHm = (value: unknown): string => {
    if (value == null || value === '') return '';
    const s = String(value);
    return s.length >= 5 ? s.slice(0, 5) : s;
};

/** App date string → DATE column (null if empty) */
const asDateParam = (value: unknown): string | null => {
    const d = toDateOnly(value);
    return d || null;
};

/**
 * PostgREST upsert: explicit null/missing timestamps override DEFAULT now() and fail NOT NULL.
 * Keep a valid created_at when present; always refresh updated_at.
 */
const ensureTimestamps = (obj: Record<string, unknown>): Record<string, unknown> => {
    const now = new Date().toISOString();
    const created = obj.created_at;
    if (typeof created !== 'string' || !String(created).trim()) {
        obj.created_at = now;
    }
    obj.updated_at = now;
    return obj;
};

/** order: 0 is valid — never use `x || null` */
const asOrder = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empty string is not a valid UUID — sending it makes PostgREST reject the whole batch. */
const asUuid = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const s = value.trim();
    return UUID_RE.test(s) ? s : null;
};

const pickColumns = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
        if (obj[key] !== undefined) out[key] = obj[key];
    }
    return out;
};

const TEACHER_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'shifts',
    'max_periods',
    'class_teacher_of',
    'unavailable_dates',
    'absence_reasons',
    'birth_date',
    'telegram_chat_id',
    'order',
    'created_at',
    'updated_at'
];

const sortByOrder = <T extends { order?: number; name?: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => {
        const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' });
    });

// Fetch IDs that already exist in a table (used to validate foreign references at runtime)
const fetchExistingIds = async (tableName: string, ids: string[]): Promise<Set<string>> => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (uniqueIds.length === 0) return new Set();

    const chunkSize = 100;
    const found = new Set<string>();
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        const { data: rows, error } = await supabase.from(tableName).select('id').in('id', chunk);
        if (error) throw error;
        (rows || []).forEach((r: Record<string, unknown>) => found.add(r.id as string));
    }
    return found;
};

export const supabaseDbService = {
    subscribe: (onData: (data: AppData) => void, onError: (error: Error) => void, orgId: string | null) => {
        const loadAll = async () => {
            if (!orgId) {
                onError(new Error('organizationId is required'));
                return;
            }
            try {
                const [
                    teachersRes,
                    teacherSubjectsRes,
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
                    supabase.from('teachers').select('*').eq('organization_id', orgId),
                    supabase.from('teacher_subjects').select('teacher_id, subject_id').eq('organization_id', orgId),
                    supabase.from('subjects').select('*').eq('organization_id', orgId),
                    supabase.from('classes').select('*').eq('organization_id', orgId),
                    supabase.from('rooms').select('*').eq('organization_id', orgId),
                    supabase.from('schedule_items').select('*').eq('semester', 1).eq('organization_id', orgId),
                    supabase.from('schedule_items').select('*').eq('semester', 2).eq('organization_id', orgId),
                    supabase.from('substitutions').select('*').eq('organization_id', orgId),
                    supabase.from('settings').select('*').eq('organization_id', orgId).maybeSingle(),
                    supabase.from('duty').select('*').eq('organization_id', orgId),
                    supabase.from('nutrition').select('*').eq('organization_id', orgId),
                    supabase.from('absenteeism').select('*').eq('organization_id', orgId),
                    supabase.from('duty_zones').select('*').eq('organization_id', orgId),
                    supabase.from('bell_schedule').select('*').eq('organization_id', orgId)
                ]);

                if (teachersRes.error) throw teachersRes.error;
                if (teacherSubjectsRes.error) throw teacherSubjectsRes.error;
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

                const subjectsByTeacher = new Map<string, string[]>();
                for (const link of teacherSubjectsRes.data || []) {
                    const tid = (link as { teacher_id: string }).teacher_id;
                    const sid = (link as { subject_id: string }).subject_id;
                    if (!tid || !sid) continue;
                    const list = subjectsByTeacher.get(tid) || [];
                    list.push(sid);
                    subjectsByTeacher.set(tid, list);
                }

                const data: AppData = {
                    ...INITIAL_DATA,
                    teachers: sortByOrder(
                        (teachersRes.data || []).map((t: Record<string, unknown>) => {
                            const obj = fromSnakeCase(t) as Record<string, unknown>;
                            delete obj.subjectIds;
                            return {
                                ...obj,
                                id: t.id,
                                subjectIds: subjectsByTeacher.get(t.id as string) || [],
                                birthDate: toDateOnly(t.birth_date),
                                order: typeof t.order === 'number' ? t.order : Number(t.order) || 0
                            } as Teacher;
                        })
                    ),
                    subjects: sortByOrder(
                        (subjectsRes.data || []).map((s: Record<string, unknown>) => ({
                            ...fromSnakeCase(s),
                            id: s.id,
                            order: typeof s.order === 'number' ? s.order : Number(s.order) || 0
                        })) as Subject[]
                    ),
                    classes: sortByOrder(
                        (classesRes.data || []).map((c: Record<string, unknown>) => ({
                            ...fromSnakeCase(c),
                            id: c.id,
                            order: typeof c.order === 'number' ? c.order : Number(c.order) || 0
                        })) as ClassEntity[]
                    ),
                    rooms: sortByOrder(
                        (roomsRes.data || []).map((r: Record<string, unknown>) => ({
                            ...fromSnakeCase(r),
                            id: r.id,
                            order: typeof r.order === 'number' ? r.order : Number(r.order) || 0
                        })) as Room[]
                    ),
                    schedule: (schedule1Res.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })) as ScheduleItem[],
                    schedule2: (schedule2Res.data || []).map((s: Record<string, unknown>) => ({ ...fromSnakeCase(s), id: s.id })) as ScheduleItem[],
                    substitutions: (substitutionsRes.data || []).map((s: Record<string, unknown>) => {
                        const obj = fromSnakeCase(s) as Record<string, unknown>;
                        obj.date = toDateOnly(obj.date) || obj.date;
                        return { ...obj, id: s.id } as Substitution;
                    }),
                    dutySchedule: (dutyRes.data || []).map((d: Record<string, unknown>) => ({ ...fromSnakeCase(d), id: d.id })) as DutyRecord[],
                    nutritionRecords: (nutritionRes.data || []).map((n: Record<string, unknown>) => {
                        const obj = fromSnakeCase(n) as Record<string, unknown>;
                        obj.date = toDateOnly(obj.date) || obj.date;
                        return { ...obj, id: n.id } as NutritionRecord;
                    }),
                    absenteeismRecords: (absenteeismRes.data || []).map((a: Record<string, unknown>) => {
                        const obj = fromSnakeCase(a) as Record<string, unknown>;
                        obj.date = toDateOnly(obj.date) || obj.date;
                        return { ...obj, id: a.id } as AbsenteeismRecord;
                    }),
                    settings: settingsRes.data ? { ...fromSnakeCase(settingsRes.data), id: settingsRes.data.id } as Settings : INITIAL_DATA.settings,
                    dutyZones: (dutyZonesRes.data || []).map((z: Record<string, unknown>) => ({ ...fromSnakeCase(z), id: z.id })) as DutyZone[],
                    bellSchedule: (bellScheduleRes.data || []).map((b: Record<string, unknown>) => ({
                        id: b.id,
                        shift: b.shift,
                        period: b.period,
                        start: toTimeHm(b.start_time),
                        end: toTimeHm(b.end_time),
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
            supabase.channel(`settings_changes_${channelPrefix}`).on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, loadAll).subscribe(),
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

    save: async (data: Partial<AppData>, _user?: unknown, organizationId?: string | null): Promise<void> => {
        const orgId = organizationId;
        if (!orgId) {
            logger.error("[dbSupabase] organizationId is required for save");
            throw new Error("organizationId is required");
        }
        const genId = generateId;

        // Helper to sync a table: upsert first, then delete rows missing from the payload.
        // Delete-then-insert used to wipe the table if the following insert/upsert failed
        // (invalid UUID, extra column, FK) — data vanished after refresh.
        const syncTable = async (
            tableName: string,
            items: Array<Record<string, unknown>>,
            mapItem: (item: Record<string, unknown>) => Record<string, unknown> | null,
            options?: { allowEmptyWipe?: boolean }
        ) => {
            if (!items) return;
            const mapped = items.map(mapItem).filter((item): item is Record<string, unknown> => item !== null);

            const { data: existing, error: fetchError } = await supabase
                .from(tableName)
                .select('id')
                .eq('organization_id', orgId);

            if (fetchError) throw fetchError;

            const existingIds = new Set((existing || []).map((r: Record<string, unknown>) => r.id as string));
            const newIds = new Set(mapped.map((item) => item.id as string).filter(Boolean));

            if (mapped.length === 0 && existingIds.size > 0 && !options?.allowEmptyWipe) {
                logger.error(
                    `[dbSupabase] Refusing to wipe ${tableName}: empty payload but ${existingIds.size} rows exist`
                );
                throw new Error(
                    `Пустой список ${tableName} не записан — в базе уже есть данные. Обновите страницу и повторите.`
                );
            }

            if (mapped.length > 0) {
                const { error: upsertError } = await supabase.from(tableName).upsert(mapped);
                if (upsertError) throw upsertError;
            }

            const idsToDelete = Array.from(existingIds).filter((id) => !newIds.has(id));
            const DIRECTORY_TABLES = new Set(['teachers', 'subjects', 'classes', 'rooms']);
            if (DIRECTORY_TABLES.has(tableName) && idsToDelete.length > 0 && !options?.allowEmptyWipe) {
                const looksLikeSeed =
                    mapped.length > 0 &&
                    mapped.every((m) => typeof m.id === 'string' && !UUID_RE.test(String(m.id)));
                const bulkWipe =
                    idsToDelete.length > 2 &&
                    idsToDelete.length > Math.max(2, Math.ceil(existingIds.size * 0.1));
                if (looksLikeSeed || bulkWipe) {
                    logger.error(
                        `[dbSupabase] Refusing bulk delete on ${tableName}: would remove ${idsToDelete.length} of ${existingIds.size} rows (payload ${mapped.length})`
                    );
                    throw new Error(
                        `Сохранение ${tableName} не удалило ${idsToDelete.length} существующих записей — в запросе был неполный список. Обновите страницу, не сохраняйте справочник повторно.`
                    );
                }
            }
            if (idsToDelete.length > 0) {
                const { error: deleteError } = await supabase
                    .from(tableName)
                    .delete()
                    .eq('organization_id', orgId)
                    .in('id', idsToDelete);
                if (deleteError) throw deleteError;
            }
        };

        // 1. Reference tables (must be saved BEFORE schedule_items because of FK constraints)
        // Subjects first so teacher_subjects FK can resolve
        if (data.subjects) {
            await syncTable('subjects', data.subjects as unknown as Record<string, unknown>[], (s) => {
                const obj = toSnakeCase(s);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = orgId;
                const ord = asOrder(obj.order);
                if (ord !== null) obj.order = ord;
                else delete obj.order;
                return ensureTimestamps(obj);
            });
        }

        if (data.teachers) {
            const teachers = data.teachers as Teacher[];
            await syncTable('teachers', teachers as unknown as Record<string, unknown>[], (t) => {
                const obj = toSnakeCase(t);
                if (!obj.id) obj.id = genId();
                const uuid = asUuid(obj.id);
                if (uuid) obj.id = uuid;
                if (!obj.organization_id) obj.organization_id = orgId;
                obj.class_teacher_of = asUuid(obj.class_teacher_of);
                obj.birth_date = asDateParam(obj.birth_date);
                const ord = asOrder(obj.order);
                if (ord !== null) obj.order = ord;
                else delete obj.order;
                if (!Array.isArray(obj.shifts)) obj.shifts = [];
                if (!Array.isArray(obj.unavailable_dates)) obj.unavailable_dates = [];
                if (obj.absence_reasons == null || typeof obj.absence_reasons !== 'object') obj.absence_reasons = {};
                return ensureTimestamps(pickColumns(obj, TEACHER_COLUMNS));
            });

            const links: { teacher_id: string; subject_id: string; organization_id: string }[] = [];
            for (const t of teachers) {
                const tid = asUuid(t.id);
                if (!tid) continue;
                for (const sid of t.subjectIds || []) {
                    const subjectId = asUuid(sid);
                    if (!subjectId) continue;
                    links.push({ teacher_id: tid, subject_id: subjectId, organization_id: orgId });
                }
            }
            if (links.length > 0) {
                const { error: insLinksError } = await supabase.from('teacher_subjects').upsert(links);
                if (insLinksError) throw insLinksError;
            }
            const payloadTeacherIds = new Set(
                teachers.map((t) => asUuid(t.id)).filter((id): id is string => Boolean(id))
            );
            const keepPairs = new Set(links.map((l) => `${l.teacher_id}:${l.subject_id}`));
            const { data: existingLinks, error: fetchLinksError } = await supabase
                .from('teacher_subjects')
                .select('teacher_id, subject_id')
                .eq('organization_id', orgId);
            if (fetchLinksError) throw fetchLinksError;
            const linksByTeacher = new Map<string, number>();
            for (const row of existingLinks || []) {
                const tid = (row as { teacher_id: string }).teacher_id;
                linksByTeacher.set(tid, (linksByTeacher.get(tid) || 0) + 1);
            }
            const stale = (existingLinks || []).filter((row: { teacher_id: string; subject_id: string }) => {
                if (!payloadTeacherIds.has(row.teacher_id)) return false;
                if (keepPairs.has(`${row.teacher_id}:${row.subject_id}`)) return false;
                const incomingForTeacher = links.filter((l) => l.teacher_id === row.teacher_id).length;
                const existingForTeacher = linksByTeacher.get(row.teacher_id) || 0;
                // Empty subjectIds on a teacher who already has links = incomplete client state, not a wipe
                if (incomingForTeacher === 0 && existingForTeacher > 0) return false;
                return true;
            });
            for (const row of stale) {
                const { error: delLinkError } = await supabase
                    .from('teacher_subjects')
                    .delete()
                    .eq('organization_id', orgId)
                    .eq('teacher_id', row.teacher_id)
                    .eq('subject_id', row.subject_id);
                if (delLinkError) throw delLinkError;
            }
        }

        if (data.classes) {
            await syncTable('classes', data.classes as unknown as Record<string, unknown>[], (c) => {
                const obj = toSnakeCase(c);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = orgId;
                delete (obj as Record<string, unknown>).not_in_schedule;
                const ord = asOrder(obj.order);
                if (ord !== null) obj.order = ord;
                else delete obj.order;
                return ensureTimestamps(obj);
            });
        }

        if (data.rooms) {
            await syncTable('rooms', data.rooms as unknown as Record<string, unknown>[], (r) => {
                const obj = toSnakeCase(r);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = orgId;
                const ord = asOrder(obj.order);
                if (ord !== null) obj.order = ord;
                else delete obj.order;
                return ensureTimestamps(obj);
            });
        }

        // 2. Duty zones (must be saved BEFORE duty_schedule because of FK constraints)
        if (data.dutyZones) {
            const mapped = data.dutyZones.map((z) => {
                const obj = toSnakeCase(z as unknown as Record<string, unknown>);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = orgId;
                return ensureTimestamps(obj);
            });
            if (mapped.length > 0) {
                const { error } = await supabase.from('duty_zones').upsert(mapped);
                if (error) throw error;
            }
        }

        // 3. Other tables
        // Academic year for year-scoped tables — take from payload settings OR DB
        // (schedule-only saves do not include settings, so without this we fall back to calendar year)
        let academicYearValue: number | null =
            typeof data.settings?.currentYear === 'number' && data.settings.currentYear > 0
                ? data.settings.currentYear
                : null;
        if (academicYearValue == null) {
            const { data: yearRow } = await supabase
                .from('settings')
                .select('current_year')
                .eq('organization_id', orgId)
                .maybeSingle();
            const y = yearRow?.current_year;
            if (typeof y === 'number' && y > 0) academicYearValue = y;
            else if (typeof y === 'string' && Number(y) > 0) academicYearValue = Number(y);
        }
        const currentYear = academicYearValue ?? new Date().getFullYear();

        if (data.dutySchedule) {
            const zoneIds = new Set((data.dutyZones || []).map((z) => z.id));
            const hasZones = data.dutyZones !== undefined;
            const validDuty = (data.dutySchedule as unknown as Record<string, unknown>[]).filter((d) => {
                const zoneId = (d.zoneId ?? d.zone_id) as string | null;
                if (hasZones && zoneId && !zoneIds.has(zoneId)) {
                    logger.warn(`Skipping duty record ${d.id}: zone_id ${zoneId} not present in import`);
                    return false;
                }
                return true;
            });
            if (validDuty.length > 0) {
                await syncTable('duty', validDuty, (d) => {
                    const obj = toSnakeCase(d);
                    if (!obj.id) obj.id = genId();
                    if (!obj.organization_id) obj.organization_id = orgId;
                    if (!obj.academic_year) obj.academic_year = currentYear;
                    return ensureTimestamps(obj);
                });
            }
        }

        if (data.nutritionRecords) {
            await syncTable('nutrition', data.nutritionRecords as unknown as Record<string, unknown>[], (n) => {
                const obj = toSnakeCase(n);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = orgId;
                if (!obj.academic_year) obj.academic_year = currentYear;
                obj.date = asDateParam(obj.date);
                return ensureTimestamps(obj);
            });
        }

        if (data.absenteeismRecords) {
            await syncTable('absenteeism', data.absenteeismRecords as unknown as Record<string, unknown>[], (a) => {
                const obj = toSnakeCase(a);
                if (!obj.id) obj.id = genId();
                if (!obj.organization_id) obj.organization_id = orgId;
                if (!obj.academic_year) obj.academic_year = currentYear;
                obj.date = asDateParam(obj.date);
                return ensureTimestamps(obj);
            });
        }

        // 4. Schedule items & Substitutions (saved AFTER reference tables to satisfy FK constraints)

        // Reference IDs provided in the current payload (used during full imports)
        const classIds = new Set((data.classes || []).map((c) => c.id).filter(Boolean));
        const subjectIds = new Set((data.subjects || []).map((s) => s.id).filter(Boolean));
        const teacherIds = new Set((data.teachers || []).map((t) => t.id).filter(Boolean));
        const roomIds = new Set((data.rooms || []).map((r) => r.id).filter(Boolean));
        const hasReferenceTables = !!(data.classes || data.subjects || data.teachers || data.rooms);

        const mapScheduleItem = (item: ScheduleItem, semester: number) => {
            // Whitelist only DB columns. Full toSnakeCase also copies createdAt/updatedAt
            // from loaded rows; for NEW lessons those keys are missing, and any null/undefined
            // would be sent as SQL NULL and override DEFAULT now() — leaving timestamps empty.
            const raw = item as ScheduleItem & { createdAt?: string; updatedAt?: string };
            const now = new Date().toISOString();
            const createdAt =
                typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : now;
            return {
                id: asUuid(raw.id) || raw.id || genId(),
                organization_id: asUuid(raw.organizationId) || orgId,
                semester,
                day: raw.day,
                period: raw.period,
                shift: raw.shift,
                class_id: asUuid(raw.classId),
                subject_id: asUuid(raw.subjectId),
                teacher_id: asUuid(raw.teacherId),
                room_id: asUuid(raw.roomId),
                direction: raw.direction || null,
                academic_year: currentYear,
                created_at: createdAt,
                updated_at: now
            };
        };

        const syncScheduleSemester = async (semester: 1 | 2, rows: ScheduleItem[]) => {
            const items = rows.map((s) => mapScheduleItem(s, semester)).filter(filterScheduleItem);
            const { data: existing, error: fetchError } = await supabase
                .from('schedule_items')
                .select('id')
                .eq('organization_id', orgId)
                .eq('semester', semester);
            if (fetchError) throw fetchError;
            const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
            if (items.length > 0) {
                const { error: upsertError } = await supabase.from('schedule_items').upsert(items);
                if (upsertError) throw upsertError;
            }
            const newIds = new Set(items.map((i) => i.id as string));
            const idsToDelete = Array.from(existingIds).filter((id) => !newIds.has(id));
            if (idsToDelete.length > 0) {
                const { error: deleteError } = await supabase
                    .from('schedule_items')
                    .delete()
                    .eq('organization_id', orgId)
                    .eq('semester', semester)
                    .in('id', idsToDelete);
                if (deleteError) throw deleteError;
            }
        };

        // During full imports, skip rows that reference classes/subjects/teachers/rooms
        // which are not present in the imported payload. This prevents FK violations.
        const filterScheduleItem = (obj: Record<string, unknown>) => {
            if (!hasReferenceTables) return true;

            const classId = obj.class_id as string | null;
            const subjectId = obj.subject_id as string | null;
            const teacherId = obj.teacher_id as string | null;
            const roomId = obj.room_id as string | null;

            if (classId && !classIds.has(classId)) {
                logger.warn(`Skipping schedule_item ${obj.id}: class_id ${classId} not present in import`);
                return false;
            }
            if (subjectId && !subjectIds.has(subjectId)) {
                logger.warn(`Skipping schedule_item ${obj.id}: subject_id ${subjectId} not present in import`);
                return false;
            }
            if (teacherId && !teacherIds.has(teacherId)) {
                logger.warn(`Skipping schedule_item ${obj.id}: teacher_id ${teacherId} not present in import`);
                return false;
            }
            if (roomId && !roomIds.has(roomId)) {
                logger.warn(`Skipping schedule_item ${obj.id}: room_id ${roomId} not present in import`);
                return false;
            }
            return true;
        };

        // For substitutions, schedule_item_id must point to an existing schedule item.
        // Build the set from the payload first, then supplement with IDs already in the DB
        // so normal runtime saves do not fail when schedule is not being re-uploaded.
        const scheduleItemIds = new Set<string>([
            ...((data.schedule || []).map((s) => s.id).filter(Boolean) as string[]),
            ...((data.schedule2 || []).map((s) => s.id).filter(Boolean) as string[])
        ]);
        const substitutionScheduleItemIds = (data.substitutions || [])
            .map((s) => s.scheduleItemId)
            .filter(Boolean) as string[];
        const existingScheduleItemIds = await fetchExistingIds('schedule_items', substitutionScheduleItemIds);
        existingScheduleItemIds.forEach((id) => scheduleItemIds.add(id));

        const filterSubstitution = (obj: Record<string, unknown>) => {
            const scheduleItemId = obj.schedule_item_id as string | null;
            if (scheduleItemId && !scheduleItemIds.has(scheduleItemId)) {
                logger.warn(`Skipping substitution ${obj.id}: schedule_item_id ${scheduleItemId} not found`);
                return false;
            }
            return true;
        };

        if (data.substitutions && (data.schedule || data.schedule2)) {
            if (data.schedule) await syncScheduleSemester(1, data.schedule);
            if (data.schedule2) await syncScheduleSemester(2, data.schedule2);

            await syncTable(
                'substitutions',
                data.substitutions as unknown as Record<string, unknown>[],
                (s) => {
                    const obj = toSnakeCase(s);
                    if (!obj.id) obj.id = genId();
                    obj.id = asUuid(obj.id) || genId();
                    if (!obj.organization_id) obj.organization_id = orgId;
                    if (!obj.academic_year) obj.academic_year = currentYear;
                    obj.date = asDateParam(obj.date);
                    return filterSubstitution(obj) ? ensureTimestamps(obj) : null;
                },
                { allowEmptyWipe: true }
            );
        } else {
            if (data.schedule) await syncScheduleSemester(1, data.schedule);
            if (data.schedule2) await syncScheduleSemester(2, data.schedule2);
            if (data.substitutions) {
                await syncTable('substitutions', data.substitutions as unknown as Record<string, unknown>[], (s) => {
                    const obj = toSnakeCase(s);
                    if (!obj.id) obj.id = genId();
                    if (!obj.organization_id) obj.organization_id = orgId;
                    if (!obj.academic_year) obj.academic_year = currentYear;
                    obj.date = asDateParam(obj.date);
                    return filterSubstitution(obj) ? ensureTimestamps(obj) : null;
                });
            }
        }

        // 5. Bell schedule (low priority, wrapped in try/catch because id column is uuid type)
        if (data.bellSchedule) {
            try {
                const mapped = data.bellSchedule.map((b) => {
                    const obj = toSnakeCase(b as unknown as Record<string, unknown>);
                    const rawId = (obj.id as string) || generateId();
                    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId) ? rawId : generateId();
                    return {
                        id: validId,
                        organization_id: orgId,
                        shift: obj.shift,
                        period: obj.period,
                        start_time: toTimeHm(obj.start) || obj.start,
                        end_time: toTimeHm(obj.end) || obj.end,
                        day: obj.day || 'default',
                        cancelled: obj.cancelled || false
                    };
                });
                if (mapped.length > 0) {
                    const { error } = await supabase.from('bell_schedule').upsert(mapped);
                    if (error) throw error;
                }
            } catch (e) {
                logger.warn('bell_schedule save failed, skipping:', e);
            }
        }

        // 6. Settings
        if (data.settings) {
            const settingsToSave = { ...data.settings };
            settingsToSave.periods = settingsToSave.periods ?? 8;
            settingsToSave.shift1Periods = settingsToSave.shift1Periods ?? 8;
            settingsToSave.shift2Periods = settingsToSave.shift2Periods ?? 8;
            settingsToSave.maxPeriods = settingsToSave.maxPeriods ?? 8;

            if (data.privateSettings) {
                settingsToSave.telegramToken = data.privateSettings.telegramToken || settingsToSave.telegramToken;
                settingsToSave.weatherApiKey = data.privateSettings.weatherApiKey || settingsToSave.weatherApiKey;
            }
            const snake = toSnakeCase(settingsToSave as Record<string, unknown>);
            snake.organization_id = orgId;
            delete (snake as Record<string, unknown>).app_announcement;
            delete (snake as Record<string, unknown>).id;
            delete (snake as Record<string, unknown>).created_at;
            delete (snake as Record<string, unknown>).updated_at;

            logger.log('[DB Save] Settings payload keys:', Object.keys(snake));
            logger.log('[DB Save] semester_config:', snake.semester_config);

            const { data: existingSettings } = await supabase.from('settings').select('id').eq('organization_id', orgId).maybeSingle();
            delete (snake as Record<string, unknown>).organization_id;
            if (existingSettings?.id) {
                logger.log('[DB Save] Updating settings for org:', orgId);
                const { error } = await supabase.from('settings').update(snake).eq('organization_id', orgId);
                if (error) {
                    console.error('[DB Save] Settings update error:', error);
                    throw error;
                }
                console.log('[DB Save] Settings updated successfully');
            } else {
                const { error } = await supabase.from('settings').insert({ ...snake, organization_id: orgId });
                if (error) {
                    console.error('[DB Save] Settings insert error:', error);
                    throw error;
                }
                console.log('[DB Save] Settings inserted successfully');
            }
        }

    },

};
