import { supabase } from '../supabase';
import { ClassEntity, Room } from '../../types';

export const supabaseClassesService = {
    subscribe: (onNext: (classes: ClassEntity[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel(`classes_changes_${Date.now()}`)
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
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const { data, error } = await supabase.from('classes').insert({
            id: genId(),
            name: cls.name,
            shift: cls.shift,
            students_count: cls.studentsCount || 0,
            grade: cls.grade || null,
            class_teacher_id: cls.classTeacherId || null,
            exclude_from_reports: cls.excludeFromReports || false,
            order: cls.order || null,
            organization_id: cls.organizationId || 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7'
        }).select().single();
        if (error) throw error;
        return mapClass(data);
    },

    update: async (id: string, changes: Partial<ClassEntity>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.shift !== undefined) updates.shift = changes.shift;
        if (changes.studentsCount !== undefined) updates.students_count = changes.studentsCount;
        if (changes.grade !== undefined) updates.grade = changes.grade || null;
        if (changes.classTeacherId !== undefined) updates.class_teacher_id = changes.classTeacherId || null;
        if (changes.excludeFromReports !== undefined) updates.exclude_from_reports = changes.excludeFromReports;
        if (changes.order !== undefined) updates.order = changes.order || null;
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
        studentsCount: (data.students_count as number) || 0,
        grade: (data.grade as string) || undefined,
        classTeacherId: (data.class_teacher_id as string) || undefined,
        excludeFromReports: (data.exclude_from_reports as boolean) || false,
        order: (data.order as number) || undefined,
        organizationId: data.organization_id as string
    };
}

export const supabaseRoomsService = {
    subscribe: (onNext: (rooms: Room[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel(`rooms_changes_${Date.now()}`)
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
            type: (r.type as string) || undefined,
            order: (r.order as number) || undefined,
            organizationId: r.organization_id as string
        }));
    },

    create: async (room: Omit<Room, 'id'>): Promise<Room> => {
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const { data, error } = await supabase.from('rooms').insert({
            id: genId(),
            name: room.name,
            floor: room.floor || null,
            capacity: room.capacity || null,
            type: room.type || null,
            order: room.order || null,
            organization_id: room.organizationId || 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7'
        }).select().single();
        if (error) throw error;
        return {
            id: data.id as string,
            name: data.name as string,
            floor: (data.floor as number) || undefined,
            capacity: (data.capacity as number) || undefined,
            type: (data.type as string) || undefined,
            order: (data.order as number) || undefined,
            organizationId: data.organization_id as string
        };
    },

    update: async (id: string, changes: Partial<Room>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.name !== undefined) updates.name = changes.name;
        if (changes.floor !== undefined) updates.floor = changes.floor || null;
        if (changes.capacity !== undefined) updates.capacity = changes.capacity || null;
        if (changes.type !== undefined) updates.type = changes.type || null;
        if (changes.order !== undefined) updates.order = changes.order || null;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('rooms').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('rooms').delete().eq('id', id);
        if (error) throw error;
    }
};
