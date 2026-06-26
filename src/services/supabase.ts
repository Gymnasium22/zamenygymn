import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bbktjircoangqvusirap.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJia3RqaXJjb2FuZ3F2dXNpcmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NDI3NzQsImV4cCI6MjA5ODAxODc3NH0.RIy_uePmskvjkwK2hMHIFVZey1h3MmB2fIMR8nZtXec';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type DbTables = {
  organizations: {
    id: string;
    name: string;
    type: 'school' | 'gymnasium' | 'college' | 'lyceum';
    city: string | null;
    address: string | null;
    created_at: string;
    updated_at: string;
  };
  profiles: {
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    role: 'admin' | 'deputy' | 'teacher' | 'methodologist' | 'accountant';
    is_active: boolean;
    organization_id: string | null;
    teacher_id: string | null;
    permissions: string[];
    allowed_pages: string[];
    created_at: string;
    updated_at: string;
  };
  teachers: {
    id: string;
    organization_id: string;
    name: string;
    subjects: string[];
    shift: string | null;
    max_periods: number;
    class_teacher_of: string | null;
    unavailable_dates: string[];
    absence_reasons: Record<string, string>;
    created_at: string;
    updated_at: string;
  };
  classes: {
    id: string;
    organization_id: string;
    name: string;
    shift: string;
    student_count: number;
    grade: string | null;
    class_teacher_id: string | null;
    created_at: string;
    updated_at: string;
  };
  subjects: {
    id: string;
    organization_id: string;
    name: string;
    created_at: string;
  };
  rooms: {
    id: string;
    organization_id: string;
    name: string;
    floor: number | null;
    capacity: number | null;
    created_at: string;
  };
  settings: {
    id: string;
    organization_id: string;
    school_year: string | null;
    semester_start_1: string | null;
    semester_end_1: string | null;
    semester_start_2: string | null;
    semester_end_2: string | null;
    shift1_start: string | null;
    shift1_end: string | null;
    shift2_start: string | null;
    shift2_end: string | null;
    periods: number;
    shift1_periods: number;
    shift2_periods: number;
    max_periods: number;
    created_at: string;
    updated_at: string;
  };
  schedule_items: {
    id: string;
    organization_id: string;
    semester: number;
    day: 'Пн' | 'Вт' | 'Ср' | 'Чт' | 'Пт';
    period: number;
    shift: string;
    class_id: string | null;
    subject_id: string | null;
    teacher_id: string | null;
    room_id: string | null;
    direction: string | null;
    created_at: string;
    updated_at: string;
  };
  substitutions: {
    id: string;
    organization_id: string;
    date: string;
    schedule_item_id: string | null;
    original_teacher_id: string | null;
    replacement_teacher_id: string | null;
    replacement_room_id: string | null;
    replacement_class_id: string | null;
    replacement_subject_id: string | null;
    is_merger: boolean;
    lesson_absence_reason: string | null;
    refusals: string[];
    created_at: string;
    updated_at: string;
  };
  absenteeism: {
    id: string;
    organization_id: string;
    date: string;
    class_id: string | null;
    present_count: number;
    absent_count: number;
    created_at: string;
    updated_at: string;
  };
  nutrition: {
    id: string;
    organization_id: string;
    date: string;
    breakfast_count: number;
    lunch_count: number;
    dinner_count: number;
    created_at: string;
    updated_at: string;
  };
  duty: {
    id: string;
    organization_id: string;
    date: string;
    teachers: string[];
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  audit_log: {
    id: string;
    organization_id: string;
    user_id: string | null;
    user_email: string | null;
    action: string;
    collection: string | null;
    target_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  };
  bell_schedule: {
    id: string;
    organization_id: string;
    period: number;
    start_time: string;
    end_time: string;
    created_at: string;
  };
};
