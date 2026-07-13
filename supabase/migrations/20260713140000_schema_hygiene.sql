-- Schema hygiene after Firebase→Supabase migration.
-- Additive only: fill gaps, restore useful FKs, seed missing org settings.

-- 1) duty_zones: app uses description
ALTER TABLE public.duty_zones
    ADD COLUMN IF NOT EXISTS description text;

-- 2) Restore profiles → auth.users FK (dropped during Firebase migration rework)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_id_fkey'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_id_fkey
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3) duty.zone_id → duty_zones
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'duty_zone_id_fkey'
          AND conrelid = 'public.duty'::regclass
    ) THEN
        -- null out broken refs before adding FK
        UPDATE public.duty d
        SET zone_id = NULL
        WHERE d.zone_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.duty_zones z WHERE z.id = d.zone_id);

        ALTER TABLE public.duty
            ADD CONSTRAINT duty_zone_id_fkey
            FOREIGN KEY (zone_id) REFERENCES public.duty_zones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4) schedule_items.room_id → rooms
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'schedule_items_room_id_fkey'
          AND conrelid = 'public.schedule_items'::regclass
    ) THEN
        UPDATE public.schedule_items s
        SET room_id = NULL
        WHERE s.room_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = s.room_id);

        ALTER TABLE public.schedule_items
            ADD CONSTRAINT schedule_items_room_id_fkey
            FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5) Ensure every organization has a settings row
INSERT INTO public.settings (organization_id, school_name, current_year, periods, shift1_periods, shift2_periods, max_periods)
SELECT o.id, o.name, EXTRACT(YEAR FROM now())::int, 8, 8, 8, 8
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.settings s WHERE s.organization_id = o.id
);

-- 6) Index for common org filters (if missing)
CREATE INDEX IF NOT EXISTS schedule_items_org_semester_idx
    ON public.schedule_items (organization_id, semester);
CREATE INDEX IF NOT EXISTS substitutions_org_date_idx
    ON public.substitutions (organization_id, date);
