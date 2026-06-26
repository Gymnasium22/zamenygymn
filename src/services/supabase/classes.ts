import { supabase } from '../supabase';
import { ClassEntity, Room } from '../../types';

export const supabaseClassesService = {
    subscribe: (onNext: (classes: ClassEntity[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel('classes_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'classes' },
                () => {
                    supabaseClassesService.getAll().then(onNext).catch(onError);
                }
            )
            .subscribe();

        supabaseClassesService.getAll().then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<ClassEntity[]> => {
        const { data, error } = await supabase.from('classes').select('*').order('name');
        if (error) throw error;
        return (data || []).map(mapClass);
    },

    create: async (cls: Omit<ClassEntity, 'id'>): Promise<ClassEntity> => {
        const { data, error } = await supabase.from('classes').insert({
            name: cls.name,
            shift: cls.shift,
            student_count: cls.studentCount || 0,
            grade: cls.grade || null,
            class_teacher_id: cls.classTeacherId || null,
            organization_id: cls.organizationId
        }).select().single();
        if (error) throw error;
        return mapClass(data);
    },

    update: async (id: string, changes: Partial<ClassEntity>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.shift !== undefined) updates.shift = changes.shift;
        if (changes.studentCount !== undefined) updates.student_count = changes.studentCount;
        if (changes.grade !== undefined) updates.grade = changes.grade;
        if (changes.classTeacherId !== undefined) updates.class_teacher_id = changes.classTeacherId || null;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('classes').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) throw error;
    }
};

function mapClass(data: Record<string, unknown>): ClassEntity {
    return {
        id: data.id as string,
        name: data.name as string,
        shift: data.shift as string,
        studentCount: (data.student_count as number) || 0,
        grade: (data.grade as string) || undefined,
        classTeacherId: (data.class_teacher_id as string) || undefined,
        organizationId: data.organization_id as string
    };
}

export const supabaseRoomsService = {
    subscribe: (onNext: (rooms: Room[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel('rooms_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'rooms' },
                () => {
                    supabaseRoomsService.getAll().then(onNext).catch(onError);
                }
            )
            .subscribe();

        supabaseRoomsService.getAll().then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<Room[]> => {
        const { data, error } = await supabase.from('rooms').select('*').order('name');
        if (error) throw error;
        return (data || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            name: r.name as string,
            floor: (r.floor as number) || undefined,
            capacity: (r.capacity as number) || undefined,
            organizationId: r.organization_id as string
        }));
    },

    create: async (room: Omit<Room, 'id'>): Promise<Room> => {
        const { data, error } = await supabase.from('rooms').insert({
            name: room.name,
            floor: room.floor || null,
            capacity: room.capacity || null,
            organization_id: room.organizationId
        }).select().single();
        if (error) throw error;
        return { id: data.id as string, name: data.name as string, floor: data.floor as number, capacity: data.capacity as number, organizationId: data.organization_id as string };
    },

    update: async (id: string, changes: Partial<Room>): Promise<void> => {
        const { error } = await supabase.from('rooms').update({
            name: changes.name,
            floor: changes.floor,
            capacity: changes.capacity
        }).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('rooms').delete().eq('id', id);
        if (error) throw error;
    }
};
