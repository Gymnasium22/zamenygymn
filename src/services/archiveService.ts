import {
    collection,
    doc,
    getDocs,
    writeBatch,
    setDoc
} from 'firebase/firestore';
import {
    AppData,
    AcademicYearArchive,
    ArchivedScheduleItem,
    ArchivedSubstitution,
    ArchivedDutyRecord,
    ArchivedNutritionRecord,
    ArchivedAbsenteeismRecord,
    Substitution,
    NutritionRecord,
    AbsenteeismRecord,
    StudentAbsence
} from '../types';
import { formatDateISO } from '../utils/helpers';
import { logger } from '../utils/logger';
import { dbService } from './db';
import { firestoreDB } from './firebase';
import { isSupabase } from './dbProvider';
import { supabase } from './supabase';

const ARCHIVE_VERSION = '1.0' as const;
const ORG_ID = 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7';

const COLLECTIONS = {
    SCHEDULE_1: 'schedule_sem1',
    SCHEDULE_2: 'schedule_sem2',
    SUBSTITUTIONS: 'substitutions',
    DUTY_SCHEDULE: 'duty_schedule',
    NUTRITION: 'nutrition_records',
    ABSENTEEISM: 'absenteeism_records',
    CONFIG: 'config'
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

const fetchAllDocs = async <T extends { id: string }>(collectionName: string): Promise<T[]> => {
    if (!firestoreDB) return [];
    try {
        const snapshot = await getDocs(collection(firestoreDB, collectionName));
        return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) })) as T[];
    } catch (error) {
        logger.error(`Failed to fetch ${collectionName}:`, error);
        throw new Error(`Не удалось прочитать коллекцию ${collectionName}`);
    }
};

// Supabase helpers
const supabaseCount = async (table: string, filters?: { column: string; value: unknown }[]): Promise<number> => {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    if (filters) {
        filters.forEach((f) => {
            query = query.eq(f.column, f.value);
        });
    }
    const { count, error } = await query;
    if (error) {
        logger.error(`Failed to count ${table}:`, error);
        return 0;
    }
    return count || 0;
};

const mapSubstitution = (raw: Record<string, unknown>): Substitution => ({
    id: raw.id as string,
    date: raw.date as string,
    scheduleItemId: (raw.schedule_item_id as string) || '',
    originalTeacherId: (raw.original_teacher_id as string) || '',
    replacementTeacherId: (raw.replacement_teacher_id as string) || '',
    replacementRoomId: (raw.replacement_room_id as string) || undefined,
    replacementClassId: (raw.replacement_class_id as string) || undefined,
    replacementSubjectId: (raw.replacement_subject_id as string) || undefined,
    isMerger: (raw.is_merger as boolean) || false,
    lessonAbsenceReason: (raw.lesson_absence_reason as string) || undefined,
    refusals: (raw.refusals as string[]) || [],
    comment: (raw.comment as string) || undefined,
    dayComment: (raw.day_comment as string) || undefined,
    isRead: (raw.is_read as boolean) || false,
    organizationId: raw.organization_id as string
});

const mapNutritionRecord = (raw: Record<string, unknown>): NutritionRecord => ({
    id: raw.id as string,
    date: raw.date as string,
    classId: (raw.class_id as string) || '',
    totalCount: (raw.total_count as number) || 0,
    benefitCount: (raw.benefit_count as number) || 0,
    regularCount: (raw.regular_count as number) || 0,
    enteredBy: (raw.entered_by as string) || undefined,
    enteredAt: (raw.entered_at as string) || undefined,
    organizationId: raw.organization_id as string
});

const mapAbsenteeismRecord = (raw: Record<string, unknown>): AbsenteeismRecord => ({
    id: raw.id as string,
    date: raw.date as string,
    classId: (raw.class_id as string) || '',
    absences: (raw.absences as StudentAbsence[]) || [],
    enteredBy: (raw.entered_by as string) || undefined,
    enteredAt: (raw.entered_at as string) || undefined,
    updatedAt: (raw.updated_at as string) || undefined,
    updatedBy: (raw.updated_by as string) || undefined,
    organizationId: raw.organization_id as string
});

const supabaseFetchAll = async <T>(table: string, columns: string = '*', mapper?: (raw: Record<string, unknown>) => T): Promise<T[]> => {
    const { data, error } = await supabase.from(table).select(columns);
    if (error) {
        logger.error(`Failed to fetch ${table}:`, error);
        throw new Error(`Не удалось прочитать таблицу ${table}`);
    }
    if (!mapper) return (data || []) as T[];
    return (data || []).map((d) => mapper(d as any));
};

const supabaseDeleteAll = async (table: string): Promise<void> => {
    const { error } = await supabase.from(table).delete().neq('id', '');
    if (error) {
        logger.error(`Failed to clear ${table}:`, error);
        throw new Error(`Не удалось очистить таблицу ${table}`);
    }
};

export const archiveService = {
    buildArchive: async (data: AppData, yearLabel: string): Promise<AcademicYearArchive> => {
        let allSubstitutions: Substitution[] = [];
        let allNutrition: NutritionRecord[] = [];
        let allAbsenteeism: AbsenteeismRecord[] = [];

        if (isSupabase) {
            [allSubstitutions, allNutrition, allAbsenteeism] = await Promise.all([
                supabaseFetchAll<Substitution>('substitutions', '*', mapSubstitution).catch(() => []),
                supabaseFetchAll<NutritionRecord>('nutrition', '*', mapNutritionRecord).catch(() => []),
                supabaseFetchAll<AbsenteeismRecord>('absenteeism', '*', mapAbsenteeismRecord).catch(() => [])
            ]);
        } else {
            [allSubstitutions, allNutrition, allAbsenteeism] = await Promise.all([
                fetchAllDocs<Substitution>(COLLECTIONS.SUBSTITUTIONS).catch(() => []),
                fetchAllDocs<NutritionRecord>(COLLECTIONS.NUTRITION).catch(() => []),
                fetchAllDocs<AbsenteeismRecord>(COLLECTIONS.ABSENTEEISM).catch(() => [])
            ]);
        }

        const teacherMap = new Map(data.teachers.map((t) => [t.id, t.name]));
        const subjectMap = new Map(data.subjects.map((s) => [s.id, s.name]));
        const classMap = new Map(data.classes.map((c) => [c.id, c.name]));
        const roomMap = new Map(data.rooms.map((r) => [r.id, r.name]));
        const zoneMap = new Map(data.dutyZones.map((z) => [z.id, z.name]));
        const scheduleItemMap = new Map(data.schedule.map((s) => [s.id, s]));
        data.schedule2.forEach((s) => {
            if (!scheduleItemMap.has(s.id)) scheduleItemMap.set(s.id, s);
        });

        const resolveTeacher = (id?: string) => {
            if (!id) return '';
            if (id === 'conducted') return 'Проведён классным руководителем';
            if (id === 'cancelled') return 'Отменён';
            return teacherMap.get(id) || id;
        };

        const schedule1: ArchivedScheduleItem[] = data.schedule.map((item) => ({
            ...item,
            className: classMap.get(item.classId) || item.classId,
            subjectName: subjectMap.get(item.subjectId) || item.subjectId,
            teacherName: teacherMap.get(item.teacherId) || item.teacherId,
            roomName: item.roomId ? roomMap.get(item.roomId) || item.roomId : undefined
        }));

        const schedule2: ArchivedScheduleItem[] = data.schedule2.map((item) => ({
            ...item,
            className: classMap.get(item.classId) || item.classId,
            subjectName: subjectMap.get(item.subjectId) || item.subjectId,
            teacherName: teacherMap.get(item.teacherId) || item.teacherId,
            roomName: item.roomId ? roomMap.get(item.roomId) || item.roomId : undefined
        }));

        const substitutions: ArchivedSubstitution[] = allSubstitutions.map((s) => {
            const baseItem = scheduleItemMap.get(s.scheduleItemId);
            return {
                ...s,
                className: baseItem ? classMap.get(baseItem.classId) || baseItem.classId : '',
                subjectName: baseItem
                    ? subjectMap.get(baseItem.subjectId) || baseItem.subjectId
                    : '',
                originalTeacherName: resolveTeacher(s.originalTeacherId),
                replacementTeacherName: resolveTeacher(s.replacementTeacherId),
                roomName: baseItem?.roomId ? roomMap.get(baseItem.roomId) || baseItem.roomId : undefined,
                replacementRoomName: s.replacementRoomId
                    ? roomMap.get(s.replacementRoomId) || s.replacementRoomId
                    : undefined
            };
        });

        const dutySchedule: ArchivedDutyRecord[] = data.dutySchedule.map((r) => ({
            ...r,
            teacherName: teacherMap.get(r.teacherId) || r.teacherId,
            zoneName: zoneMap.get(r.zoneId) || r.zoneId
        }));

        const nutritionRecords: ArchivedNutritionRecord[] = allNutrition.map((r) => ({
            ...r,
            className: classMap.get(r.classId) || r.classId
        }));

        const absenteeismRecords: ArchivedAbsenteeismRecord[] = allAbsenteeism.map((r) => ({
            ...r,
            className: classMap.get(r.classId) || r.classId
        }));

        const archive: AcademicYearArchive = {
            version: ARCHIVE_VERSION,
            archivedAt: new Date().toISOString(),
            yearLabel,
            staticSnapshot: {
                teachers: data.teachers.map((t) => ({ id: t.id, name: t.name })),
                subjects: data.subjects.map((s) => ({ id: s.id, name: s.name })),
                classes: data.classes.map((c) => ({ id: c.id, name: c.name, shift: c.shift })),
                rooms: data.rooms.map((r) => ({ id: r.id, name: r.name })),
                dutyZones: data.dutyZones.map((z) => ({ id: z.id, name: z.name, floor: z.floor }))
            },
            schedule1,
            schedule2,
            substitutions,
            dutySchedule,
            nutritionRecords,
            absenteeismRecords,
            substitutionDayComments: data.settings.substitutionDayComments || {}
        };

        return archive;
    },

    downloadArchive: (archive: AcademicYearArchive) => {
        const safeLabel = archive.yearLabel.replace(/[^a-zA-Z0-9\-_]/g, '_');
        const date = formatDateISO(new Date(archive.archivedAt));
        const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `archive_${safeLabel}_${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    clearAnnualCollections: async () => {
        if (isSupabase) {
            // Delete in order to respect FK constraints: substitutions → schedule_items
            const tablesToClear = [
                'substitutions',
                'schedule_items',
                'duty',
                'nutrition',
                'absenteeism'
            ];
            for (const table of tablesToClear) {
                await supabaseDeleteAll(table);
            }
            // Clear substitution day comments in settings
            await supabase.from('settings').update({ substitution_day_comments: {} }).eq('organization_id', ORG_ID);
            dbService.clearCache();
        } else {
            if (!firestoreDB) throw new Error('База данных не инициализирована');

            const collectionsToClear = [
                COLLECTIONS.SCHEDULE_1,
                COLLECTIONS.SCHEDULE_2,
                COLLECTIONS.SUBSTITUTIONS,
                COLLECTIONS.DUTY_SCHEDULE,
                COLLECTIONS.NUTRITION,
                COLLECTIONS.ABSENTEEISM
            ];

            for (const collectionName of collectionsToClear) {
                const snapshot = await getDocs(collection(firestoreDB, collectionName));
                const chunks = chunkArray(snapshot.docs, 500);
                for (const chunk of chunks) {
                    const batch = writeBatch(firestoreDB);
                    chunk.forEach((d) => batch.delete(d.ref));
                    await batch.commit();
                }
            }

            await setDoc(
                doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'),
                { substitutionDayComments: {} },
                { merge: true }
            );

            dbService.clearCache();
        }
    },

    getCounts: async () => {
        if (isSupabase) {
            const [schedule1, schedule2, substitutions, duty, nutrition, absenteeism] = await Promise.all([
                supabaseCount('schedule_items', [{ column: 'semester', value: 1 }]),
                supabaseCount('schedule_items', [{ column: 'semester', value: 2 }]),
                supabaseCount('substitutions'),
                supabaseCount('duty'),
                supabaseCount('nutrition'),
                supabaseCount('absenteeism')
            ]);
            return {
                schedule1,
                schedule2,
                substitutions,
                dutySchedule: duty,
                nutritionRecords: nutrition,
                absenteeismRecords: absenteeism
            };
        }

        if (!firestoreDB) {
            return {
                schedule1: 0,
                schedule2: 0,
                substitutions: 0,
                dutySchedule: 0,
                nutritionRecords: 0,
                absenteeismRecords: 0
            };
        }
        const [s1, s2, subs, duty, nutrition, absenteeism] = await Promise.all([
            getDocs(collection(firestoreDB, COLLECTIONS.SCHEDULE_1)),
            getDocs(collection(firestoreDB, COLLECTIONS.SCHEDULE_2)),
            getDocs(collection(firestoreDB, COLLECTIONS.SUBSTITUTIONS)),
            getDocs(collection(firestoreDB, COLLECTIONS.DUTY_SCHEDULE)),
            getDocs(collection(firestoreDB, COLLECTIONS.NUTRITION)),
            getDocs(collection(firestoreDB, COLLECTIONS.ABSENTEEISM))
        ]);
        return {
            schedule1: s1.size,
            schedule2: s2.size,
            substitutions: subs.size,
            dutySchedule: duty.size,
            nutritionRecords: nutrition.size,
            absenteeismRecords: absenteeism.size
        };
    }
};
