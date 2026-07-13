-- =============================================================================
-- Миграция: fix_schema_for_firebase_migration
-- Цель: Пересоздать таблицы с правильными типами (text ID вместо uuid)
--       для совместимости с Firebase-данными
-- =============================================================================

-- ============================================
-- 1. DROP старых таблиц (CASCADE удалит FK constraints)
-- ============================================
DROP TABLE IF EXISTS public.bell_schedule CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.duty CASCADE;
DROP TABLE IF EXISTS public.nutrition CASCADE;
DROP TABLE IF EXISTS public.absenteeism CASCADE;
DROP TABLE IF EXISTS public.substitutions CASCADE;
DROP TABLE IF EXISTS public.schedule_items CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;
DROP TABLE IF EXISTS public.teachers CASCADE;

-- ============================================
-- 2. ALTER profiles (teacher_id uuid → text)
-- ============================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN teacher_id TYPE text;

-- ============================================
-- 3. CREATE справочники (business tables)
-- ============================================

CREATE TABLE public.teachers (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject_ids TEXT[] DEFAULT '{}',
    shifts TEXT[] DEFAULT '{}',
    max_periods INTEGER DEFAULT 8,
    class_teacher_of TEXT,
    unavailable_dates TEXT[] DEFAULT '{}',
    absence_reasons JSONB DEFAULT '{}',
    birth_date TEXT,
    telegram_chat_id TEXT,
    "order" INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.classes (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    shift TEXT NOT NULL,
    students_count INTEGER DEFAULT 0,
    grade TEXT,
    "order" INTEGER,
    exclude_from_reports BOOLEAN DEFAULT FALSE,
    class_teacher_id TEXT REFERENCES public.teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subjects (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    difficulty INTEGER,
    required_room_type TEXT,
    "order" INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.rooms (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor INTEGER,
    capacity INTEGER,
    "type" TEXT,
    "order" INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. CREATE schedule и операционные таблицы
-- ============================================

CREATE TABLE public.schedule_items (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    day TEXT NOT NULL CHECK (day IN ('Пн', 'Вт', 'Ср', 'Чт', 'Пт')),
    period INTEGER NOT NULL,
    shift TEXT NOT NULL,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    subject_id TEXT REFERENCES public.subjects(id) ON DELETE SET NULL,
    teacher_id TEXT REFERENCES public.teachers(id) ON DELETE SET NULL,
    room_id TEXT,
    direction TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.substitutions (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    schedule_item_id TEXT REFERENCES public.schedule_items(id) ON DELETE SET NULL,
    original_teacher_id TEXT REFERENCES public.teachers(id) ON DELETE SET NULL,
    replacement_teacher_id TEXT,
    replacement_room_id TEXT,
    replacement_class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    replacement_subject_id TEXT REFERENCES public.subjects(id) ON DELETE SET NULL,
    is_merger BOOLEAN DEFAULT FALSE,
    lesson_absence_reason TEXT,
    refusals TEXT[] DEFAULT '{}',
    comment TEXT,
    day_comment TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.duty (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    shift TEXT NOT NULL,
    zone_id TEXT,
    teacher_id TEXT REFERENCES public.teachers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.nutrition (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    breakfast_count INTEGER DEFAULT 0,
    lunch_count INTEGER DEFAULT 0,
    dinner_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    benefit_count INTEGER DEFAULT 0,
    regular_count INTEGER DEFAULT 0,
    entered_by TEXT,
    entered_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.absenteeism (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    absences JSONB DEFAULT '[]',
    present_count INTEGER DEFAULT 0,
    absent_count INTEGER DEFAULT 0,
    entered_by TEXT,
    entered_at TEXT,
    updated_at TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. CREATE settings, audit_log, bell_schedule
-- ============================================

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
    periods INTEGER DEFAULT 8,
    shift1_periods INTEGER DEFAULT 8,
    shift2_periods INTEGER DEFAULT 8,
    max_periods INTEGER DEFAULT 8,
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
    is_schedule_locked BOOLEAN DEFAULT FALSE,
    allow_teacher_edit BOOLEAN DEFAULT FALSE,
    auto_backup BOOLEAN DEFAULT FALSE,
    backup_time TEXT,
    current_year INTEGER,
    director_name TEXT,
    weather_api_key TEXT,
    google_apps_script_url TEXT,
    secretary_name TEXT,
    school_name TEXT,
    union_chair_name TEXT,
    telegram_bot_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.bell_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. Восстановить RLS политики (изначально RLS выключен для загрузки данных)
-- ============================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absenteeism ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_schedule ENABLE ROW LEVEL SECURITY;

-- Политики для organizations (admin может всё, остальные — только свою)
DROP POLICY IF EXISTS org_select ON public.organizations;
DROP POLICY IF EXISTS org_update ON public.organizations;
DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_select ON public.organizations FOR SELECT USING (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY org_update ON public.organizations FOR UPDATE USING (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY org_insert ON public.organizations FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Политики для profiles (пользователь видит свой, admin — все)
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (
    id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (
    id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY profiles_delete ON public.profiles FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Политики для business tables (все пользователи организации)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('teachers','classes','subjects','rooms','schedule_items','substitutions','duty','nutrition','absenteeism','settings','bell_schedule')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
        
        EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (
            organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'')
        )', t, t);
        
        EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT WITH CHECK (
            organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'')
        )', t, t);
        
        EXECUTE format('CREATE POLICY %I_update ON public.%I FOR UPDATE USING (
            organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'')
        )', t, t);
        
        EXECUTE format('CREATE POLICY %I_delete ON public.%I FOR DELETE USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'')
        )', t, t);
    END LOOP;
END $$;

-- Политики для audit_log (только admin)
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
;
