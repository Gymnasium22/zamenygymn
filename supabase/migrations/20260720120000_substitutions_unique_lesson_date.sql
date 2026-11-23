-- Замены: одна запись на пару (урок, дата) в рамках организации.
--
-- Раньше уникальности не было, и клиент мог оставить на сервере две записи для одного
-- и того же урока: старая и новая. После перезагрузки страница показывала то одну, то
-- другую, и часть назначенных замен выглядела как «не назначенные».
--
-- 1) Удаляем дубли, оставляя самую свежую запись (по updated_at, затем по created_at).
-- 2) Ставим частичный уникальный индекс (строки без привязки к уроку не ограничиваем —
--    они появляются, если урок удалили из расписания, и удалять их автоматически нельзя).

-- 1. Дедупликация существующих строк
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY organization_id, date, schedule_item_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
        ) AS rn
    FROM public.substitutions
    WHERE schedule_item_id IS NOT NULL
)
DELETE FROM public.substitutions s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- 2. Частичный уникальный индекс
DROP INDEX IF EXISTS public.substitutions_unique_lesson_date_idx;
CREATE UNIQUE INDEX substitutions_unique_lesson_date_idx
    ON public.substitutions (organization_id, date, schedule_item_id)
    WHERE schedule_item_id IS NOT NULL;

COMMENT ON INDEX public.substitutions_unique_lesson_date_idx IS
    'Одна замена на пару (организация, дата, урок) — не даёт дублям «перетирать» назначенную замену.';
