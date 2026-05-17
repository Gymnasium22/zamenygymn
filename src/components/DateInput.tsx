import { forwardRef } from 'react';
import type { ChangeEvent, ForwardedRef, InputHTMLAttributes } from 'react';

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    value: string;
    onChange: (value: string) => void;
    type?: 'date' | 'month' | 'time';
    locale?: string;
}

export const DateInput = forwardRef(function DateInput(
    {
        value,
        onChange,
        type = 'date',
        locale = 'ru-RU',
        className = '',
        ...props
    }: DateInputProps,
    ref: ForwardedRef<HTMLInputElement>
) {
    return (
        <input
            {...props}
            ref={ref}
            type={type}
            lang={locale}
            inputMode="numeric"
            value={value}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            className={className}
        />
    );
});
