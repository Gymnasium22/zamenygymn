import { describe, expect, it } from 'vitest';
import { ScheduleItem, Substitution, Teacher } from '../types';
import {
    getMergeTargetLessons,
    getRoomConflicts,
    getTargetLessonConflicts,
    isTeacherBusyAtSlot
} from '../utils/substitutionValidation';

const date = '2026-03-10';

const lesson = (
    overrides: Partial<ScheduleItem> & Pick<ScheduleItem, 'id' | 'classId' | 'teacherId'>
): ScheduleItem => ({
    subjectId: 'subject',
    day: 'Пн',
    period: 3,
    shift: '1 смена',
    ...overrides
});

const sub = (overrides: Partial<Substitution> & Pick<Substitution, 'id' | 'scheduleItemId'>): Substitution => ({
    date,
    originalTeacherId: 'original',
    replacementTeacherId: 'replacement',
    ...overrides
});

const teacher = (id: string, overrides: Partial<Teacher> = {}): Teacher => ({
    id,
    name: id,
    subjectIds: [],
    unavailableDates: [],
    shifts: ['1 смена'],
    ...overrides
});

describe('getRoomConflicts', () => {
    it('предупреждает, если кабинет занят обычным уроком', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent', roomId: '101' });
        const other = lesson({ id: 'other', classId: '6B', teacherId: 'teacher-b', roomId: '204' });

        const conflicts = getRoomConflicts([source, other], [], date, source, ['204'], new Set([source.id]));

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
            type: 'room-busy',
            roomId: '204',
            occupiedByLessonId: 'other',
            occupiedByClassId: '6B'
        });
    });

    it('не считает целевой урок занявшим собственный кабинет при объединении', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent', roomId: '101' });
        const target = lesson({ id: 'target', classId: '6B', teacherId: 'teacher-b', roomId: '204' });

        const conflicts = getRoomConflicts(
            [source, target],
            [],
            date,
            source,
            ['204'],
            new Set([source.id, target.id])
        );

        expect(conflicts).toHaveLength(0);
    });

    it('учитывает кабинет, изменённый существующей заменой', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent', roomId: '101' });
        const other = lesson({ id: 'other', classId: '6B', teacherId: 'teacher-b', roomId: '204' });

        const conflicts = getRoomConflicts(
            [source, other],
            [sub({ id: 's1', scheduleItemId: 'other', replacementTeacherId: 'teacher-c', replacementRoomId: '305' })],
            date,
            source,
            ['204'],
            new Set([source.id])
        );

        expect(conflicts).toHaveLength(0);
    });

    it('считает кабинет занятым заменой, перенесённой в этот кабинет', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent', roomId: '101' });
        const other = lesson({ id: 'other', classId: '6B', teacherId: 'teacher-b', roomId: '204' });

        const conflicts = getRoomConflicts(
            [source, other],
            [sub({ id: 's1', scheduleItemId: 'other', replacementTeacherId: 'teacher-c', replacementRoomId: '305' })],
            date,
            source,
            ['305'],
            new Set([source.id])
        );

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({ type: 'room-busy', roomId: '305' });
    });

    it('не считает отменённый урок занявшим кабинет', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent', roomId: '101' });
        const other = lesson({ id: 'other', classId: '6B', teacherId: 'teacher-b', roomId: '204' });

        const conflicts = getRoomConflicts(
            [source, other],
            [sub({ id: 's1', scheduleItemId: 'other', replacementTeacherId: 'cancelled' })],
            date,
            source,
            ['204'],
            new Set([source.id])
        );

        expect(conflicts).toHaveLength(0);
    });
});

describe('getTargetLessonConflicts', () => {
    it('предупреждает об отменённом уроке целевого класса', () => {
        const target = lesson({ id: 'target', classId: '6B', teacherId: 'teacher-b' });

        const conflicts = getTargetLessonConflicts(
            [target],
            date,
            [sub({ id: 'cancel', scheduleItemId: 'target', replacementTeacherId: 'cancelled' })],
            [teacher('teacher-b')]
        );

        expect(conflicts).toEqual([{ type: 'target-cancelled', lessonId: 'target', classId: '6B' }]);
    });

    it('предупреждает, если учитель целевого класса отсутствует', () => {
        const target = lesson({ id: 'target', classId: '6B', teacherId: 'teacher-b' });

        const conflicts = getTargetLessonConflicts(
            [target],
            date,
            [],
            [teacher('teacher-b', { unavailableDates: [date] })]
        );

        expect(conflicts).toEqual([
            {
                type: 'target-teacher-absent',
                lessonId: 'target',
                classId: '6B',
                teacherId: 'teacher-b'
            }
        ]);
    });

    it('предупреждает, если заменяющий в целевой строке — сам отсутствующий учитель', () => {
        const target = lesson({ id: 'target', classId: '6B', teacherId: 'teacher-b' });

        const conflicts = getTargetLessonConflicts(
            [target],
            date,
            [sub({ id: 'room-only', scheduleItemId: 'target', replacementTeacherId: 'teacher-b' })],
            [teacher('teacher-b', { unavailableDates: [date] })]
        );

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({ type: 'target-teacher-absent' });
    });

    it('учитывает отметку «урок проведён» только для этого урока', () => {
        const target = lesson({ id: 'target', classId: '6B', teacherId: 'teacher-b' });
        const other = lesson({ id: 'other', classId: '7A', teacherId: 'teacher-b' });

        const conflicts = getTargetLessonConflicts(
            [target, other],
            date,
            [
                sub({
                    id: 'done',
                    scheduleItemId: 'target',
                    originalTeacherId: 'teacher-b',
                    replacementTeacherId: 'conducted'
                })
            ],
            [teacher('teacher-b', { unavailableDates: [date] })]
        );

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({ type: 'target-teacher-absent', lessonId: 'other' });
    });

    it('не предупреждает об отсутствии, если класс уже заменён', () => {
        const target = lesson({ id: 'target', classId: '6B', teacherId: 'teacher-b' });

        const conflicts = getTargetLessonConflicts(
            [target],
            date,
            [sub({ id: 'cover', scheduleItemId: 'target', replacementTeacherId: 'teacher-c' })],
            [teacher('teacher-b', { unavailableDates: [date] })]
        );

        expect(conflicts).toHaveLength(0);
    });
});

describe('getMergeTargetLessons', () => {
    it('возвращает все уроки целевого класса, включая подгруппы', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent' });
        const targetFirst = lesson({ id: 'target-1', classId: '6B', teacherId: 'teacher-b' });
        const targetSecond = lesson({ id: 'target-2', classId: '6B', teacherId: 'teacher-c' });

        const targets = getMergeTargetLessons([source, targetFirst, targetSecond], [], date, source, 'teacher-b');

        expect(targets.map((item) => item.id)).toEqual(['target-1', 'target-2']);
    });

    it('возвращает уроки другой подгруппы того же класса', () => {
        const source = lesson({ id: 'source', classId: '6B', teacherId: 'absent' });
        const otherSubgroup = lesson({ id: 'target-2', classId: '6B', teacherId: 'teacher-b' });

        const targets = getMergeTargetLessons([source, otherSubgroup], [], date, source, 'teacher-b');

        expect(targets.map((item) => item.id)).toEqual(['target-2']);
    });

    it('возвращает пустой список, если у заменяющего нет урока в это время', () => {
        const source = lesson({ id: 'source', classId: '5A', teacherId: 'absent' });
        const targets = getMergeTargetLessons([source], [], date, source, 'teacher-b');
        expect(targets).toHaveLength(0);
    });
});

describe('isTeacherBusyAtSlot', () => {
    it('считает занятость по замене на другом уроке', () => {
        const other = lesson({ id: 'other', classId: '6B', teacherId: 'teacher-b' });
        const busy = isTeacherBusyAtSlot(
            [other],
            [sub({ id: 's1', scheduleItemId: 'other', replacementTeacherId: 'teacher-b' })],
            date,
            'teacher-b',
            other
        );

        expect(busy).toBe(true);
    });
});
