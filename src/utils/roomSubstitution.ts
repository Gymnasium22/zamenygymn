import { ClassEntity, Room, ScheduleItem, Subject, Substitution, Teacher } from '../types';
import { getRoomConflicts } from './substitutionValidation';

export const isRoomSubstitution = (sub: Substitution): boolean => {
    if (sub.type === 'room') return true;
    if (sub.type === 'teacher' || sub.type === 'cancel' || sub.type === 'merge') return false;
    return Boolean(
        sub.replacementRoomId &&
            sub.replacementTeacherId === sub.originalTeacherId &&
            !sub.isMerger &&
            !sub.replacementClassId
    );
};

export const roomLabel = (rooms: Room[], id?: string | null): string => {
    if (!id) return 'без кабинета';
    return rooms.find((room) => room.id === id)?.name || 'удалён';
};

/** Фактический кабинет урока на дату. Пустая строка — урок без кабинета. undefined — урок снят. */
export const effectiveRoomId = (lesson: ScheduleItem, subs: Substitution[]): string | undefined | null => {
    const rows = subs.filter((sub) => sub.scheduleItemId === lesson.id);
    if (rows.some((sub) => sub.replacementTeacherId === 'cancelled' && !isRoomSubstitution(sub))) return undefined;
    const roomSub = rows.find(isRoomSubstitution);
    if (roomSub) return roomSub.replacementRoomId || null;
    const moved = rows.find((sub) => sub.replacementRoomId && sub.replacementTeacherId !== 'cancelled');
    if (moved?.replacementRoomId) return moved.replacementRoomId;
    return lesson.roomId;
};

export interface RoomOption {
    room: Room;
    busy: boolean;
    conflictText: string;
}

export interface OccupantInfo {
    className: string;
    teacherName: string;
    subjectName: string;
    period: number;
    shift: string;
}

const occupantOf = (
    lessonId: string | undefined,
    schedule: ScheduleItem[],
    classes: ClassEntity[],
    teachers: Teacher[],
    subjects: Subject[],
    fallbackTeacherId?: string,
    fallbackClassId?: string
): OccupantInfo | null => {
    const lesson = schedule.find((item) => item.id === lessonId);
    if (!lesson && !fallbackClassId) return null;
    const classId = fallbackClassId || lesson?.classId;
    const teacherId = fallbackTeacherId || lesson?.teacherId;
    const subjectId = lesson?.subjectId;
    return {
        className: classes.find((item) => item.id === classId)?.name || classId || 'класс удалён',
        teacherName: teachers.find((item) => item.id === teacherId)?.name || (teacherId ? 'учитель удалён' : '—'),
        subjectName: subjects.find((item) => item.id === subjectId)?.name || (subjectId ? 'предмет удалён' : '—'),
        period: lesson?.period || 0,
        shift: lesson?.shift || '—'
    };
};

export const describeRoomConflict = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    lesson: ScheduleItem,
    roomId: string,
    classes: ClassEntity[],
    teachers: Teacher[],
    subjects: Subject[],
    excludeSubstitutionIds: string[] = []
): string | null => {
    const conflicts = getRoomConflicts(
        schedule,
        substitutions,
        date,
        lesson,
        [roomId],
        new Set([lesson.id]),
        new Set(excludeSubstitutionIds)
    );
    const conflict = conflicts[0];
    if (!conflict) return null;
    const who = occupantOf(
        conflict.occupiedByLessonId,
        schedule,
        classes,
        teachers,
        subjects,
        conflict.occupiedByTeacherId,
        conflict.occupiedByClassId
    );
    if (!who) return 'Кабинет занят другим уроком.';
    return `Кабинет занят: ${who.className}, ${who.teacherName}, ${who.subjectName}, ${who.period} урок, ${who.shift}.`;
};

export const listRoomOptions = (
    rooms: Room[],
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    lesson: ScheduleItem,
    classes: ClassEntity[],
    teachers: Teacher[],
    subjects: Subject[],
    excludeSubstitutionIds: string[] = [],
    extraBusyRoomIds: string[] = []
): RoomOption[] => {
    return rooms
        .map((room) => {
            const conflictText =
                describeRoomConflict(
                    schedule,
                    substitutions,
                    date,
                    lesson,
                    room.id,
                    classes,
                    teachers,
                    subjects,
                    excludeSubstitutionIds
                ) || (extraBusyRoomIds.includes(room.id) ? 'Кабинет уже предложен другому уроку в этом подборе.' : '');
            return { room, busy: Boolean(conflictText), conflictText };
        })
        .sort((a, b) => Number(a.busy) - Number(b.busy) || a.room.name.localeCompare(b.room.name, 'ru'));
};

export const suggestFreeRoom = (
    lesson: ScheduleItem,
    classes: ClassEntity[],
    rooms: Room[],
    options: RoomOption[],
    avoidRoomIds: string[] = []
): Room | null => {
    const current = lesson.roomId;
    const cls = classes.find((item) => item.id === lesson.classId);
    const origin = rooms.find((room) => room.id === current);
    const free = options.filter(
        (option) => !option.busy && option.room.id !== current && !avoidRoomIds.includes(option.room.id)
    );
    if (free.length === 0) return null;
    const score = (room: Room) => {
        let value = 0;
        if (origin?.type && room.type === origin.type) value += 4;
        if (origin?.floor != null && room.floor === origin.floor) value += 2;
        if (cls?.studentsCount && room.capacity && room.capacity >= cls.studentsCount) value += 1;
        return value;
    };
    return [...free].sort(
        (a, b) => score(b.room) - score(a.room) || a.room.name.localeCompare(b.room.name, 'ru')
    )[0].room;
};

export interface DayRoomLesson {
    lesson: ScheduleItem;
    cancelled: boolean;
    currentRoomId?: string | null;
}

export const lessonsTouchingRoom = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    dayName: string | null,
    roomId: string
): DayRoomLesson[] => {
    if (!dayName || !roomId) return [];
    return schedule
        .filter((lesson) => lesson.day === dayName)
        .map((lesson) => {
            const rows = substitutions.filter((sub) => sub.date === date && sub.scheduleItemId === lesson.id);
            const cancelled = rows.some((sub) => sub.replacementTeacherId === 'cancelled' && !isRoomSubstitution(sub));
            const currentRoomId = effectiveRoomId(lesson, rows);
            return { lesson, cancelled, currentRoomId };
        })
        .filter((row) => {
            if (row.cancelled) return row.lesson.roomId === roomId;
            return row.currentRoomId === roomId;
        })
        .sort((a, b) => a.lesson.period - b.lesson.period || a.lesson.shift.localeCompare(b.lesson.shift, 'ru'));
};

export const formatRoomArrow = (fromName: string, toName: string): string => `Кабинет ${fromName} → ${toName}`;
