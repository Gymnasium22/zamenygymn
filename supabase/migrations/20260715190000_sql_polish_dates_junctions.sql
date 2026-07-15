-- =============================================================================
-- SQL polish for portable Postgres:
-- 1) native DATE/TIME where the app uses ISO dates / HH:MM
-- 2) teacher_subjects junction (drop teachers.subject_ids array)
-- 3) legacy cleanup + fix replacement_teacher_id for special statuses
-- =============================================================================

-- 1) DATE / TIME columns (tables empty after year close — safe casts)
ALTER TABLE public.substitutions
    ALTER COLUMN date TYPE date USING date::date;

ALTER TABLE public.nutrition
    ALTER COLUMN date TYPE date USING date::date;

ALTER TABLE public.absenteeism
    ALTER COLUMN date TYPE date USING date::date;

ALTER TABLE public.teachers
    ALTER COLUMN birth_date TYPE date USING NULLIF(birth_date, '')::date;

ALTER TABLE public.bell_schedule
    ALTER COLUMN start_time TYPE time USING start_time::time,
    ALTER COLUMN end_time TYPE time USING end_time::time;

-- optional: settings times as text HH:MM stay (flexible); only drop dead cols below

-- 2) duty_zones.included_rooms: app stores room *numbers/names* as text, not UUIDs
ALTER TABLE public.duty_zones
    DROP COLUMN IF EXISTS included_rooms;
ALTER TABLE public.duty_zones
    ADD COLUMN included_rooms text[] NOT NULL DEFAULT '{}';

-- 3) substitutions.replacement_teacher_id must accept 'conducted' | 'cancelled' | uuid
ALTER TABLE public.substitutions
    DROP CONSTRAINT IF EXISTS substitutions_replacement_teacher_id_fkey;
ALTER TABLE public.substitutions
    ALTER COLUMN replacement_teacher_id TYPE text USING replacement_teacher_id::text;

-- 4) teacher ↔ subject M:N
CREATE TABLE public.teacher_subjects (
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (teacher_id, subject_id)
);

CREATE INDEX teacher_subjects_subject_idx ON public.teacher_subjects (subject_id);
CREATE INDEX teacher_subjects_org_idx ON public.teacher_subjects (organization_id);

ALTER TABLE public.teachers DROP COLUMN IF EXISTS subject_ids;

ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_subjects_select ON public.teacher_subjects;
DROP POLICY IF EXISTS teacher_subjects_insert ON public.teacher_subjects;
DROP POLICY IF EXISTS teacher_subjects_update ON public.teacher_subjects;
DROP POLICY IF EXISTS teacher_subjects_delete ON public.teacher_subjects;

CREATE POLICY teacher_subjects_select ON public.teacher_subjects
    FOR SELECT TO authenticated
    USING (organization_id = get_user_org_id() OR is_superadmin());

CREATE POLICY teacher_subjects_insert ON public.teacher_subjects
    FOR INSERT TO authenticated
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY teacher_subjects_update ON public.teacher_subjects
    FOR UPDATE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin())
    WITH CHECK ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

CREATE POLICY teacher_subjects_delete ON public.teacher_subjects
    FOR DELETE TO authenticated
    USING ((organization_id = get_user_org_id() AND is_admin()) OR is_superadmin());

-- 5) Legacy cleanup
ALTER TABLE public.settings DROP COLUMN IF EXISTS public_schedule_id;

ALTER TABLE public.organizations
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.profiles SET created_at = COALESCE(created_at, now()), updated_at = COALESCE(updated_at, now());
ALTER TABLE public.profiles
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL;

-- profiles.organization_id stays nullable (superadmin without org)
