import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateInput } from '../components/DateInput';

afterEach(cleanup);

describe('DateInput', () => {
    it('сохраняет дату в ISO по blur', () => {
        const onChange = vi.fn();
        render(<DateInput aria-label="Дата" value="2026-09-10" onChange={onChange} showPickerButton={false} />);
        const input = screen.getByLabelText('Дата');
        fireEvent.change(input, { target: { value: '11.09.2026' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith('2026-09-11');
        expect(input).toHaveValue('11.09.2026');
    });

    it('сохраняет дату по Enter', () => {
        const onChange = vi.fn();
        render(<DateInput aria-label="Дата" value="" onChange={onChange} showPickerButton={false} />);
        const input = screen.getByLabelText('Дата');
        fireEvent.change(input, { target: { value: '1.2.2026' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('2026-02-01');
    });

    it('не откатывает и не сохраняет невалидную дату', () => {
        const onChange = vi.fn();
        render(<DateInput aria-label="Дата" value="2026-09-10" onChange={onChange} showPickerButton={false} />);
        const input = screen.getByLabelText('Дата');
        fireEvent.change(input, { target: { value: '30.02.2026' } });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveValue('30.02.2026');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('Введите существующую дату в формате ДД.ММ.ГГГГ');
    });

    it('снимает ошибку при продолжении ввода', () => {
        render(<DateInput aria-label="Дата" value="" onChange={() => undefined} showPickerButton={false} />);
        const input = screen.getByLabelText('Дата');
        fireEvent.change(input, { target: { value: '10.09' } });
        fireEvent.blur(input);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        fireEvent.change(input, { target: { value: '10.09.2026' } });
        expect(input).not.toHaveAttribute('aria-invalid');
    });
});
