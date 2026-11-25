-- Публикация supabase_realtime оказалась пустой:
-- миграция 20260715180000_uuid_schema_reset пересоздала таблицы через
-- DROP TABLE ... CASCADE, а DROP TABLE молча выкидывает таблицу из публикации.
-- Без этих таблиц подписки postgres_changes (dbSupabase.ts) молча ничего не получают.
-- Возвращаем все таблицы, на которые подписывается приложение.

ALTER PUBLICATION supabase_realtime ADD TABLE
    public.settings,
    public.teachers,
    public.subjects,
    public.classes,
    public.rooms,
    public.schedule_items,
    public.substitutions,
    public.duty,
    public.nutrition,
    public.absenteeism,
    public.duty_zones,
    public.bell_schedule;
