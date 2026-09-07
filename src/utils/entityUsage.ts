import { AppData, ClassEntity, ScheduleItem, Teacher } from '../types';

export type UsageKind = 'teacher' | 'class' | 'room' | 'subject';

export interface UsageLine {
    where: string;
    detail: string;
}

const lessonLabel = (item: ScheduleItem, data: Pick<AppData, 'classes' | 'subjects' | 'teachers'>) => {
    const cls = data.classes.find((c) => c.id === item.classId)?.name || item.classId;
    const sub = data.subjects.find((s) => s.id === item.subjectId)?.name || item.subjectId;
    const t = data.teachers.find((x) => x.id === item.teacherId)?.name || item.teacherId;
    return `${item.day}, ${item.period} ур. · ${cls} · ${sub} · ${t}`;
};

export function findEntityUsage(
    kind: UsageKind,
    id: string,
    data: Pick<AppData, 'schedule' | 'schedule2' | 'substitutions' | 'dutySchedule' | 'classes' | 'subjects' | 'teachers' | 'rooms'>
): UsageLine[] {
    const lines: UsageLine[] = [];
    const schedules: { label: string; items: ScheduleItem[] }[] = [
        { label: 'Расписание 1 пол.', items: data.schedule || [] },
        { label: 'Расписание 2 пол.', items: data.schedule2 || [] }
    ];

    const matchLesson = (item: ScheduleItem) => {
        if (kind === 'teacher') return item.teacherId === id;
        if (kind === 'class') return item.classId === id;
        if (kind === 'room') return item.roomId === id;
        return item.subjectId === id;
    };

    for (const pack of schedules) {
        const hits = pack.items.filter(matchLesson);
        hits.slice(0, 8).forEach((item) => {
            lines.push({ where: pack.label, detail: lessonLabel(item, data) });
        });
        if (hits.length > 8) {
            lines.push({ where: pack.label, detail: `…ещё ${hits.length - 8} уроков` });
        }
    }

    (data.substitutions || []).forEach((s) => {
        const hit =
            (kind === 'teacher' &&
                (s.originalTeacherId === id || s.replacementTeacherId === id)) ||
            (kind === 'class' && s.replacementClassId === id) ||
            (kind === 'room' && s.replacementRoomId === id) ||
            (kind === 'subject' && s.replacementSubjectId === id);
        if (hit) {
            lines.push({
                where: 'Замены',
                detail: `${s.date} · урок ${s.scheduleItemId.slice(0, 8)}…`
            });
        }
    });

    if (kind === 'teacher') {
        (data.dutySchedule || [])
            .filter((d) => d.teacherId === id)
            .forEach((d) => {
                lines.push({ where: 'Дежурство', detail: `${d.day}, зона ${d.zoneId}` });
            });
        (data.classes || [])
            .filter((c: ClassEntity) => c.classTeacherId === id)
            .forEach((c) => lines.push({ where: 'Классное руководство', detail: c.name }));
    }

    if (kind === 'teacher') {
        const t = (data.teachers || []).find((x: Teacher) => x.id === id);
        if (t?.classTeacherOf) {
            const cls = data.classes.find((c) => c.id === t.classTeacherOf);
            if (cls) lines.push({ where: 'Классное руководство', detail: cls.name });
        }
    }

    return lines;
}
