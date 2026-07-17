import { supabase } from '../supabase';
import { Teacher, Subject } from '../../types';
import { generateId } from '../../utils/helpers';

const toDateOnly = (value: unknown): string | undefined => {
    if (value == null || value === '') return undefined;
    return String(value).split('T')[0];
};

async function loadSubjectIdsByTeacher(teacherIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!teacherIds.length) return map;
    const { data, error } = await supabase
        .from('teacher_subjects')
        .select('teacher_id, subject_id')
        .in('teacher_id', teacherIds);
    if (error) throw error;
    for (const row of data || []) {
        const tid = row.teacher_id as string;
        const sid = row.subject_id as string;
        const list = map.get(tid) || [];
        list.push(sid);
        map.set(tid, list);
    }
    return map;
}

async function replaceTeacherSubjects(
    teacherId: string,
    organizationId: string | undefined,
    subjectIds: string[]
): Promise<void> {
    const { error: delError } = await supabase.from('teacher_subjects').delete().eq('teacher_id', teacherId);
    if (delError) throw delError;
    if (!subjectIds.length || !organizationId) return;
    const rows = subjectIds.filter(Boolean).map((subject_id) => ({
        teacher_id: teacherId,
        subject_id,
        organization_id: organizationId
    }));
    if (!rows.length) return;
    const { error: insError } = await supabase.from('teacher_subjects').upsert(rows);
    if (insError) throw insError;
}

export const supabaseTeachersService = {
    subscribe: (onNext: (teachers: Teacher[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel(`teachers_changes_${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'teachers' },
                () => {
                    supabaseTeachersService.getAll().then(onNext).catch(onError);
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'teacher_subjects' },
                () => {
                    supabaseTeachersService.getAll().then(onNext).catch(onError);
                }
            )
            .subscribe();

        supabaseTeachersService.getAll().then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<Teacher[]> => {
        const { data, error } = await supabase.from('teachers').select('*').order('name');
        if (error) throw error;
        const rows = data || [];
        const subjectMap = await loadSubjectIdsByTeacher(rows.map((r) => r.id as string));
        return rows.map((row) => mapTeacher(row as Record<string, unknown>, subjectMap));
    },

    create: async (teacher: Omit<Teacher, 'id'>): Promise<Teacher> => {
        const id = generateId();
        const { data, error } = await supabase
            .from('teachers')
            .insert({
                id,
                name: teacher.name,
                shifts: teacher.shifts || [],
                max_periods: teacher.maxPeriods || 8,
                class_teacher_of: teacher.classTeacherOf || null,
                unavailable_dates: teacher.unavailableDates || [],
                absence_reasons: teacher.absenceReasons || {},
                birth_date: toDateOnly(teacher.birthDate) || null,
                telegram_chat_id: teacher.telegramChatId || null,
                organization_id: teacher.organizationId || null
            })
            .select()
            .single();
        if (error) throw error;
        await replaceTeacherSubjects(id, teacher.organizationId, teacher.subjectIds || []);
        const subjectMap = new Map<string, string[]>([[id, teacher.subjectIds || []]]);
        return mapTeacher(data as Record<string, unknown>, subjectMap);
    },

    update: async (id: string, changes: Partial<Teacher>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.shifts !== undefined) updates.shifts = changes.shifts;
        if (changes.maxPeriods !== undefined) updates.max_periods = changes.maxPeriods;
        if (changes.classTeacherOf !== undefined) updates.class_teacher_of = changes.classTeacherOf;
        if (changes.unavailableDates !== undefined) updates.unavailable_dates = changes.unavailableDates;
        if (changes.absenceReasons !== undefined) updates.absence_reasons = changes.absenceReasons;
        if (changes.birthDate !== undefined) updates.birth_date = toDateOnly(changes.birthDate) || null;
        if (changes.telegramChatId !== undefined) updates.telegram_chat_id = changes.telegramChatId || null;
        if (changes.order !== undefined) updates.order = changes.order;
        updates.updated_at = new Date().toISOString();

        if (Object.keys(updates).length > 1 || updates.name !== undefined) {
            const { error } = await supabase.from('teachers').update(updates).eq('id', id);
            if (error) throw error;
        }

        if (changes.subjectIds !== undefined) {
            let organizationId = changes.organizationId;
            if (!organizationId) {
                const { data } = await supabase.from('teachers').select('organization_id').eq('id', id).maybeSingle();
                organizationId = (data?.organization_id as string) || undefined;
            }
            await replaceTeacherSubjects(id, organizationId, changes.subjectIds);
        }
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('teachers').delete().eq('id', id);
        if (error) throw error;
    }
};

function mapTeacher(data: Record<string, unknown>, subjectMap: Map<string, string[]>): Teacher {
    const id = data.id as string;
    return {
        id,
        name: data.name as string,
        subjectIds: subjectMap.get(id) || [],
        shifts: (data.shifts as string[]) || [],
        maxPeriods: (data.max_periods as number) || 8,
        classTeacherOf: (data.class_teacher_of as string) || undefined,
        unavailableDates: (data.unavailable_dates as string[]) || [],
        absenceReasons: (data.absence_reasons as Record<string, string>) || {},
        birthDate: toDateOnly(data.birth_date),
        telegramChatId: (data.telegram_chat_id as string) || undefined,
        order: (data.order as number) || undefined,
        organizationId: data.organization_id as string
    };
}

export const supabaseSubjectsService = {
    subscribe: (onNext: (subjects: Subject[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel(`subjects_changes_${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'subjects' },
                () => {
                    supabaseSubjectsService.getAll().then(onNext).catch(onError);
                }
            )
            .subscribe();

        supabaseSubjectsService.getAll().then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<Subject[]> => {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .order('order', { ascending: true, nullsFirst: false })
            .order('name', { ascending: true });
        if (error) throw error;
        return (data || []).map((s: Record<string, unknown>) => ({
            id: s.id as string,
            name: s.name as string,
            color: (s.color as string) || undefined,
            difficulty: (s.difficulty as number) || undefined,
            requiredRoomType: (s.required_room_type as string) || undefined,
            order: typeof s.order === 'number' ? s.order : Number(s.order) || 0,
            organizationId: s.organization_id as string
        }));
    },

    create: async (subject: Omit<Subject, 'id'>): Promise<Subject> => {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('subjects')
            .insert({
                id: generateId(),
                name: subject.name,
                color: subject.color || null,
                difficulty: subject.difficulty || null,
                required_room_type: subject.requiredRoomType || null,
                order: typeof subject.order === 'number' ? subject.order : null,
                organization_id: subject.organizationId || null,
                created_at: now,
                updated_at: now
            })
            .select()
            .single();
        if (error) throw error;
        return {
            id: data.id as string,
            name: data.name as string,
            color: (data.color as string) || undefined,
            difficulty: (data.difficulty as number) || undefined,
            requiredRoomType: (data.required_room_type as string) || undefined,
            order: typeof data.order === 'number' ? data.order : Number(data.order) || 0,
            organizationId: data.organization_id as string
        };
    },

    update: async (id: string, changes: Partial<Subject>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.color !== undefined) updates.color = changes.color || null;
        if (changes.difficulty !== undefined) updates.difficulty = changes.difficulty || null;
        if (changes.requiredRoomType !== undefined) updates.required_room_type = changes.requiredRoomType || null;
        if (changes.order !== undefined) updates.order = typeof changes.order === 'number' ? changes.order : null;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('subjects').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('subjects').delete().eq('id', id);
        if (error) throw error;
    }
};
