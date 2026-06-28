import { supabase } from '../supabase';
import { Teacher, Subject } from '../../types';

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
            .subscribe();

        supabaseTeachersService.getAll().then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<Teacher[]> => {
        const { data, error } = await supabase.from('teachers').select('*').order('name');
        if (error) throw error;
        return (data || []).map(mapTeacher);
    },

    create: async (teacher: Omit<Teacher, 'id'>): Promise<Teacher> => {
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const { data, error } = await supabase.from('teachers').insert({
            id: genId(),
            name: teacher.name,
            subject_ids: teacher.subjectIds || [],
            shifts: teacher.shifts || [],
            max_periods: teacher.maxPeriods || 8,
            class_teacher_of: teacher.classTeacherOf || null,
            unavailable_dates: teacher.unavailableDates || [],
            absence_reasons: teacher.absenceReasons || {},
            organization_id: teacher.organizationId || 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7'
        }).select().single();
        if (error) throw error;
        return mapTeacher(data);
    },

    update: async (id: string, changes: Partial<Teacher>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.subjectIds !== undefined) updates.subject_ids = changes.subjectIds;
        if (changes.shifts !== undefined) updates.shifts = changes.shifts;
        if (changes.maxPeriods !== undefined) updates.max_periods = changes.maxPeriods;
        if (changes.classTeacherOf !== undefined) updates.class_teacher_of = changes.classTeacherOf;
        if (changes.unavailableDates !== undefined) updates.unavailable_dates = changes.unavailableDates;
        if (changes.absenceReasons !== undefined) updates.absence_reasons = changes.absenceReasons;
        if (changes.birthDate !== undefined) updates.birth_date = changes.birthDate || null;
        if (changes.telegramChatId !== undefined) updates.telegram_chat_id = changes.telegramChatId || null;
        if (changes.order !== undefined) updates.order = changes.order;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('teachers').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('teachers').delete().eq('id', id);
        if (error) throw error;
    }
};

function mapTeacher(data: Record<string, unknown>): Teacher {
    return {
        id: data.id as string,
        name: data.name as string,
        subjectIds: (data.subject_ids as string[]) || [],
        shifts: (data.shifts as string[]) || [],
        maxPeriods: (data.max_periods as number) || 8,
        classTeacherOf: (data.class_teacher_of as string) || undefined,
        unavailableDates: (data.unavailable_dates as string[]) || [],
        absenceReasons: (data.absence_reasons as Record<string, string>) || {},
        birthDate: (data.birth_date as string) || undefined,
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
        const { data, error } = await supabase.from('subjects').select('*').order('name');
        if (error) throw error;
        return (data || []).map((s: Record<string, unknown>) => ({
            id: s.id as string,
            name: s.name as string,
            color: (s.color as string) || undefined,
            difficulty: (s.difficulty as number) || undefined,
            requiredRoomType: (s.required_room_type as string) || undefined,
            order: (s.order as number) || undefined,
            organizationId: s.organization_id as string
        }));
    },

    create: async (subject: Omit<Subject, 'id'>): Promise<Subject> => {
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const { data, error } = await supabase.from('subjects').insert({
            id: genId(),
            name: subject.name,
            color: subject.color || null,
            difficulty: subject.difficulty || null,
            required_room_type: subject.requiredRoomType || null,
            order: subject.order || null,
            organization_id: subject.organizationId || 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7'
        }).select().single();
        if (error) throw error;
        return {
            id: data.id as string,
            name: data.name as string,
            color: (data.color as string) || undefined,
            difficulty: (data.difficulty as number) || undefined,
            requiredRoomType: (data.required_room_type as string) || undefined,
            order: (data.order as number) || undefined,
            organizationId: data.organization_id as string
        };
    },

    update: async (id: string, changes: Partial<Subject>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.color !== undefined) updates.color = changes.color || null;
        if (changes.difficulty !== undefined) updates.difficulty = changes.difficulty || null;
        if (changes.requiredRoomType !== undefined) updates.required_room_type = changes.requiredRoomType || null;
        if (changes.order !== undefined) updates.order = changes.order || null;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('subjects').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('subjects').delete().eq('id', id);
        if (error) throw error;
    }
};
