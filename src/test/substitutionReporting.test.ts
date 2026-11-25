import { describe, expect, it } from 'vitest';
import { ClassEntity, Subject, Substitution, Teacher } from '../types';
import {
    countUniqueSubstitutionLessons,
    filterSubstitutionsByMonth,
    formatReplacementStatuses
} from '../utils/substitutionReporting';

const sub = (overrides: Partial<Substitution>): Substitution => ({
    id: 'sub-1',
    date: '2026-09-10',
    scheduleItemId: 'lesson-1',
    originalTeacherId: 'original',
    replacementTeacherId: 'replacement',
    ...overrides
});

describe('countUniqueSubstitutionLessons', () => {
    it('считает строки подгрупп одного урока один раз', () => {
        const substitutions = [
            sub({ id: 'a' }),
            sub({ id: 'b' }),
            sub({ id: 'c', scheduleItemId: 'lesson-2' }),
            sub({ id: 'd', date: '2026-09-11' })
        ];
        expect(countUniqueSubstitutionLessons(substitutions, () => true)).toBe(3);
    });

    it('применяет фильтр до подсчёта уникальных уроков', () => {
        const substitutions = [
            sub({ id: 'a' }),
            sub({ id: 'b', replacementTeacherId: 'cancelled' })
        ];
        expect(
            countUniqueSubstitutionLessons(substitutions, (item) => item.replacementTeacherId === 'cancelled')
        ).toBe(1);
    });
});

describe('filterSubstitutionsByMonth', () => {
    it('не переносит невалидную дату в текущий месяц', () => {
        const substitutions = [sub({ id: 'valid' }), sub({ id: 'invalid', date: 'invalid' })];
        expect(filterSubstitutionsByMonth(substitutions, new Date(2026, 8, 1)).map((item) => item.id)).toEqual([
            'valid'
        ]);
        expect(filterSubstitutionsByMonth(substitutions, new Date())).toHaveLength(0);
    });
});

describe('formatReplacementStatuses', () => {
    const teachers = [
        { id: 'replacement', name: 'Иванова' },
        { id: 'replacement-2', name: 'Петрова' }
    ] as Teacher[];
    const classes = [{ id: 'class-2', name: '7Б' }] as ClassEntity[];
    const subjects = [{ id: 'subject-2', name: 'Математика' }] as Subject[];

    it('показывает разные статусы подгрупп одного урока', () => {
        const result = formatReplacementStatuses(
            [sub({ id: 'a', replacementTeacherId: 'cancelled' }), sub({ id: 'b' })],
            teachers,
            classes,
            subjects
        );
        expect(result).toBe('Урок снят; Иванова');
    });

    it('не дублирует одинаковые статусы подгрупп', () => {
        const result = formatReplacementStatuses([sub({ id: 'a' }), sub({ id: 'b' })], teachers, classes, subjects);
        expect(result).toBe('Иванова');
    });

    it('сохраняет пояснения объединения и обмена для каждого статуса', () => {
        const result = formatReplacementStatuses(
            [
                sub({ id: 'a', isMerger: true, replacementClassId: 'class-2' }),
                sub({
                    id: 'b',
                    replacementTeacherId: 'replacement-2',
                    replacementClassId: 'class-2',
                    replacementSubjectId: 'subject-2'
                })
            ],
            teachers,
            classes,
            subjects
        );
        expect(result).toBe('Иванова (Объединение с 7Б); Петрова (Урок 7Б Математика)');
    });
});
