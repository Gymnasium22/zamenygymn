-- Смена кабинета хранится в той же таблице substitutions.
-- Отдельные колонки нужны, чтобы замена кабинета переживала перезагрузку
-- и могла стоять рядом с заменой учителя на том же уроке.
-- sub_type входит в уникальный ключ: строка type=room не затирает строку замены учителя
-- с тем же replacement_teacher_id.

ALTER TABLE public.substitutions
    ADD COLUMN IF NOT EXISTS sub_type TEXT,
    ADD COLUMN IF NOT EXISTS original_room_id TEXT,
    ADD COLUMN IF NOT EXISTS room_change_reason TEXT,
    ADD COLUMN IF NOT EXISTS room_change_scope TEXT,
    ADD COLUMN IF NOT EXISTS room_change_source TEXT,
    ADD COLUMN IF NOT EXISTS room_conflict BOOLEAN NOT NULL DEFAULT FALSE;

-- Старые строки без типа. Не трогаем строки, где sub_type уже заполнен.
UPDATE public.substitutions
SET sub_type = CASE
    WHEN replacement_teacher_id = 'cancelled' THEN 'cancel'
    WHEN is_merger IS TRUE THEN 'merge'
    WHEN replacement_room_id IS NOT NULL
         AND replacement_teacher_id IS NOT DISTINCT FROM original_teacher_id::text
         AND replacement_class_id IS NULL
        THEN 'room'
    ELSE 'teacher'
END
WHERE sub_type IS NULL;

DROP INDEX IF EXISTS public.substitutions_unique_lesson_date_idx;

CREATE UNIQUE INDEX substitutions_unique_lesson_date_idx
    ON public.substitutions (
        organization_id,
        date,
        schedule_item_id,
        replacement_teacher_id,
        COALESCE(sub_type, '')
    )
    WHERE schedule_item_id IS NOT NULL;

COMMENT ON COLUMN public.substitutions.sub_type IS
    'teacher | room | cancel | merge. Пусто — старые записи до смены кабинета.';
