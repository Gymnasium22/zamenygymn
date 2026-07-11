-- Блокировка ввода питания после заданного времени (настраивается админом)
ALTER TABLE IF EXISTS settings
    ADD COLUMN IF NOT EXISTS nutrition_lock_enabled boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS nutrition_lock_time text DEFAULT '10:00';
