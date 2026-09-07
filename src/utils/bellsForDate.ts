import { Bell, BellPreset, CalendarEvent, Settings } from '../types';
import { formatDateISO } from './helpers';

export const isShortDayEvent = (ev: CalendarEvent) =>
    ev.type === 'short_day' || /сокращ/i.test(`${ev.title} ${ev.description || ''}`);

export function findShortDayPreset(settings?: Settings | null): BellPreset | undefined {
    const presets = settings?.bellPresets || [];
    if (settings?.shortDayBellPresetId) {
        const exact = presets.find((p) => p.id === settings.shortDayBellPresetId);
        if (exact) return exact;
    }
    return presets.find((p) => /сокращ/i.test(p.name));
}

export function isShortDayOn(date: Date | string, events: CalendarEvent[] | undefined): boolean {
    const iso = typeof date === 'string' ? date.slice(0, 10) : formatDateISO(date);
    return (events || []).some((e) => e.date === iso && isShortDayEvent(e));
}

/** Звонки на дату: при сокращённом дне в календаре берём соответствующий пресет. */
export function bellsForDate(
    date: Date | string,
    fallback: Bell[],
    settings?: Settings | null
): { bells: Bell[]; shortDay: boolean; presetName?: string } {
    const events = settings?.calendarEvents || [];
    const shortDay = isShortDayOn(date, events);
    if (!shortDay) return { bells: fallback, shortDay: false };
    const preset = findShortDayPreset(settings);
    if (preset?.bells?.length) {
        return { bells: preset.bells, shortDay: true, presetName: preset.name };
    }
    return { bells: fallback, shortDay: true };
}
