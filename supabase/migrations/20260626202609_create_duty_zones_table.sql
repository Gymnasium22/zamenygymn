
-- Create duty_zones table for Firebase migration
CREATE TABLE IF NOT EXISTS public.duty_zones (
    id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor TEXT,
    included_rooms TEXT[] DEFAULT '{}',
    "order" INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.duty_zones ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "duty_zones_select_org" ON public.duty_zones
    FOR SELECT USING (
        organization_id = (auth.jwt() ->> 'organization_id')::UUID
    );

CREATE POLICY "duty_zones_insert_admin" ON public.duty_zones
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

CREATE POLICY "duty_zones_update_admin" ON public.duty_zones
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );

CREATE POLICY "duty_zones_delete_admin" ON public.duty_zones
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
    );
;
