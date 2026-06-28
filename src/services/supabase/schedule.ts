import { supabase } from '../supabase';
import { ScheduleItem, Substitution, AbsenteeismRecord, NutritionRecord, DutyRecord } from '../../types';

export const supabaseScheduleService = {
    subscribe: (semester: 1 | 2, onNext: (items: ScheduleItem[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel(`schedule_${semester}_changes_${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'schedule_items', filter: `semester=eq.${semester}` },
                () => {
                    supabaseScheduleService.getAll(semester).then(onNext).catch(onError);
                }
            )
            .subscribe();

        supabaseScheduleService.getAll(semester).then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (semester: 1 | 2): Promise<ScheduleItem[]> => {
        const { data, error } = await supabase.from('schedule_items').select('*').eq('semester', semester).order('day');
        if (error) throw error;
        return (data || []).map(mapScheduleItem);
    },

    create: async (item: Omit<ScheduleItem, 'id'>): Promise<ScheduleItem> => {
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const { data, error } = await supabase.from('schedule_items').insert({
            id: genId(),
            semester: item.semester,
            day: item.day,
            period: item.period,
            shift: item.shift,
            class_id: item.classId || null,
            subject_id: item.subjectId || null,
            teacher_id: item.teacherId || null,
            room_id: item.roomId || null,
            direction: item.direction || null,
            organization_id: item.organizationId || 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7'
        }).select().single();
        if (error) throw error;
        return mapScheduleItem(data);
    },

    update: async (id: string, changes: Partial<ScheduleItem>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.day !== undefined) updates.day = changes.day;
        if (changes.period !== undefined) updates.period = changes.period;
        if (changes.shift !== undefined) updates.shift = changes.shift;
        if (changes.classId !== undefined) updates.class_id = changes.classId || null;
        if (changes.subjectId !== undefined) updates.subject_id = changes.subjectId || null;
        if (changes.teacherId !== undefined) updates.teacher_id = changes.teacherId || null;
        if (changes.roomId !== undefined) updates.room_id = changes.roomId || null;
        if (changes.direction !== undefined) updates.direction = changes.direction || null;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('schedule_items').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('schedule_items').delete().eq('id', id);
        if (error) throw error;
    }
};

function mapScheduleItem(data: Record<string, unknown>): ScheduleItem {
    return {
        id: data.id as string,
        semester: data.semester as 1 | 2,
        day: data.day as string,
        period: data.period as number,
        shift: data.shift as string,
        classId: (data.class_id as string) || undefined,
        subjectId: (data.subject_id as string) || undefined,
        teacherId: (data.teacher_id as string) || undefined,
        roomId: (data.room_id as string) || undefined,
        direction: (data.direction as string) || undefined,
        organizationId: data.organization_id as string
    };
}

export const supabaseSubstitutionsService = {
    subscribe: (onNext: (subs: Substitution[]) => void, onError?: (error: Error) => void) => {
        const channel = supabase
            .channel(`substitutions_changes_${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'substitutions' },
                () => {
                    supabaseSubstitutionsService.getAll().then(onNext).catch(onError);
                }
            )
            .subscribe();

        supabaseSubstitutionsService.getAll().then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<Substitution[]> => {
        const { data, error } = await supabase.from('substitutions').select('*').order('date');
        if (error) throw error;
        return (data || []).map(mapSubstitution);
    },

    create: async (sub: Omit<Substitution, 'id'>): Promise<Substitution> => {
        const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        const { data, error } = await supabase.from('substitutions').insert({
            id: genId(),
            date: sub.date,
            schedule_item_id: sub.scheduleItemId || null,
            original_teacher_id: sub.originalTeacherId || null,
            replacement_teacher_id: sub.replacementTeacherId || null,
            replacement_room_id: sub.replacementRoomId || null,
            replacement_class_id: sub.replacementClassId || null,
            replacement_subject_id: sub.replacementSubjectId || null,
            is_merger: sub.isMerger || false,
            lesson_absence_reason: sub.lessonAbsenceReason || null,
            refusals: sub.refusals || [],
            organization_id: sub.organizationId || 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7'
        }).select().single();
        if (error) throw error;
        return mapSubstitution(data);
    },

    update: async (id: string, changes: Partial<Substitution>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.date !== undefined) updates.date = changes.date;
        if (changes.scheduleItemId !== undefined) updates.schedule_item_id = changes.scheduleItemId || null;
        if (changes.originalTeacherId !== undefined) updates.original_teacher_id = changes.originalTeacherId || null;
        if (changes.replacementTeacherId !== undefined) updates.replacement_teacher_id = changes.replacementTeacherId || null;
        if (changes.replacementRoomId !== undefined) updates.replacement_room_id = changes.replacementRoomId || null;
        if (changes.replacementClassId !== undefined) updates.replacement_class_id = changes.replacementClassId || null;
        if (changes.replacementSubjectId !== undefined) updates.replacement_subject_id = changes.replacementSubjectId || null;
        if (changes.isMerger !== undefined) updates.is_merger = changes.isMerger;
        if (changes.lessonAbsenceReason !== undefined) updates.lesson_absence_reason = changes.lessonAbsenceReason || null;
        if (changes.refusals !== undefined) updates.refusals = changes.refusals;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('substitutions').update(updates).eq('id', id);
        if (error) throw error;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('substitutions').delete().eq('id', id);
        if (error) throw error;
    }
};

function mapSubstitution(data: Record<string, unknown>): Substitution {
    return {
        id: data.id as string,
        date: data.date as string,
        scheduleItemId: (data.schedule_item_id as string) || undefined,
        originalTeacherId: (data.original_teacher_id as string) || undefined,
        replacementTeacherId: (data.replacement_teacher_id as string) || undefined,
        replacementRoomId: (data.replacement_room_id as string) || undefined,
        replacementClassId: (data.replacement_class_id as string) || undefined,
        replacementSubjectId: (data.replacement_subject_id as string) || undefined,
        isMerger: (data.is_merger as boolean) || false,
        lessonAbsenceReason: (data.lesson_absence_reason as string) || undefined,
        refusals: (data.refusals as string[]) || [],
        organizationId: data.organization_id as string
    };
}

export const supabaseAbsenteeismService = {
    getAll: async (): Promise<AbsenteeismRecord[]> => {
        const { data, error } = await supabase.from('absenteeism').select('*').order('date');
        if (error) throw error;
        return (data || []).map((a: Record<string, unknown>) => ({
            id: a.id as string,
            date: a.date as string,
            classId: (a.class_id as string) || undefined,
            absences: (a.absences as unknown[]) || [],
            presentCount: (a.present_count as number) || 0,
            absentCount: (a.absent_count as number) || 0,
            enteredBy: (a.entered_by as string) || undefined,
            enteredAt: (a.entered_at as string) || undefined,
            updatedAt: (a.updated_at as string) || undefined,
            updatedBy: (a.updated_by as string) || undefined,
            organizationId: a.organization_id as string
        }));
    },

    set: async (record: AbsenteeismRecord): Promise<void> => {
        const { error } = await supabase.from('absenteeism').upsert({
            id: record.id,
            date: record.date,
            class_id: record.classId || null,
            absences: record.absences || [],
            present_count: record.presentCount || 0,
            absent_count: record.absentCount || 0,
            entered_by: record.enteredBy || null,
            entered_at: record.enteredAt || null,
            updated_at: record.updatedAt || new Date().toISOString(),
            updated_by: record.updatedBy || null,
            organization_id: record.organizationId
        });
        if (error) throw error;
    }
};

export const supabaseNutritionService = {
    getAll: async (): Promise<NutritionRecord[]> => {
        const { data, error } = await supabase.from('nutrition').select('*').order('date');
        if (error) throw error;
        return (data || []).map((n: Record<string, unknown>) => ({
            id: n.id as string,
            date: n.date as string,
            classId: (n.class_id as string) || undefined,
            breakfastCount: (n.breakfast_count as number) || 0,
            lunchCount: (n.lunch_count as number) || 0,
            dinnerCount: (n.dinner_count as number) || 0,
            totalCount: (n.total_count as number) || 0,
            benefitCount: (n.benefit_count as number) || 0,
            regularCount: (n.regular_count as number) || 0,
            enteredBy: (n.entered_by as string) || undefined,
            enteredAt: (n.entered_at as string) || undefined,
            organizationId: n.organization_id as string
        }));
    },

    set: async (record: NutritionRecord): Promise<void> => {
        const { error } = await supabase.from('nutrition').upsert({
            id: record.id,
            date: record.date,
            class_id: record.classId || null,
            breakfast_count: record.breakfastCount || 0,
            lunch_count: record.lunchCount || 0,
            dinner_count: record.dinnerCount || 0,
            total_count: record.totalCount || 0,
            benefit_count: record.benefitCount || 0,
            regular_count: record.regularCount || 0,
            entered_by: record.enteredBy || null,
            entered_at: record.enteredAt || null,
            organization_id: record.organizationId,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
    }
};

export const supabaseDutyService = {
    getAll: async (): Promise<DutyRecord[]> => {
        const { data, error } = await supabase.from('duty').select('*').order('day');
        if (error) throw error;
        return (data || []).map((d: Record<string, unknown>) => ({
            id: d.id as string,
            day: d.day as string,
            shift: d.shift as string,
            zoneId: (d.zone_id as string) || '',
            teacherId: (d.teacher_id as string) || '',
            organizationId: d.organization_id as string
        }));
    },

    set: async (record: DutyRecord): Promise<void> => {
        const { error } = await supabase.from('duty').upsert({
            id: record.id,
            day: record.day,
            shift: record.shift,
            zone_id: record.zoneId,
            teacher_id: record.teacherId,
            organization_id: record.organizationId,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
    }
};
