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

const rankFreeRooms = (
    lesson: ScheduleItem,
    classes: ClassEntity[],
    rooms: Room[],
    options: RoomOption[],
    avoidRoomIds: string[]
): Room[] => {
    const current = lesson.roomId;
    const cls = classes.find((item) => item.id === lesson.classId);
    const origin = rooms.find((room) => room.id === current);
    const free = options.filter(
        (option) => !option.busy && option.room.id !== current && !avoidRoomIds.includes(option.room.id)
    );
    const score = (room: Room) => {
        let value = 0;
        if (origin?.type && room.type === origin.type) value += 4;
        if (origin?.floor != null && room.floor === origin.floor) value += 2;
        if (cls?.studentsCount && room.capacity && room.capacity >= cls.studentsCount) value += 1;
        return value;
    };
    return [...free]
        .sort((a, b) => score(b.room) - score(a.room) || a.room.name.localeCompare(b.room.name, 'ru'))
        .map((option) => option.room);
};

export const suggestFreeRooms = (
    lesson: ScheduleItem,
    classes: ClassEntity[],
    rooms: Room[],
    options: RoomOption[],
    count: number,
    avoidRoomIds: string[] = []
): Room[] => rankFreeRooms(lesson, classes, rooms, options, avoidRoomIds).slice(0, Math.max(0, count));

export const suggestFreeRoom = (
    lesson: ScheduleItem,
    classes: ClassEntity[],
    rooms: Room[],
    options: RoomOption[],
    avoidRoomIds: string[] = []
): Room | null => suggestFreeRooms(lesson, classes, rooms, options, 1, avoidRoomIds)[0] || null;

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

export interface QuarantineMove {
    lesson: ScheduleItem;
    kind: 'class' | 'evicted';
    /** Фактический кабинет до переселения (с учётом уже существующих смен). */
    fromRoomId: string | null;
    /** Пусто, когда ни один кабинет класса не свободен в слоте — выбор вручную. */
    toRoomId?: string;
    needsManual?: boolean;
}

export interface QuarantinePlan {
    moves: QuarantineMove[];
    warnings: string[];
}

/**
 * Карантин класса: весь класс на день переезжает в один кабинет,
 * а чужие уроки из этого кабинета — в кабинеты, которые класс освобождает.
 * Прямой обмен в том же слоте в приоритете; иначе — свободный в слоте кабинет класса.
 */
export const buildClassQuarantinePlan = (
    schedule: ScheduleItem[],
    substitutions: Substitution[],
    date: string,
    dayName: string | null,
    classId: string,
    targetRoomId: string,
    rooms: Room[],
    classes: ClassEntity[]
): QuarantinePlan => {
    const warnings: string[] = [];
    if (!dayName || !classId || !targetRoomId) return { moves: [], warnings };

    const daySubs = substitutions.filter((s) => s.date === date);
    const dayLessons = schedule.filter((l) => l.day === dayName);
    // undefined = урок снят, его не переселяем.
    const currentRoom = new Map<string, string | null | undefined>();
    dayLessons.forEach((lesson) => {
        currentRoom.set(lesson.id, effectiveRoomId(lesson, daySubs.filter((s) => s.scheduleItemId === lesson.id)));
    });
    const active = dayLessons.filter((l) => currentRoom.get(l.id) !== undefined);
    const roomOf = (l: ScheduleItem): string | null => (currentRoom.get(l.id) as string | null) || null;
    const slotKey = (l: ScheduleItem) => `${l.shift}_${l.period}`;

    const classLessons = active.filter((l) => l.classId === classId);
    const slotCounts = new Map<string, number>();
    classLessons.forEach((l) => slotCounts.set(slotKey(l), (slotCounts.get(slotKey(l)) || 0) + 1));
    const classMoving = classLessons.filter((l) => {
        if (slotCounts.get(slotKey(l))! > 1) {
            warnings.push(`${l.period} урок (${l.shift}): у класса несколько уроков в одном слоте — перенесите их вручную.`);
            return false;
        }
        return roomOf(l) !== targetRoomId;
    });
    const evicted = active.filter((l) => l.classId !== classId && roomOf(l) === targetRoomId);

    const target = rooms.find((r) => r.id === targetRoomId);
    const cls = classes.find((c) => c.id === classId);
    if (cls?.studentsCount && target?.capacity && target.capacity < cls.studentsCount) {
        warnings.push(`В кабинете ${target.name} ${target.capacity} мест, а в классе ${cls.studentsCount} учеников.`);
    }

    // Занятость по слотам после переселений: сначала те, кто остаётся на месте.
    const movingIds = new Set([...classMoving, ...evicted].map((l) => l.id));
    const occupied = new Map<string, Set<string>>();
    const occupy = (key: string, roomId: string | null | undefined) => {
        if (!roomId) return;
        const set = occupied.get(key) || new Set<string>();
        set.add(roomId);
        occupied.set(key, set);
    };
    active.filter((l) => !movingIds.has(l.id)).forEach((l) => occupy(slotKey(l), roomOf(l)));

    const moves: QuarantineMove[] = [];
    classMoving.forEach((l) => {
        moves.push({ lesson: l, kind: 'class', fromRoomId: roomOf(l), toRoomId: targetRoomId });
        occupy(slotKey(l), targetRoomId);
    });

    const classOriginalRooms = classMoving
        .map((l) => roomOf(l))
        .filter((id): id is string => Boolean(id))
        .filter((id, idx, arr) => arr.indexOf(id) === idx);
    // Лучшие по типу/этажу относительно карантинного кабинета — для непрямых ходов.
    const score = (id: string) => {
        const room = rooms.find((r) => r.id === id);
        let value = 0;
        if (target?.type && room?.type === target.type) value += 4;
        if (target?.floor != null && room?.floor === target.floor) value += 2;
        return value;
    };
    const roomName = (id: string) => rooms.find((r) => r.id === id)?.name || id;

    evicted.forEach((l) => {
        const key = slotKey(l);
        // Прямой обмен: кабинеты, которые класс освободил именно в этом слоте.
        const freedHere = classMoving
            .filter((c) => slotKey(c) === key)
            .map((c) => roomOf(c))
            .filter((id): id is string => Boolean(id));
        const rest = classOriginalRooms
            .filter((id) => !freedHere.includes(id))
            .sort((a, b) => score(b) - score(a) || roomName(a).localeCompare(roomName(b), 'ru'));
        const chosen = [...freedHere, ...rest].find((id) => !occupied.get(key)?.has(id));
        if (chosen) {
            moves.push({ lesson: l, kind: 'evicted', fromRoomId: targetRoomId, toRoomId: chosen });
            occupy(key, chosen);
        } else {
            moves.push({ lesson: l, kind: 'evicted', fromRoomId: targetRoomId, needsManual: true });
        }
    });

    moves.sort(
        (a, b) =>
            a.lesson.period - b.lesson.period ||
            a.lesson.shift.localeCompare(b.lesson.shift, 'ru') ||
            (a.kind === b.kind ? 0 : a.kind === 'class' ? -1 : 1)
    );
    return { moves, warnings };
};
