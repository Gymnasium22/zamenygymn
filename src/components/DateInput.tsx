import { forwardRef, useEffect, useId, useState } from 'react';
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
}

/**
 * Date/time input for Belarus:
 * - date:  DD.MM.YYYY (stores YYYY-MM-DD)
 * - month: MM.YYYY     (stores YYYY-MM)
 * - time:  HH:MM 24h   (stores HH:MM)
 */
export const DateInput = forwardRef(function DateInput(
    { value, onChange, type = 'date', className = '', placeholder, ...props }: DateInputProps,
    ref: ForwardedRef<HTMLInputElement>
) {
    const pickerId = useId();
    const [text, setText] = useState(() => toDisplay(type, value));

    useEffect(() => {
        setText(toDisplay(type, value));
    }, [value, type]);

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
                // revert invalid
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
        // time
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

    return (
        <div className="relative inline-flex w-full items-center gap-1">
            <input
                {...props}
                ref={ref}
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
                className={className}
            />
            {/* Optional native picker for date/month/time — still emits ISO/HH:MM */}
            <div className="relative shrink-0">
                <span
                    className="flex h-full min-h-[2.5rem] items-center rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 text-slate-500"
                    title="Выбрать из календаря"
                    aria-hidden
                >
                    {type === 'time' ? '🕒' : '📅'}
                </span>
                <input
                    id={pickerId}
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
                        type === 'date' ? 'Выбор даты' : type === 'month' ? 'Выбор месяца' : 'Выбор времени'
                    }
                />
            </div>
        </div>
    );
});

function toDisplay(type: 'date' | 'month' | 'time', value: string): string {
    if (!value) return '';
    if (type === 'date') return formatDateEuropean(value);
    if (type === 'month') return formatMonthEuropean(value);
    return formatTimeHM(value);
}
