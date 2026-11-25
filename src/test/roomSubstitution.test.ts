import { describe, expect, it } from 'vitest';
import { ScheduleItem, Substitution } from '../types';
import { effectiveRoomId, isRoomSubstitution, lessonsTouchingRoom, suggestFreeRoom, listRoomOptions } from '../utils/roomSubstitution';

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
