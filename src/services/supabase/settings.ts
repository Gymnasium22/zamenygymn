import { supabase } from '../supabase';
import { Settings } from '../../types';

export const supabaseSettingsService = {
    get: async (): Promise<Settings | null> => {
        const { data, error } = await supabase.from('settings').select('*').single();
        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        if (!data) return null;
        return mapSettings(data);
    },

    update: async (settings: Partial<Settings>): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (settings.schoolYear !== undefined) updates.school_year = settings.schoolYear;
        if (settings.semesterStart1 !== undefined) updates.semester_start_1 = settings.semesterStart1;
        if (settings.semesterEnd1 !== undefined) updates.semester_end_1 = settings.semesterEnd1;
        if (settings.semesterStart2 !== undefined) updates.semester_start_2 = settings.semesterStart2;
        if (settings.semesterEnd2 !== undefined) updates.semester_end_2 = settings.semesterEnd2;
        if (settings.shift1Start !== undefined) updates.shift1_start = settings.shift1Start;
        if (settings.shift1End !== undefined) updates.shift1_end = settings.shift1End;
        if (settings.shift2Start !== undefined) updates.shift2_start = settings.shift2Start;
        if (settings.shift2End !== undefined) updates.shift2_end = settings.shift2End;
        if (settings.periods !== undefined) updates.periods = settings.periods;
        if (settings.shift1Periods !== undefined) updates.shift1_periods = settings.shift1Periods;
        if (settings.shift2Periods !== undefined) updates.shift2_periods = settings.shift2Periods;
        if (settings.maxPeriods !== undefined) updates.max_periods = settings.maxPeriods;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('settings').update(updates);
        if (error) throw error;
    }
};

function mapSettings(data: Record<string, unknown>): Settings {
    return {
        id: data.id as string,
        schoolYear: (data.school_year as string) || undefined,
        semesterStart1: (data.semester_start_1 as string) || undefined,
        semesterEnd1: (data.semester_end_1 as string) || undefined,
        semesterStart2: (data.semester_start_2 as string) || undefined,
        semesterEnd2: (data.semester_end_2 as string) || undefined,
        shift1Start: (data.shift1_start as string) || undefined,
        shift1End: (data.shift1_end as string) || undefined,
        shift2Start: (data.shift2_start as string) || undefined,
        shift2End: (data.shift2_end as string) || undefined,
        periods: (data.periods as number) || 8,
        shift1Periods: (data.shift1_periods as number) || 8,
        shift2Periods: (data.shift2_periods as number) || 8,
        maxPeriods: (data.max_periods as number) || 8,
        organizationId: data.organization_id as string
    };
}
