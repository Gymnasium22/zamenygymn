import { supabase } from '../supabase';
import { Settings } from '../../types';

const ORG_ID = 'f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7';

export const supabaseSettingsService = {
    get: async (): Promise<Settings | null> => {
        const { data, error } = await supabase.from('settings').select('*').maybeSingle();
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
        if (settings.telegramToken !== undefined) updates.telegram_token = settings.telegramToken;
        if (settings.publicScheduleId !== undefined) updates.public_schedule_id = settings.publicScheduleId;
        if (settings.feedbackChatId !== undefined) updates.feedback_chat_id = settings.feedbackChatId;
        if (settings.adminTelegramChatId !== undefined) updates.admin_telegram_chat_id = settings.adminTelegramChatId;
        if (settings.bellPresets !== undefined) updates.bell_presets = settings.bellPresets;
        if (settings.semesterConfig !== undefined) updates.semester_config = settings.semesterConfig;
        if (settings.telegramTemplates !== undefined) updates.telegram_templates = settings.telegramTemplates;
        if (settings.adminAnnouncement !== undefined) updates.admin_announcement = settings.adminAnnouncement;
        if (settings.substitutionDayComments !== undefined) updates.substitution_day_comments = settings.substitutionDayComments;
        if (settings.weatherApiKey !== undefined) updates.weather_api_key = settings.weatherApiKey;
        if (settings.weatherCity !== undefined) updates.weather_city = settings.weatherCity;
        if (settings.dashboardWidgetAccess !== undefined) updates.dashboard_widget_access = settings.dashboardWidgetAccess;
        if (settings.schoolName !== undefined) updates.school_name = settings.schoolName;
        if (settings.directorName !== undefined) updates.director_name = settings.directorName;
        if (settings.unionChairName !== undefined) updates.union_chair_name = settings.unionChairName;
        if (settings.secretaryName !== undefined) updates.secretary_name = settings.secretaryName;
        if (settings.currentYear !== undefined) updates.current_year = settings.currentYear;
        if (settings.isScheduleLocked !== undefined) updates.is_schedule_locked = settings.isScheduleLocked;
        if (settings.allowTeacherEdit !== undefined) updates.allow_teacher_edit = settings.allowTeacherEdit;
        if (settings.autoBackup !== undefined) updates.auto_backup = settings.autoBackup;
        if (settings.backupTime !== undefined) updates.backup_time = settings.backupTime;
        if (settings.googleAppsScriptUrl !== undefined) updates.google_apps_script_url = settings.googleAppsScriptUrl;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('settings').update(updates).eq('organization_id', ORG_ID);
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
        telegramToken: (data.telegram_token as string) || undefined,
        publicScheduleId: (data.public_schedule_id as string) || undefined,
        feedbackChatId: (data.feedback_chat_id as string) || undefined,
        adminTelegramChatId: (data.admin_telegram_chat_id as string) || undefined,
        bellPresets: (data.bell_presets as unknown) || undefined,
        semesterConfig: (data.semester_config as unknown) || undefined,
        telegramTemplates: (data.telegram_templates as unknown) || undefined,
        adminAnnouncement: (data.admin_announcement as unknown) || undefined,
        substitutionDayComments: (data.substitution_day_comments as Record<string, string>) || undefined,
        weatherApiKey: (data.weather_api_key as string) || undefined,
        weatherCity: (data.weather_city as string) || undefined,
        dashboardWidgetAccess: (data.dashboard_widget_access as Record<string, string[]>) || undefined,
        schoolName: (data.school_name as string) || undefined,
        directorName: (data.director_name as string) || undefined,
        unionChairName: (data.union_chair_name as string) || undefined,
        secretaryName: (data.secretary_name as string) || undefined,
        currentYear: (data.current_year as number) || undefined,
        isScheduleLocked: (data.is_schedule_locked as boolean) || undefined,
        allowTeacherEdit: (data.allow_teacher_edit as boolean) || undefined,
        autoBackup: (data.auto_backup as boolean) || undefined,
        backupTime: (data.backup_time as string) || undefined,
        googleAppsScriptUrl: (data.google_apps_script_url as string) || undefined,
        organizationId: data.organization_id as string
    };
}
