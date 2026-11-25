import { ScheduleItem, Substitution, Teacher } from '../types';

export interface ScheduleSlot {
    day: string;
    period: number;
    shift: string;
}

export type SubstitutionConflictType = 'room-busy' | 'target-cancelled' | 'target-missing' | 'target-teacher-absent';

export interface SubstitutionConflict {
    type: SubstitutionConflictType;
    lessonId?: string;
    classId?: string;
    teacherId?: string;
    roomId?: string;
    occupiedByLessonId?: string;
    occupiedByClassId?: string;
    occupiedByTeacherId?: string;
}

interface RoomOccupancy {
    roomId: string;
    lessonId: string;
    classId: string;
    teacherId: string;
}

export const isSameScheduleSlot = (left: ScheduleSlot, right: ScheduleSlot): boolean =>
    left.day === right.day && left.period === right.period && left.shift === right.shift;

const isRealTeacherId = (teacherId: string | undefined): teacherId is string =>
    Boolean(teacherId) && teacherId !== 'cancelled' && teacherId !== 'conducted';

export const isTeacherBusyAtSlot = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    teacherId: string,
    slot: ScheduleSlot
): boolean => {
    if (!isRealTeacherId(teacherId)) return false;

    const hasRegularLesson = schedule.some(
        (lesson) => lesson.teacherId === teacherId && isSameScheduleSlot(lesson, slot)
    );
    if (hasRegularLesson) return true;

    return substitutions.some((sub) => {
        if (sub.date !== date || sub.replacementTeacherId !== teacherId) return false;
        const lesson = schedule.find((item) => item.id === sub.scheduleItemId);
        return Boolean(lesson && isSameScheduleSlot(lesson, slot));
    });
};

/**
 * Возвращает все уроки целевого класса в том же слоте.
 * Если заменяющий занят на подгруппе, в объединение попадает весь класс,
 * а не только та подгруппа, которую ведёт заменяющий.
 */
export const getMergeTargetLessons = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    sourceLesson: ScheduleItem,
    replacementTeacherId: string
): ScheduleItem[] => {
    if (!isRealTeacherId(replacementTeacherId)) return [];

    const targetClassIds = new Set<string>();

    schedule.forEach((lesson) => {
        if (lesson.teacherId === replacementTeacherId && isSameScheduleSlot(lesson, sourceLesson)) {
            targetClassIds.add(lesson.classId);
        }
    });

    if (targetClassIds.size === 0) {
        substitutions.forEach((sub) => {
            if (sub.date !== date || sub.replacementTeacherId !== replacementTeacherId) return;
            const lesson = schedule.find((item) => item.id === sub.scheduleItemId);
            if (lesson && isSameScheduleSlot(lesson, sourceLesson)) {
                targetClassIds.add(lesson.classId);
            }
        });
    }

    if (targetClassIds.size === 0) return [];

    return schedule.filter(
        (lesson) =>
            lesson.id !== sourceLesson.id &&
            targetClassIds.has(lesson.classId) &&
            isSameScheduleSlot(lesson, sourceLesson)
    );
};

/**
 * Проверяет урока, к которым присоединяют класс:
 * урок не отменён, учитель цели не отсутствует.
 * Наличие самого урока проверяет вызывающий код (targetLessons.length).
 */
export const getTargetLessonConflicts = (
    targetLessons: ScheduleItem[],
    date: string,
    substitutions: Substitution[],
    teachers: Teacher[]
): SubstitutionConflict[] => {
    const conflicts: SubstitutionConflict[] = [];
    const seen = new Set<string>();

    targetLessons.forEach((lesson) => {
        const key = `${lesson.classId}:${lesson.id}`;
        if (seen.has(key)) return;
        seen.add(key);

        const isCancelled = substitutions.some(
            (sub) => sub.date === date && sub.scheduleItemId === lesson.id && sub.replacementTeacherId === 'cancelled'
        );
        if (isCancelled) {
            conflicts.push({
                type: 'target-cancelled',
                lessonId: lesson.id,
                classId: lesson.classId
            });
            return;
        }

        const teacher = teachers.find((item) => item.id === lesson.teacherId);
        if (!teacher || !teacher.unavailableDates.includes(date)) return;

        const hasCover = substitutions.some(
            (sub) =>
                sub.date === date &&
                sub.scheduleItemId === lesson.id &&
                isRealTeacherId(sub.replacementTeacherId) &&
                sub.replacementTeacherId !== teacher.id
        );
        const hasConductedLesson = substitutions.some(
            (sub) =>
                sub.date === date &&
                sub.scheduleItemId === lesson.id &&
                sub.originalTeacherId === teacher.id &&
                sub.replacementTeacherId === 'conducted'
        );

        if (!hasCover && !hasConductedLesson) {
            conflicts.push({
                type: 'target-teacher-absent',
                lessonId: lesson.id,
                classId: lesson.classId,
                teacherId: teacher.id
            });
        }
    });

    return conflicts;
};

const collectRoomOccupancies = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    slot: ScheduleSlot,
    excludeLessonIds: Set<string>,
    excludeSubstitutionIds: Set<string>
): RoomOccupancy[] => {
    const occupancies: RoomOccupancy[] = [];

    schedule.forEach((lesson) => {
        if (!isSameScheduleSlot(lesson, slot) || excludeLessonIds.has(lesson.id)) return;

        const rows = substitutions.filter(
            (sub) => sub.date === date && sub.scheduleItemId === lesson.id && !excludeSubstitutionIds.has(sub.id)
        );

        if (rows.length === 0) {
            if (lesson.roomId) {
                occupancies.push({
                    roomId: lesson.roomId,
                    lessonId: lesson.id,
                    classId: lesson.classId,
                    teacherId: lesson.teacherId
                });
            }
            return;
        }

        rows.filter((sub) => sub.replacementTeacherId !== 'cancelled').forEach((sub) => {
            const roomId = sub.replacementRoomId || lesson.roomId;
            if (!roomId) return;
            occupancies.push({
                roomId,
                lessonId: lesson.id,
                classId: sub.replacementClassId || lesson.classId,
                teacherId: isRealTeacherId(sub.replacementTeacherId) ? sub.replacementTeacherId : lesson.teacherId
            });
        });
    });

    return occupancies;
};

/**
 * Проверяет, что кабинеты не заняты другими уроками или заменами в этом слоте.
 * Уроки, которые участвуют в самой операции, передаются в excludeLessonIds.
 */
export const getRoomConflicts = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    slot: ScheduleSlot,
    roomIds: string[],
    excludeLessonIds: Set<string> = new Set<string>(),
    excludeSubstitutionIds: Set<string> = new Set<string>()
): SubstitutionConflict[] => {
    const occupancies = collectRoomOccupancies(
        schedule,
        substitutions,
        date,
        slot,
        excludeLessonIds,
        excludeSubstitutionIds
    );
    const conflicts: SubstitutionConflict[] = [];
    const checkedRooms = new Set<string>();

    roomIds.forEach((roomId) => {
        if (!roomId || checkedRooms.has(roomId)) return;
        checkedRooms.add(roomId);

        const occupied = occupancies.find((item) => item.roomId === roomId);
        if (!occupied) return;

        conflicts.push({
            type: 'room-busy',
            roomId,
            occupiedByLessonId: occupied.lessonId,
            occupiedByClassId: occupied.classId,
            occupiedByTeacherId: occupied.teacherId
        });
    });

    return conflicts;
};
