-- Add columns required by the latest app version to the settings table.
-- Run this in the Supabase SQL Editor.

ALTER TABLE IF EXISTS settings
    ADD COLUMN IF NOT EXISTS calendar_events jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS session_timeout_minutes integer DEFAULT 30;
