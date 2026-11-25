import { describe, expect, it } from 'vitest';
import { ScheduleItem, Substitution } from '../types';
import { effectiveRoomId, isRoomSubstitution, lessonsTouchingRoom, suggestFreeRoom, suggestFreeRooms, listRoomOptions, buildClassQuarantinePlan } from '../utils/roomSubstitution';

const lesson = (patch: Partial<ScheduleItem>): ScheduleItem => ({
    id: 'l1',
    classId: 'c1',
    subjectId: 'math',
    teacherId: 't1',
    roomId: 'r204',
    day: 'Пн',
    period: 3,
    shift: '1 смена',
    ...patch
});

const sub = (patch: Partial<Substitution>): Substitution => ({
    id: 's1',
    date: '2026-11-25',
    scheduleItemId: 'l1',
    originalTeacherId: 't1',
    replacementTeacherId: 't1',
    ...patch
});

describe('room substitution', () => {
    const rooms = [
        { id: 'r204', name: '204', type: 'обычный', floor: 2 },
        { id: 'r210', name: '210', type: 'обычный', floor: 2 },
        { id: 'r101', name: '101', type: 'спорт', floor: 1 }
    ];
    const classes = [{ id: 'c1', name: '9 А', shift: '1 смена', studentsCount: 20 }];

    it('отличает смену кабинета от замены учителя', () => {
        expect(isRoomSubstitution(sub({ type: 'room', replacementRoomId: 'r210' }))).toBe(true);
        expect(isRoomSubstitution(sub({ replacementTeacherId: 't2', replacementRoomId: 'r210' }))).toBe(false);
    });

    it('показывает фактический кабинет и пустой кабинет', () => {
        const item = lesson({});
        expect(effectiveRoomId(item, [sub({ type: 'room', replacementRoomId: 'r210' })])).toBe('r210');
        expect(effectiveRoomId(item, [sub({ type: 'room' })])).toBeNull();
        expect(effectiveRoomId(item, [sub({ type: 'cancel', replacementTeacherId: 'cancelled' })])).toBeUndefined();
    });

    it('не предлагает занятый кабинет и кабинет отменённого урока считает свободным', () => {
        const target = lesson({ id: 'target' });
        const other = lesson({ id: 'other', classId: 'c2', roomId: 'r210' });
        const options = listRoomOptions(rooms, [target, other], [sub({ scheduleItemId: 'other', type: 'cancel', replacementTeacherId: 'cancelled' })], '2026-11-25', target, classes, [], []);
        const free210 = options.find((item) => item.room.id === 'r210');
        expect(free210?.busy).toBe(false);
        const suggested = suggestFreeRoom(target, classes, rooms, options);
        expect(suggested?.id).toBe('r210');
    });

    it('предлагает несколько свободных кабинетов по убыванию скоринга', () => {
        const extendedRooms = [...rooms, { id: 'r205', name: '205', type: 'спорт', floor: 2 }];
        const options = extendedRooms.map((room) => ({ room, busy: false, conflictText: '' }));
        expect(suggestFreeRooms(lesson({}), classes, extendedRooms, options, 3).map((room) => room.id)).toEqual(['r210', 'r205', 'r101']);
    });

    it('ограничивает количество рекомендаций и учитывает исключения', () => {
        const options = rooms.map((room) => ({ room, busy: false, conflictText: '' }));
        expect(suggestFreeRooms(lesson({}), classes, rooms, options, 2, ['r210'])).toEqual([rooms[2]]);
        expect(suggestFreeRooms(lesson({}), classes, rooms, options, 0)).toEqual([]);
    });

    it('на весь день берёт уроки кабинета и пропускает уже перенесённые', () => {
        const a = lesson({ id: 'a', period: 1 });
        const b = lesson({ id: 'b', period: 2, roomId: 'r210' });
        const movedAway = sub({ id: 'm', scheduleItemId: 'a', type: 'room', replacementRoomId: 'r101' });
        const rows = lessonsTouchingRoom([a, b], [movedAway], '2026-11-25', 'Пн', 'r204');
        expect(rows.map((row) => row.lesson.id)).toEqual([]);
        const back = lessonsTouchingRoom([b], [sub({ scheduleItemId: 'b', type: 'room', originalRoomId: 'r210', replacementRoomId: 'r204' })], '2026-11-25', 'Пн', 'r204');
        expect(back.map((row) => row.lesson.id)).toEqual(['b']);
    });
});


describe('карантин класса', () => {
    const qRooms = [
        { id: 'r101', name: '101', type: 'обычный', floor: 1, capacity: 30 },
        { id: 'r205', name: '205', type: 'обычный', floor: 2 },
        { id: 'r301', name: '301', type: 'обычный', floor: 3 }
    ];
    const qClasses = [
        { id: 'c7v', name: '7В', shift: '1 смена', studentsCount: 25 },
        { id: 'c5a', name: '5А', shift: '1 смена', studentsCount: 20 }
    ];
    const qDate = '2026-11-25';

    it('прямой обмен: выезжающий получает кабинет класса в том же слоте', () => {
        const classLesson = lesson({ id: 'cl1', classId: 'c7v', period: 1, roomId: 'r205' });
        const other = lesson({ id: 'ev1', classId: 'c5a', teacherId: 't2', period: 1, roomId: 'r101' });
        const plan = buildClassQuarantinePlan([classLesson, other], [], qDate, 'Пн', 'c7v', 'r101', qRooms, qClasses);
        expect(plan.moves).toEqual([
            { lesson: classLesson, kind: 'class', fromRoomId: 'r205', toRoomId: 'r101' },
            { lesson: other, kind: 'evicted', fromRoomId: 'r101', toRoomId: 'r205' }
        ]);
    });

    it('без урока класса в слоте выезжающий получает свободный в слоте кабинет класса', () => {
        const c1l = lesson({ id: 'cl1', classId: 'c7v', period: 1, roomId: 'r205' });
        const c2l = lesson({ id: 'cl2', classId: 'c7v', period: 2, roomId: 'r301' });
        const evicted = lesson({ id: 'ev1', classId: 'c5a', teacherId: 't2', period: 3, roomId: 'r101' });
        const staying = lesson({ id: 'st1', classId: 'c5a', teacherId: 't3', period: 3, roomId: 'r301' });
        const plan = buildClassQuarantinePlan([c1l, c2l, evicted, staying], [], qDate, 'Пн', 'c7v', 'r101', qRooms, qClasses);
        expect(plan.moves.find((m) => m.kind === 'evicted')?.toRoomId).toBe('r205');
    });

    it('если все кабинеты класса в слоте заняты — строка требует ручного выбора', () => {
        const classLesson = lesson({ id: 'cl1', classId: 'c7v', period: 1, roomId: 'r205' });
        const evicted = lesson({ id: 'ev1', classId: 'c5a', teacherId: 't2', period: 2, roomId: 'r101' });
        const staying = lesson({ id: 'st1', classId: 'c5a', teacherId: 't3', period: 2, roomId: 'r205' });
        const plan = buildClassQuarantinePlan([classLesson, evicted, staying], [], qDate, 'Пн', 'c7v', 'r101', qRooms, qClasses);
        expect(plan.moves.find((m) => m.kind === 'evicted')?.needsManual).toBe(true);
    });

    it('не садит подгруппы в один кабинет и предупреждает', () => {
        const a = lesson({ id: 'cl1', classId: 'c7v', period: 1, roomId: 'r205', subjectId: 'math' });
        const b = lesson({ id: 'cl2', classId: 'c7v', period: 1, roomId: 'r301', subjectId: 'eng' });
        const plan = buildClassQuarantinePlan([a, b], [], qDate, 'Пн', 'c7v', 'r101', qRooms, qClasses);
        expect(plan.moves).toEqual([]);
        expect(plan.warnings.join(' ')).toContain('несколько уроков');
    });

    it('пропускает отменённые уроки класса и кабинета', () => {
        const classLesson = lesson({ id: 'cl1', classId: 'c7v', period: 1, roomId: 'r205' });
        const cancelledClass = lesson({ id: 'cl2', classId: 'c7v', period: 2, roomId: 'r301' });
        const cancelledEvicted = lesson({ id: 'ev1', classId: 'c5a', teacherId: 't2', period: 1, roomId: 'r101' });
        const subs = [
            sub({ id: 's2', scheduleItemId: 'cl2', type: 'cancel', replacementTeacherId: 'cancelled' }),
            sub({ id: 's3', scheduleItemId: 'ev1', type: 'cancel', replacementTeacherId: 'cancelled' })
        ];
        const plan = buildClassQuarantinePlan([classLesson, cancelledClass, cancelledEvicted], subs, qDate, 'Пн', 'c7v', 'r101', qRooms, qClasses);
        expect(plan.moves.map((m) => m.lesson.id)).toEqual(['cl1']);
    });

    it('предупреждает, если кабинет меньше класса', () => {
        const smallTarget = { id: 'r101', name: '101', type: 'обычный', floor: 1, capacity: 10 };
        const classLesson = lesson({ id: 'cl1', classId: 'c7v', period: 1, roomId: 'r205' });
        const plan = buildClassQuarantinePlan([classLesson], [], qDate, 'Пн', 'c7v', 'r101', [smallTarget, ...qRooms.slice(1)], qClasses);
        expect(plan.warnings.join(' ')).toContain('мест');
    });
});
