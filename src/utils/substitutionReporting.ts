import { ClassEntity, Subject, Substitution, Teacher } from '../types';
import { parseDateSafe } from './helpers';
import { isRoomSubstitution } from './roomSubstitution';

/** Несколько строк подгрупп могут описывать один и тот же урок. */
export const getSubstitutionLessonKey = (sub: Pick<Substitution, 'date' | 'scheduleItemId'>): string =>
    `${sub.date}|${sub.scheduleItemId}`;

export const countUniqueSubstitutionLessons = (
    substitutions: Substitution[],
    predicate: (sub: Substitution) => boolean
): number => {
    const lessons = new Set<string>();
    substitutions.forEach((sub) => {
        if (predicate(sub)) lessons.add(getSubstitutionLessonKey(sub));
    });
    return lessons.size;
};

/** Невалидные даты не относятся к текущему или какому-либо другому месяцу. */
export const filterSubstitutionsByMonth = (substitutions: Substitution[], targetDate: Date): Substitution[] => {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    return substitutions
        .filter((sub) => {
            const date = parseDateSafe(sub.date);
            return date?.getFullYear() === year && date.getMonth() === month;
        })
        .sort((a, b) => (parseDateSafe(a.date)?.getTime() ?? 0) - (parseDateSafe(b.date)?.getTime() ?? 0));
};

/** Показывает все различающиеся статусы подгрупп, а не статус первой строки. */
export const formatReplacementStatuses = (
    substitutions: Substitution[],
    teachers: Teacher[],
    classes: ClassEntity[],
    subjects: Subject[]
): string => {
    const teacherSubs = substitutions.filter((sub) => !isRoomSubstitution(sub));
    const rows = teacherSubs.length > 0 ? teacherSubs : substitutions;
    const labels = rows.map((sub) => {
        if (sub.replacementTeacherId === 'conducted') return 'Урок проведен';
        if (sub.replacementTeacherId === 'cancelled') return 'Урок снят';

        const teacher = teachers.find((item) => item.id === sub.replacementTeacherId);
        let label = teacher?.name || 'Неизвестно';
        if (sub.isMerger) {
            let suffix = ' (Объединение)';
            if (sub.replacementClassId) {
                const mergedClass = classes.find((item) => item.id === sub.replacementClassId);
                if (mergedClass) suffix = ` (Объединение с ${mergedClass.name})`;
            }
            label += suffix;
        } else if (sub.replacementClassId && sub.replacementSubjectId) {
            const swappedClass = classes.find((item) => item.id === sub.replacementClassId);
            const swappedSubject = subjects.find((item) => item.id === sub.replacementSubjectId);
            label += ` (Урок ${swappedClass?.name || '?'} ${swappedSubject?.name || '?'})`;
        }
        return label;
    });
    return [...new Set(labels)].join('; ');
};
