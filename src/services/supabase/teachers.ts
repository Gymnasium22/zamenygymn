import { supabase } from '../supabase';
import { Teacher, Subject } from '../../types';

export const supabaseTeachersService = {
    subscribe: (onNext: (teachers: Teacher[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel('teachers_changes')
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
        const { data, error } = await supabase.from('teachers').insert({
            name: teacher.name,
            subjects: teacher.subjects || [],
            shift: teacher.shift || null,
            max_periods: teacher.maxPeriods || 8,
            class_teacher_of: teacher.classTeacherOf || null,
            unavailable_dates: teacher.unavailableDates || [],
            absence_reasons: teacher.absenceReasons || {},
            organization_id: teacher.organizationId
        }).select().single();
        if (error) throw error;
        return mapTeacher(data);
    },

    update: async (id: string, changes: Partial<Teacher>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.subjects !== undefined) updates.subjects = changes.subjects;
        if (changes.shift !== undefined) updates.shift = changes.shift;
        if (changes.maxPeriods !== undefined) updates.max_periods = changes.maxPeriods;
        if (changes.classTeacherOf !== undefined) updates.class_teacher_of = changes.classTeacherOf;
        if (changes.unavailableDates !== undefined) updates.unavailable_dates = changes.unavailableDates;
        if (changes.absenceReasons !== undefined) updates.absence_reasons = changes.absenceReasons;
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
        subjects: (data.subjects as string[]) || [],
        shift: (data.shift as string) || undefined,
        maxPeriods: (data.max_periods as number) || 8,
        classTeacherOf: (data.class_teacher_of as string) || undefined,
        unavailableDates: (data.unavailable_dates as string[]) || [],
        absenceReasons: (data.absence_reasons as Record<string, string>) || {},
        organizationId: data.organization_id as string
    };
}

export const supabaseSubjectsService = {
    subscribe: (onNext: (subjects: Subject[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel('subjects_changes')
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
            organizationId: s.organization_id as string
        }));
    },

    create: async (subject: Omit<Subject, 'id'>): Promise<Subject> => {
        const { data, error } = await supabase.from('subjects').insert({
            name: subject.name,
            organization_id: subject.organizationId
        }).select().single();
        if (error) throw error;
        return { id: data.id as string, name: data.name as string, organizationId: data.organization_id as string };
    },

    update: async (id: string, changes: Partial<Subject>): Promise<void> => {
        const { error } = await supabase.from('subjects').update({ name: changes.name }).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('subjects').delete().eq('id', id);
        if (error) throw error;
    }
};
