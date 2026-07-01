-- Миграция: добавление поддержки superadmin и единообразных RLS-политик по организациям.
-- Выполнить в Supabase SQL Editor.

-- 1. Вспомогательные функции -------------------------------------------------

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    );
END;
$$;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'superadmin'
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (SELECT organization_id FROM profiles WHERE id = auth.uid());
END;
$$;

-- 2. Небольшие доработки схемы -----------------------------------------------

-- Для возможности блокировать организации
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS type text DEFAULT 'gymnasium',
    ADD COLUMN IF NOT EXISTS city text,
    ADD COLUMN IF NOT EXISTS address text,
    ADD COLUMN IF NOT EXISTS contact_email text,
    ADD COLUMN IF NOT EXISTS logo_url text;

-- Расширяем допустимые роли (добавляем superadmin)
ALTER TABLE profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'teacher', 'canteen', 'superadmin'));

-- Одна запись настроек на организацию
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'settings_organization_unique'
          AND conrelid = 'settings'::regclass
    ) THEN
        ALTER TABLE settings
            ADD CONSTRAINT settings_organization_unique UNIQUE (organization_id);
    END IF;
END $$;

-- 3. Включаем RLS на всех таблицах -------------------------------------------

ALTER TABLE IF EXISTS absenteeism    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bell_schedule  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS classes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS duty           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS duty_zones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS nutrition      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subjects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS substitutions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teachers       ENABLE ROW LEVEL SECURITY;

-- 4. Удаляем ВСЕ существующие политики на этих таблицах ----------------------
--    (чтобы избавиться от хардкодных политик с UUID Гимназии №22 и дублей)

DO $$
DECLARE
    tbl text;
    pol record;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'absenteeism', 'audit_log', 'bell_schedule', 'classes', 'duty',
            'duty_zones', 'nutrition', 'organizations', 'profiles', 'rooms',
            'schedule_items', 'settings', 'subjects', 'substitutions', 'teachers'
        ])
    LOOP
        FOR pol IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, tbl);
        END LOOP;
    END LOOP;
END $$;

-- 5. Создаём единообразные политики ------------------------------------------

-- profiles -------------------------------------------------------------------
CREATE POLICY profiles_select ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY profiles_insert ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        (id = auth.uid() AND organization_id = get_user_org_id())
        OR (is_admin() AND organization_id = get_user_org_id())
        OR is_superadmin()
    );

CREATE POLICY profiles_update ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR (organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK (id = auth.uid() OR (organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY profiles_delete ON profiles
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

-- organizations --------------------------------------------------------------
CREATE POLICY organizations_select ON organizations
    FOR SELECT TO authenticated
    USING (id = get_user_org_id() OR is_superadmin());

CREATE POLICY organizations_insert ON organizations
    FOR INSERT TO authenticated
    WITH CHECK (is_superadmin());

CREATE POLICY organizations_update ON organizations
    FOR UPDATE TO authenticated
    USING (id = get_user_org_id() OR is_superadmin())
    WITH CHECK (id = get_user_org_id() OR is_superadmin());

CREATE POLICY organizations_delete ON organizations
    FOR DELETE TO authenticated
    USING (is_superadmin());

-- Справочники: чтение для своей организации + общих записей (org IS NULL),
-- запись только для admin/superadmin своей организации.
-- teachers, subjects, classes, rooms

CREATE POLICY teachers_select ON teachers
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR organization_id IS NULL OR is_superadmin());

CREATE POLICY teachers_insert ON teachers
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY teachers_update ON teachers
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY teachers_delete ON teachers
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY subjects_select ON subjects
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR organization_id IS NULL OR is_superadmin());

CREATE POLICY subjects_insert ON subjects
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY subjects_update ON subjects
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY subjects_delete ON subjects
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY classes_select ON classes
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR organization_id IS NULL OR is_superadmin());

CREATE POLICY classes_insert ON classes
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY classes_update ON classes
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY classes_delete ON classes
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY rooms_select ON rooms
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR organization_id IS NULL OR is_superadmin());

CREATE POLICY rooms_insert ON rooms
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY rooms_update ON rooms
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY rooms_delete ON rooms
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

-- Операционные таблицы: чтение для своей организации, запись для admin/superadmin.
-- schedule_items, substitutions, duty, duty_zones, nutrition, absenteeism, bell_schedule, settings, audit_log

CREATE POLICY schedule_items_select ON schedule_items
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY schedule_items_insert ON schedule_items
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY schedule_items_update ON schedule_items
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY schedule_items_delete ON schedule_items
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY substitutions_select ON substitutions
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY substitutions_insert ON substitutions
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY substitutions_update ON substitutions
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY substitutions_delete ON substitutions
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY duty_select ON duty
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY duty_insert ON duty
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY duty_update ON duty
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY duty_delete ON duty
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY duty_zones_select ON duty_zones
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY duty_zones_insert ON duty_zones
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY duty_zones_update ON duty_zones
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY duty_zones_delete ON duty_zones
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY nutrition_select ON nutrition
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY nutrition_insert ON nutrition
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY nutrition_update ON nutrition
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY nutrition_delete ON nutrition
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY absenteeism_select ON absenteeism
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY absenteeism_insert ON absenteeism
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY absenteeism_update ON absenteeism
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY absenteeism_delete ON absenteeism
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY bell_schedule_select ON bell_schedule
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY bell_schedule_insert ON bell_schedule
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY bell_schedule_update ON bell_schedule
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY bell_schedule_delete ON bell_schedule
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY settings_select ON settings
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY settings_insert ON settings
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY settings_update ON settings
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY settings_delete ON settings
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY audit_log_select ON audit_log
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY audit_log_insert ON audit_log
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY audit_log_update ON audit_log
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY audit_log_delete ON audit_log
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());
