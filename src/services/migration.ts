import { supabase } from './supabase';
import { firestoreDB } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { logger } from '../utils/logger';

/**
 * Миграция данных из Firebase Firestore в Supabase PostgreSQL
 * Запускать один раз при переходе на Supabase
 */
export const migrateDataToSupabase = async (organizationId: string): Promise<void> => {
    if (!firestoreDB) {
        throw new Error('Firebase not initialized');
    }

    logger.info('Starting migration to Supabase...');

    // 1. Teachers
    const teachersSnap = await getDocs(collection(firestoreDB, 'teachers'));
    const teachers = teachersSnap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId }));
    if (teachers.length > 0) {
        const { error } = await supabase.from('teachers').insert(teachers.map(t => ({
            id: t.id,
            organization_id: t.organization_id,
            name: t.name,
            subjects: t.subjects || t.subjectIds || [],
            shift: t.shift || t.shifts?.[0] || null,
            max_periods: t.maxPeriods || 8,
            class_teacher_of: t.classTeacherOf || null,
            unavailable_dates: t.unavailableDates || [],
            absence_reasons: t.absenceReasons || {}
        })));
        if (error) logger.error('Teachers migration error:', error);
        else logger.info(`Migrated ${teachers.length} teachers`);
    }

    // 2. Subjects
    const subjectsSnap = await getDocs(collection(firestoreDB, 'subjects'));
    const subjects = subjectsSnap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId }));
    if (subjects.length > 0) {
        const { error } = await supabase.from('subjects').insert(subjects.map(s => ({
            id: s.id,
            organization_id: s.organization_id,
            name: s.name
        })));
        if (error) logger.error('Subjects migration error:', error);
        else logger.info(`Migrated ${subjects.length} subjects`);
    }

    // 3. Classes
    const classesSnap = await getDocs(collection(firestoreDB, 'classes'));
    const classes = classesSnap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId }));
    if (classes.length > 0) {
        const { error } = await supabase.from('classes').insert(classes.map(c => ({
            id: c.id,
            organization_id: c.organization_id,
            name: c.name,
            shift: c.shift,
            student_count: c.studentCount || c.studentsCount || 0,
            grade: c.grade || null,
            class_teacher_id: c.classTeacherId || null
        })));
        if (error) logger.error('Classes migration error:', error);
        else logger.info(`Migrated ${classes.length} classes`);
    }

    // 4. Rooms
    const roomsSnap = await getDocs(collection(firestoreDB, 'rooms'));
    const rooms = roomsSnap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId }));
    if (rooms.length > 0) {
        const { error } = await supabase.from('rooms').insert(rooms.map(r => ({
            id: r.id,
            organization_id: r.organization_id,
            name: r.name,
            floor: r.floor || null,
            capacity: r.capacity || null
        })));
        if (error) logger.error('Rooms migration error:', error);
        else logger.info(`Migrated ${rooms.length} rooms`);
    }

    // 5. Schedule Items
    const schedule1Snap = await getDocs(collection(firestoreDB, 'schedule_sem1'));
    const schedule1 = schedule1Snap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId, semester: 1 }));
    const schedule2Snap = await getDocs(collection(firestoreDB, 'schedule_sem2'));
    const schedule2 = schedule2Snap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId, semester: 2 }));
    const allSchedule = [...schedule1, ...schedule2];
    if (allSchedule.length > 0) {
        const { error } = await supabase.from('schedule_items').insert(allSchedule.map(s => ({
            id: s.id,
            organization_id: s.organization_id,
            semester: s.semester,
            day: s.day,
            period: s.period,
            shift: s.shift,
            class_id: s.classId || null,
            subject_id: s.subjectId || null,
            teacher_id: s.teacherId || null,
            room_id: s.roomId || null,
            direction: s.direction || null
        })));
        if (error) logger.error('Schedule migration error:', error);
        else logger.info(`Migrated ${allSchedule.length} schedule items`);
    }

    // 6. Substitutions
    const subsSnap = await getDocs(collection(firestoreDB, 'substitutions'));
    const subs = subsSnap.docs.map(d => ({ ...d.data(), id: d.id, organization_id: organizationId }));
    if (subs.length > 0) {
        const { error } = await supabase.from('substitutions').insert(subs.map(s => ({
            id: s.id,
            organization_id: s.organization_id,
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
        })));
        if (error) logger.error('Substitutions migration error:', error);
        else logger.info(`Migrated ${subs.length} substitutions`);
    }

    // 7. Settings
    const settingsSnap = await getDocs(collection(firestoreDB, 'config'));
    const settingsData = settingsSnap.docs[0]?.data();
    if (settingsData) {
        const { error } = await supabase.from('settings').insert({
            organization_id: organizationId,
            school_year: settingsData.schoolYear || null,
            semester_start_1: settingsData.semesterStart1 || null,
            semester_end_1: settingsData.semesterEnd1 || null,
            semester_start_2: settingsData.semesterStart2 || null,
            semester_end_2: settingsData.semesterEnd2 || null,
            shift1_start: settingsData.shift1Start || null,
            shift1_end: settingsData.shift1End || null,
            shift2_start: settingsData.shift2Start || null,
            shift2_end: settingsData.shift2End || null,
            periods: settingsData.periods || 8,
            shift1_periods: settingsData.shift1Periods || 8,
            shift2_periods: settingsData.shift2Periods || 8,
            max_periods: settingsData.maxPeriods || 8
        });
        if (error) logger.error('Settings migration error:', error);
        else logger.info('Migrated settings');
    }

    logger.info('Migration completed!');
};
