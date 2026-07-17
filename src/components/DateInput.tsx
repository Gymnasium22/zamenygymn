import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEvent, ForwardedRef, InputHTMLAttributes } from 'react';
import {
    formatDateEuropean,
    formatMonthEuropean,
    formatTimeHM,
    isValidDateString,
    isValidMonthString,
    toDateISO,
    toMonthISO
} from '../utils/helpers';

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    /** Storage value: YYYY-MM-DD | YYYY-MM | HH:MM */
    value: string;
    /** Emits storage format (ISO date / month / HH:MM) */
    onChange: (value: string) => void;
    type?: 'date' | 'month' | 'time';
    /** @deprecated display is always Belarus-style; kept for call-site compat */
    locale?: string;
    /**
     * Show built-in calendar/clock picker affordance (icon inside the field).
     * Default true. Set false when the parent already has its own picker control.
     */
    showPickerButton?: boolean;
}

export type DateInputHandle = HTMLInputElement & {
    /** Opens the native date/month/time picker when available */
    showPicker: () => void;
};

/**
 * Date/time input for Belarus:
 * - date:  DD.MM.YYYY (stores YYYY-MM-DD)
 * - month: MM.YYYY     (stores YYYY-MM)
 * - time:  HH:MM 24h   (stores HH:MM)
 *
 * One compact field: typed display + optional icon-in-field native picker.
 * Does NOT stretch to full width (avoids breaking desktop headers).
 */
export const DateInput = forwardRef(function DateInput(
    {
        value,
        onChange,
        type = 'date',
        className = '',
        placeholder,
        showPickerButton = true,
        ...props
    }: DateInputProps,
    ref: ForwardedRef<HTMLInputElement>
) {
    const textRef = useRef<HTMLInputElement>(null);
    const nativeRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState(() => toDisplay(type, value));

    useEffect(() => {
        setText(toDisplay(type, value));
    }, [value, type]);

    useImperativeHandle(ref, () => {
        const el = textRef.current as DateInputHandle | null;
        if (!el) return null as unknown as HTMLInputElement;
        el.showPicker = () => {
            const native = nativeRef.current;
            if (native && typeof native.showPicker === 'function') {
                try {
                    native.showPicker();
                } catch {
                    native.click();
                }
            }
        };
        return el;
    });

    const commit = (raw: string) => {
        if (type === 'date') {
            const iso = toDateISO(raw);
            if (!raw.trim()) {
                onChange('');
                setText('');
                return;
            }
            if (iso && isValidDateString(iso)) {
                onChange(iso);
                setText(formatDateEuropean(iso));
            } else {
                setText(toDisplay(type, value));
            }
            return;
        }
        if (type === 'month') {
            const iso = toMonthISO(raw);
            if (!raw.trim()) {
                onChange('');
                setText('');
                return;
            }
            if (iso && isValidMonthString(iso)) {
                onChange(iso);
                setText(formatMonthEuropean(iso));
            } else {
                setText(toDisplay(type, value));
            }
            return;
        }
        const hm = formatTimeHM(raw);
        if (!raw.trim()) {
            onChange('');
            setText('');
            return;
        }
        if (hm && /^\d{2}:\d{2}$/.test(hm)) {
            onChange(hm);
            setText(hm);
        } else {
            setText(toDisplay(type, value));
        }
    };

    const ph =
        placeholder ||
        (type === 'date' ? 'ДД.ММ.ГГГГ' : type === 'month' ? 'ММ.ГГГГ' : 'ЧЧ:ММ');

    const maxLen = type === 'date' ? 10 : type === 'month' ? 7 : 5;

    // Keep width of the field itself; never force full parent width (that stacked desktop headers).
    const wantsFullWidth = /\bw-full\b/.test(className);
    const inputClass = [
        className,
        showPickerButton ? 'pr-9' : '',
        // if caller didn't set width, use a sensible compact size
        !/\bw-/.test(className) && !/\bmin-w-/.test(className)
            ? type === 'date'
                ? 'w-[9.75rem]'
                : type === 'month'
                  ? 'w-[7.5rem]'
                  : 'w-[5.5rem]'
            : ''
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={`relative inline-flex items-center shrink-0 ${wantsFullWidth ? 'w-full' : ''}`}>
            <input
                {...props}
                ref={textRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder={ph}
                maxLength={maxLen}
                value={text}
                title={
                    type === 'date'
                        ? 'Формат: ДД.ММ.ГГГГ'
                        : type === 'month'
                          ? 'Формат: ММ.ГГГГ'
                          : 'Формат: ЧЧ:ММ (24 часа)'
                }
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setText(e.target.value);
                }}
                onBlur={() => commit(text)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit(text);
                        (e.target as HTMLInputElement).blur();
                    }
                }}
                className={inputClass}
            />
            {showPickerButton && (
                <div
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 dark:text-slate-500"
                    title={type === 'time' ? 'Выбрать время' : 'Выбрать из календаря'}
                >
                    <PickerGlyph type={type} />
                    <input
                        ref={nativeRef}
                        type={type}
                        lang="ru-BY"
                        value={value || ''}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (type === 'time') {
                                onChange(formatTimeHM(v));
                                setText(formatTimeHM(v));
                            } else if (type === 'month') {
                                onChange(v);
                                setText(formatMonthEuropean(v));
                            } else {
                                onChange(v);
                                setText(formatDateEuropean(v));
                            }
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        tabIndex={-1}
                        aria-label={
                            type === 'date'
                                ? 'Выбор даты'
                                : type === 'month'
                                  ? 'Выбор месяца'
                                  : 'Выбор времени'
                        }
                    />
                </div>
            )}
        </div>
    );
});

function PickerGlyph({ type }: { type: 'date' | 'month' | 'time' }) {
    if (type === 'time') {
        return (
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="pointer-events-none"
            >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
        );
    }
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="pointer-events-none"
        >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}

function toDisplay(type: 'date' | 'month' | 'time', value: string): string {
    if (!value) return '';
    if (type === 'date') return formatDateEuropean(value);
    if (type === 'month') return formatMonthEuropean(value);
    return formatTimeHM(value);
}
