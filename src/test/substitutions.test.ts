import { describe, it, expect } from 'vitest';
import { dedupeSubstitutions, substitutionKey } from '../services/dbSupabase';

describe('substitutionKey', () => {
    it('различает строки замен разных учителей на одном уроке (объединение с подгруппами)', () => {
        const base = { date: '2026-03-10', schedule_item_id: 'lesson-1' };
        const a = substitutionKey({ ...base, replacement_teacher_id: 'teacher-A' });
        const b = substitutionKey({ ...base, replacement_teacher_id: 'teacher-B' });
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(a).not.toBe(b);
    });

    it('различает уроки и даты', () => {
        expect(substitutionKey({ date: '2026-03-10', schedule_item_id: 'l1', replacement_teacher_id: 't' })).not.toBe(
            substitutionKey({ date: '2026-03-11', schedule_item_id: 'l1', replacement_teacher_id: 't' })
        );
        expect(substitutionKey({ date: '2026-03-10', schedule_item_id: 'l1', replacement_teacher_id: 't' })).not.toBe(
            substitutionKey({ date: '2026-03-10', schedule_item_id: 'l2', replacement_teacher_id: 't' })
        );
    });

    it('возвращает null без привязки к уроку', () => {
        expect(substitutionKey({ date: '2026-03-10', schedule_item_id: null })).toBeNull();
    });
});

describe('dedupeSubstitutions', () => {
    it('сохраняет обе строки объединения с классом на подгруппах', () => {
        const rows = [
            {
                id: 's1',
                date: '2026-03-10',
                schedule_item_id: 'lesson-1',
                replacement_teacher_id: 'teacher-A',
                updated_at: '2026-03-10T08:00:00.000Z'
            },
            {
                id: 's2',
                date: '2026-03-10',
                schedule_item_id: 'lesson-1',
                replacement_teacher_id: 'teacher-B',
                updated_at: '2026-03-10T08:00:01.000Z'
            }
        ];
        const result = dedupeSubstitutions(rows);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.replacement_teacher_id).sort()).toEqual(['teacher-A', 'teacher-B']);
    });

    it('убирает настоящие дубли, оставляя самую свежую запись', () => {
        const rows = [
            {
                id: 'old',
                date: '2026-03-10',
                schedule_item_id: 'lesson-1',
                replacement_teacher_id: 'teacher-A',
                updated_at: '2026-03-10T08:00:00.000Z'
            },
            {
                id: 'new',
                date: '2026-03-10',
                schedule_item_id: 'lesson-1',
                replacement_teacher_id: 'teacher-A',
                updated_at: '2026-03-10T09:00:00.000Z'
            }
        ];
        const result = dedupeSubstitutions(rows);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('new');
    });

    it('строки без урока схлопываются по id', () => {
        const rows = [
            { id: 'a', date: '2026-03-10', schedule_item_id: null },
            { id: 'b', date: '2026-03-10', schedule_item_id: null }
        ];
        expect(dedupeSubstitutions(rows)).toHaveLength(2);
    });
});
