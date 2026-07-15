-- =============================================================================
-- UUID schema reset after year close + directory export.
-- Drops business tables (data already archived by user / JSON backup) and
-- recreates them with UUID PKs/FKs, NOT NULL timestamps, academic_year.
-- Preserves: auth.users, organizations, profiles (teacher_id cleared).
-- =============================================================================

-- 0) Detach profiles from old TEXT teacher ids
UPDATE public.profiles SET teacher_id = NULL WHERE teacher_id IS NOT NULL;

-- 1) Drop business tables (CASCADE removes FKs/policies)
DROP TABLE IF EXISTS public.planner_tasks CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.bell_schedule CASCADE;
DROP TABLE IF EXISTS public.substitutions CASCADE;
DROP TABLE IF EXISTS public.schedule_items CASCADE;
DROP TABLE IF EXISTS public.duty CASCADE;
DROP TABLE IF EXISTS public.nutrition CASCADE;
DROP TABLE IF EXISTS public.absenteeism CASCADE;
DROP TABLE IF EXISTS public.duty_zones CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.teachers CASCADE;

-- 2) profiles.teacher_id → UUID (FK added after teachers exists)
ALTER TABLE public.profiles
    ALTER COLUMN teacher_id TYPE uuid USING NULL;

-- 3) updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 4) Reference tables (UUID)
CREATE TABLE public.teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject_ids UUID[] NOT NULL DEFAULT '{}',
    shifts TEXT[] NOT NULL DEFAULT '{}',
    max_periods INTEGER DEFAULT 8,
    class_teacher_of UUID,
    unavailable_dates TEXT[] NOT NULL DEFAULT '{}',
    absence_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
    birth_date TEXT,
    telegram_chat_id TEXT,
    "order" INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    difficulty INTEGER,
    required_room_type TEXT,
    "order" INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor INTEGER,
    capacity INTEGER,
    "type" TEXT,
    "order" INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    shift TEXT NOT NULL,
    students_count INTEGER DEFAULT 0,
    grade TEXT,
    "order" INTEGER,
    exclude_from_reports BOOLEAN NOT NULL DEFAULT FALSE,
    class_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- class_teacher_of → classes (after classes exist)
ALTER TABLE public.teachers
    ADD CONSTRAINT teachers_class_teacher_of_fkey
    FOREIGN KEY (class_teacher_of) REFERENCES public.classes(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL;

CREATE TABLE public.duty_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor TEXT,
    description TEXT,
    included_rooms UUID[] NOT NULL DEFAULT '{}',
    "order" INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Operational tables
CREATE TABLE public.schedule_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    day TEXT NOT NULL CHECK (day IN ('Пн', 'Вт', 'Ср', 'Чт', 'Пт')),
    period INTEGER NOT NULL,
    shift TEXT NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    direction TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    date TEXT NOT NULL,
    schedule_item_id UUID REFERENCES public.schedule_items(id) ON DELETE SET NULL,
    original_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    replacement_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    replacement_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    replacement_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    replacement_subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    is_merger BOOLEAN NOT NULL DEFAULT FALSE,
    lesson_absence_reason TEXT,
    refusals TEXT[] NOT NULL DEFAULT '{}',
    comment TEXT,
    day_comment TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.duty (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    day TEXT NOT NULL,
    shift TEXT NOT NULL,
    zone_id UUID REFERENCES public.duty_zones(id) ON DELETE SET NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.nutrition (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    date TEXT NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    breakfast_count INTEGER NOT NULL DEFAULT 0,
    lunch_count INTEGER NOT NULL DEFAULT 0,
    dinner_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    benefit_count INTEGER NOT NULL DEFAULT 0,
    regular_count INTEGER NOT NULL DEFAULT 0,
    entered_by TEXT,
    entered_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.absenteeism (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    academic_year INTEGER NOT NULL,
    date TEXT NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    absences JSONB NOT NULL DEFAULT '[]'::jsonb,
    present_count INTEGER NOT NULL DEFAULT 0,
    absent_count INTEGER NOT NULL DEFAULT 0,
    entered_by TEXT,
    entered_at TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bell_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    shift TEXT,
    day TEXT DEFAULT 'default',
    cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    school_year TEXT,
    semester_start_1 DATE,
    semester_end_1 DATE,
    semester_start_2 DATE,
    semester_end_2 DATE,
    shift1_start TEXT,
    shift1_end TEXT,
    shift2_start TEXT,
    shift2_end TEXT,
    periods INTEGER NOT NULL DEFAULT 8,
    shift1_periods INTEGER NOT NULL DEFAULT 8,
    shift2_periods INTEGER NOT NULL DEFAULT 8,
    max_periods INTEGER NOT NULL DEFAULT 8,
    telegram_token TEXT,
    public_schedule_id TEXT,
    feedback_chat_id TEXT,
    admin_telegram_chat_id TEXT,
    weather_city TEXT,
    bell_presets JSONB,
    semester_config JSONB,
    telegram_templates JSONB,
    admin_announcement JSONB,
    substitution_day_comments JSONB,
    dashboard_widget_access JSONB,
    is_schedule_locked BOOLEAN NOT NULL DEFAULT FALSE,
    allow_teacher_edit BOOLEAN NOT NULL DEFAULT FALSE,
    auto_backup BOOLEAN NOT NULL DEFAULT FALSE,
    backup_time TEXT,
    current_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
    director_name TEXT,
    weather_api_key TEXT,
    google_apps_script_url TEXT,
    secretary_name TEXT,
    school_name TEXT,
    union_chair_name TEXT,
    telegram_bot_name TEXT,
    calendar_events JSONB NOT NULL DEFAULT '[]'::jsonb,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
    nutrition_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    nutrition_lock_time TEXT NOT NULL DEFAULT '10:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID,
    user_email TEXT,
    action TEXT NOT NULL,
    collection TEXT,
    target_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.planner_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    deadline DATE,
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in-progress', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Indexes
CREATE INDEX teachers_org_idx ON public.teachers (organization_id);
CREATE INDEX subjects_org_idx ON public.subjects (organization_id);
CREATE INDEX classes_org_idx ON public.classes (organization_id);
CREATE INDEX rooms_org_idx ON public.rooms (organization_id);
CREATE INDEX duty_zones_org_idx ON public.duty_zones (organization_id);
CREATE INDEX schedule_items_org_semester_idx ON public.schedule_items (organization_id, semester);
CREATE INDEX schedule_items_org_year_idx ON public.schedule_items (organization_id, academic_year);
CREATE INDEX substitutions_org_date_idx ON public.substitutions (organization_id, date);
CREATE INDEX substitutions_org_year_idx ON public.substitutions (organization_id, academic_year);
CREATE INDEX duty_org_idx ON public.duty (organization_id, academic_year);
CREATE INDEX nutrition_org_date_idx ON public.nutrition (organization_id, date);
CREATE INDEX absenteeism_org_date_idx ON public.absenteeism (organization_id, date);
CREATE INDEX bell_schedule_org_idx ON public.bell_schedule (organization_id);
CREATE INDEX planner_tasks_org_idx ON public.planner_tasks (organization_id);
CREATE INDEX planner_tasks_org_status_idx ON public.planner_tasks (organization_id, status);
CREATE INDEX audit_log_org_idx ON public.audit_log (organization_id, created_at DESC);

-- 7) updated_at triggers
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'teachers','subjects','rooms','classes','duty_zones',
        'schedule_items','substitutions','duty','nutrition','absenteeism',
        'bell_schedule','settings','planner_tasks'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            t
        );
    END LOOP;
END $$;

-- 8) Seed settings for every organization
INSERT INTO public.settings (organization_id, school_name, current_year, periods, shift1_periods, shift2_periods, max_periods)
SELECT o.id, o.name, EXTRACT(YEAR FROM now())::int, 8, 8, 8, 8
FROM public.organizations o;

-- 9) RLS
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absenteeism ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_tasks ENABLE ROW LEVEL SECURITY;

-- Re-apply org-scoped policies (same model as rls_policies.sql)
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'teachers','subjects','classes','rooms'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);

        EXECUTE format(
            'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
             USING (organization_id = get_user_org_id() OR is_superadmin())', t, t);
        EXECUTE format(
            'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated
             WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())', t, t);
        EXECUTE format(
            'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated
             USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
             WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())', t, t);
        EXECUTE format(
            'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated
             USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())', t, t);
    END LOOP;

    FOREACH t IN ARRAY ARRAY[
        'duty_zones','schedule_items','substitutions','duty','nutrition',
        'absenteeism','bell_schedule','settings','audit_log','planner_tasks'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);

        EXECUTE format(
            'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
             USING (organization_id = get_user_org_id() OR is_superadmin())', t, t);
        EXECUTE format(
            'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated
             WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())', t, t);
        EXECUTE format(
            'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated
             USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
             WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())', t, t);
        EXECUTE format(
            'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated
             USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())', t, t);
    END LOOP;
END $$;
