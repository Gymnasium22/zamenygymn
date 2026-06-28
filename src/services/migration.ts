import { supabase } from './supabase';
import { AppData } from '../types';
import { logger } from '../utils/logger';

/**
 * Миграция данных из текущего состояния приложения в Supabase PostgreSQL
 * Запускать один раз при переходе на Supabase
 */
export const migrateDataToSupabase = async (data: AppData, organizationId: string): Promise<void> => {
    logger.info('Starting migration to Supabase...');

    // 1. Teachers
    if (data.teachers?.length > 0) {
        const { error } = await supabase.from('teachers').insert(
            data.teachers.map(t => ({
                id: t.id,
                organization_id: organizationId,
                name: t.name,
                subjects: t.subjectIds || (t as any).subjects || [],
                shift: (t as any).shift || t.shifts?.[0] || null,
                max_periods: t.maxPeriods || 8,
                class_teacher_of: t.classTeacherOf || null,
                unavailable_dates: t.unavailableDates || [],
                absence_reasons: t.absenceReasons || {}
            }))
        );
        if (error) logger.error('Teachers migration error:', error);
        else logger.info(`Migrated ${data.teachers.length} teachers`);
    }

    // 2. Subjects
    if (data.subjects?.length > 0) {
        const { error } = await supabase.from('subjects').insert(
            data.subjects.map(s => ({
                id: s.id,
                organization_id: organizationId,
                name: s.name
            }))
        );
        if (error) logger.error('Subjects migration error:', error);
        else logger.info(`Migrated ${data.subjects.length} subjects`);
    }

    // 3. Classes
    if (data.classes?.length > 0) {
        const { error } = await supabase.from('classes').insert(
            data.classes.map(c => ({
                id: c.id,
                organization_id: organizationId,
                name: c.name,
                shift: c.shift,
                student_count: (c as any).studentCount || c.studentsCount || 0,
                grade: c.grade || null,
                class_teacher_id: c.classTeacherId || null
            }))
        );
        if (error) logger.error('Classes migration error:', error);
        else logger.info(`Migrated ${data.classes.length} classes`);
    }

    // 4. Rooms
    if (data.rooms?.length > 0) {
        const { error } = await supabase.from('rooms').insert(
            data.rooms.map(r => ({
                id: r.id,
                organization_id: organizationId,
                name: r.name,
                floor: r.floor || null,
                capacity: r.capacity || null
            }))
        );
        if (error) logger.error('Rooms migration error:', error);
        else logger.info(`Migrated ${data.rooms.length} rooms`);
    }

    // 5. Schedule Items
    const allSchedule = [...(data.schedule || []), ...(data.schedule2 || [])];
    if (allSchedule.length > 0) {
        const { error } = await supabase.from('schedule_items').insert(
            allSchedule.map(s => ({
                id: s.id,
                organization_id: organizationId,
                semester: s.semester || 1,
                day: s.day,
                period: s.period,
                shift: s.shift,
                class_id: s.classId || null,
                subject_id: s.subjectId || null,
                teacher_id: s.teacherId || null,
                room_id: s.roomId || null,
                direction: s.direction || null
            }))
        );
        if (error) logger.error('Schedule migration error:', error);
        else logger.info(`Migrated ${allSchedule.length} schedule items`);
    }

    // 6. Substitutions
    if (data.substitutions?.length > 0) {
        const { error } = await supabase.from('substitutions').insert(
            data.substitutions.map(s => ({
                id: s.id,
                organization_id: organizationId,
                date: s.date,
                schedule_item_id: s.scheduleItemId || null,
                original_teacher_id: s.originalTeacherId || null,
                replacement_teacher_id: s.replacementTeacherId || null,
                replacement_room_id: s.replacementRoomId || null,
                replacement_class_id: s.replacementClassId || null,
                replacement_subject_id: s.replacementSubjectId || null,
                is_merger: s.isMerger || false,
                lesson_absence_reason: s.lessonAbsenceReason || null,
                refusals: s.refusals || []
            }))
        );
        if (error) logger.error('Substitutions migration error:', error);
        else logger.info(`Migrated ${data.substitutions.length} substitutions`);
    }

    // 7. Duty
    if (data.dutySchedule?.length > 0) {
        const { error } = await supabase.from('duty').insert(
            data.dutySchedule.map(d => ({
                id: d.id,
                organization_id: organizationId,
                date: d.day,
                teachers: [d.teacherId].filter(Boolean),
                notes: null
            }))
        );
        if (error) logger.error('Duty migration error:', error);
        else logger.info(`Migrated ${data.dutySchedule.length} duty records`);
    }

    // 8. Nutrition
    if (data.nutritionRecords?.length > 0) {
        const { error } = await supabase.from('nutrition').insert(
            data.nutritionRecords.map(n => ({
                id: n.id,
                organization_id: organizationId,
                date: n.date,
                breakfast_count: 0,
                lunch_count: n.totalCount || 0,
                dinner_count: 0
            }))
        );
        if (error) logger.error('Nutrition migration error:', error);
        else logger.info(`Migrated ${data.nutritionRecords.length} nutrition records`);
    }

    // 9. Absenteeism
    if (data.absenteeismRecords?.length > 0) {
        const { error } = await supabase.from('absenteeism').insert(
            data.absenteeismRecords.map(a => ({
                id: a.id,
                organization_id: organizationId,
                date: a.date,
                class_id: a.classId || null,
                present_count: 0,
                absent_count: a.absences?.length || 0
            }))
        );
        if (error) logger.error('Absenteeism migration error:', error);
        else logger.info(`Migrated ${data.absenteeismRecords.length} absenteeism records`);
    }

    // 10. Settings
    if (data.settings) {
        const { error } = await supabase.from('settings').insert({
            organization_id: organizationId,
            school_year: data.settings.schoolYear || null,
            semester_start_1: data.settings.semesterStart1 || null,
            semester_end_1: data.settings.semesterEnd1 || null,
            semester_start_2: data.settings.semesterStart2 || null,
            semester_end_2: data.settings.semesterEnd2 || null,
            shift1_start: data.settings.shift1Start || null,
            shift1_end: data.settings.shift1End || null,
            shift2_start: data.settings.shift2Start || null,
            shift2_end: data.settings.shift2End || null,
            periods: data.settings.periods || 8,
            shift1_periods: data.settings.shift1Periods || 8,
            shift2_periods: data.settings.shift2Periods || 8,
            max_periods: data.settings.maxPeriods || 8
        });
        if (error) logger.error('Settings migration error:', error);
        else logger.info('Migrated settings');
    }

    logger.info('Migration completed!');
};
