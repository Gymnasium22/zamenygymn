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
import { supabase } from './supabase';

const ARCHIVE_VERSION = '1.0' as const;

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

const supabaseFetchAll = async <T>(
    table: string,
    columns: string = '*',
    mapper?: (raw: Record<string, unknown>) => T,
    organizationId?: string | null
): Promise<T[]> => {
    let query = supabase.from(table).select(columns);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query;
    if (error) {
        logger.error(`Failed to fetch ${table}:`, error);
        throw new Error(`Не удалось прочитать таблицу ${table}`);
    }
    if (!mapper) return (data || []) as T[];
    return (data || []).map((d) => mapper(d as unknown as Record<string, unknown>));
};

const supabaseDeleteAll = async (table: string, organizationId: string): Promise<void> => {
    const { error } = await supabase.from(table).delete().eq('organization_id', organizationId);
    if (error) {
        logger.error(`Failed to clear ${table}:`, error);
        throw new Error(`Не удалось очистить таблицу ${table}`);
    }
};

export const archiveService = {
    buildArchive: async (
        data: AppData,
        yearLabel: string,
        organizationId?: string | null,
        _academicYearEnd?: number
    ): Promise<AcademicYearArchive> => {
        const [allSubstitutions, allNutrition, allAbsenteeism] = await Promise.all([
            supabaseFetchAll<Substitution>('substitutions', '*', mapSubstitution, organizationId).catch(() => []),
            supabaseFetchAll<NutritionRecord>('nutrition', '*', mapNutritionRecord, organizationId).catch(() => []),
            supabaseFetchAll<AbsenteeismRecord>('absenteeism', '*', mapAbsenteeismRecord, organizationId).catch(
                () => []
            )
        ]);

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
                subjectName: baseItem ? subjectMap.get(baseItem.subjectId) || baseItem.subjectId : '',
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
            settingsSnapshot: {
                calendarEvents: data.settings.calendarEvents,
                sessionTimeoutMinutes: data.settings.sessionTimeoutMinutes,
                substitutionDayComments: data.settings.substitutionDayComments || {}
            },
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

    clearAnnualCollections: async (organizationId?: string | null, academicYearEnd?: number) => {
        const orgId = organizationId || '';
        if (!orgId) throw new Error('organizationId is required to clear annual collections');

        // 1. Delete substitutions first (has FK to schedule_items)
        await supabaseDeleteAll('substitutions', orgId);

        // 2. Schedule: academic_year may be null on older rows — fall back to full org clear
        if (academicYearEnd !== undefined) {
            const { error, count } = await supabase
                .from('schedule_items')
                .delete({ count: 'exact' })
                .eq('organization_id', orgId)
                .eq('academic_year', academicYearEnd);
            if (error) {
                logger.error('Failed to clear schedule_items by year:', error);
                throw new Error('Не удалось очистить расписание');
            }
            if (!count || count === 0) {
                logger.info(`No schedule_items with academic_year=${academicYearEnd}; clearing all for org`);
                await supabaseDeleteAll('schedule_items', orgId);
            }
        } else {
            await supabaseDeleteAll('schedule_items', orgId);
        }

        for (const table of ['duty', 'nutrition', 'absenteeism']) {
            await supabaseDeleteAll(table, orgId);
        }

        await supabase.from('settings').update({ substitution_day_comments: {} }).eq('organization_id', orgId);
    },

    getCounts: async (organizationId?: string | null) => {
        const baseFilters: { column: string; value: unknown }[] = organizationId
            ? [{ column: 'organization_id', value: organizationId }]
            : [];
        const [schedule1, schedule2, substitutions, duty, nutrition, absenteeism] = await Promise.all([
            supabaseCount('schedule_items', [...baseFilters, { column: 'semester', value: 1 }]),
            supabaseCount('schedule_items', [...baseFilters, { column: 'semester', value: 2 }]),
            supabaseCount('substitutions', baseFilters),
            supabaseCount('duty', baseFilters),
            supabaseCount('nutrition', baseFilters),
            supabaseCount('absenteeism', baseFilters)
        ]);
        return {
            schedule1,
            schedule2,
            substitutions,
            dutySchedule: duty,
            nutritionRecords: nutrition,
            absenteeismRecords: absenteeism
        };
    },

    closeAcademicYear: async (
        organizationId: string | null | undefined,
        academicYearEnd: number | undefined,
        data: AppData,
        saveData: (newData: Partial<AppData>, addToHistory?: boolean) => Promise<void>,
        nextYearEnd: number
    ): Promise<void> => {
        if (!organizationId) {
            throw new Error('organizationId is required');
        }

        try {
            await archiveService.clearAnnualCollections(organizationId, academicYearEnd);

            await saveData({
                schedule: [],
                schedule2: [],
                substitutions: [],
                dutySchedule: [],
                nutritionRecords: [],
                absenteeismRecords: [],
                settings: {
                    ...data.settings,
                    substitutionDayComments: {},
                    currentYear: nextYearEnd
                }
            });

            logger.info(`Academic year ${academicYearEnd} successfully closed for org ${organizationId}`);
        } catch (error) {
            logger.error('Failed to close academic year:', error);
            throw error;
        }
    },

    verifyYearClosure: async (
        organizationId: string | null | undefined,
        nextYearEnd: number
    ): Promise<{ success: boolean; errors: string[] }> => {
        if (!organizationId) {
            return {
                success: false,
                errors: ['organizationId is required']
            };
        }

        const errors: string[] = [];

        try {
            const { count: scheduleCount, error: scheduleError } = await supabase
                .from('schedule_items')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organizationId);

            if (scheduleError) {
                errors.push(`Ошибка проверки расписания: ${scheduleError.message}`);
            } else if ((scheduleCount || 0) > 0) {
                errors.push(`В БД остаётся ${scheduleCount} записей расписания`);
            }

            const { count: subCount, error: subError } = await supabase
                .from('substitutions')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organizationId);

            if (subError) {
                errors.push(`Ошибка проверки подстановок: ${subError.message}`);
            } else if ((subCount || 0) > 0) {
                errors.push(`В БД остаётся ${subCount} подстановок`);
            }

            const { data: settings, error: settingsError } = await supabase
                .from('settings')
                .select('current_year')
                .eq('organization_id', organizationId)
                .maybeSingle();

            if (settingsError) {
                errors.push(`Ошибка проверки настроек: ${settingsError.message}`);
            } else if ((settings?.current_year as number) !== nextYearEnd) {
                errors.push(
                    `currentYear не обновлён. Ожидалось: ${nextYearEnd}, получено: ${settings?.current_year}`
                );
            }
        } catch (error) {
            errors.push(`Критическая ошибка при проверке: ${(error as Error).message}`);
        }

        return {
            success: errors.length === 0,
            errors
        };
    }
};
