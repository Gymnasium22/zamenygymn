import { supabaseUsersService } from './users';
import { supabaseTeachersService, supabaseSubjectsService } from './teachers';
import { supabaseClassesService, supabaseRoomsService } from './classes';
import { supabaseSettingsService } from './settings';
import { supabaseScheduleService, supabaseSubstitutionsService, supabaseAbsenteeismService, supabaseNutritionService, supabaseDutyService } from './schedule';
import { supabaseAuditLogService } from './auditLog';

export const supabaseServices = {
    users: supabaseUsersService,
    teachers: supabaseTeachersService,
    subjects: supabaseSubjectsService,
    classes: supabaseClassesService,
    rooms: supabaseRoomsService,
    settings: supabaseSettingsService,
    schedule: supabaseScheduleService,
    substitutions: supabaseSubstitutionsService,
    absenteeism: supabaseAbsenteeismService,
    nutrition: supabaseNutritionService,
    duty: supabaseDutyService,
    auditLog: supabaseAuditLogService
};
