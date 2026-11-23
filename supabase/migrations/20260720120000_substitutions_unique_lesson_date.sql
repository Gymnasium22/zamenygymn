-- Замены: одна запись на (урок, дата, заменяющий учитель) в рамках организации.
--
-- ВАЖНО: при объединении с классом, разбитым на подгруппы, у одного урока законно
-- несколько заменяющих учителей — по строке на подгруппу. Поэтому учитель входит в ключ.
--
-- Скрипт идемпотентен: его можно запускать повторно, он не упадёт на уже существующем
-- индексе (42P07). Шаги разделены комментариями — при желании выполняйте по одному.

-- ---------------------------------------------------------------------------
-- ШАГ 1. Удалить старый индекс (если он есть) — по полному имени со схемой.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.substitutions_unique_lesson_date_idx;

-- Если индекс с таким именем лежит в другой схеме — снимаем и его.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'substitutions_unique_lesson_date_idx'
          AND c.relkind = 'i'
          AND n.nspname <> 'public'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schema_name, 'substitutions_unique_lesson_date_idx');
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ШАГ 2. Дедупликация существующих строк.
-- Оставляем самую свежую запись по updated_at, затем created_at, затем id.
-- Ключ включает replacement_teacher_id, поэтому строки объединения с подгруппами
-- (разные учителя на одном уроке) НЕ удаляются.
-- ---------------------------------------------------------------------------
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY organization_id, date, schedule_item_id, replacement_teacher_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
        ) AS rn
    FROM public.substitutions
    WHERE schedule_item_id IS NOT NULL
)
DELETE FROM public.substitutions s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- ШАГ 3. Уникальный индекс по новому ключу.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX substitutions_unique_lesson_date_idx
    ON public.substitutions (organization_id, date, schedule_item_id, replacement_teacher_id)
    WHERE schedule_item_id IS NOT NULL;

COMMENT ON INDEX public.substitutions_unique_lesson_date_idx IS
    'Одна замена на (организация, дата, урок, заменяющий учитель) — не даёт дублям «перетирать» назначенную замену, при этом объединение с классом на подгруппах сохраняет всех учителей.';

-- ---------------------------------------------------------------------------
-- ПРОВЕРКА (должна вернуть ровно один индекс с 4 колонками).
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'substitutions'
  AND indexname = 'substitutions_unique_lesson_date_idx';
