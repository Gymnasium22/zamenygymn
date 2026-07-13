import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileShell } from './MobileShell';
import { PageId } from '../types';

const allPages: PageId[] = [
    'dashboard',
    'schedule',
    'schedule2',
    'substitutions',
    'duty',
    'nutrition',
    'absenteeism',
    'bells',
    'directory',
    'reports',
    'export',
    'admin',
    'calendar',
    'planner',
    'settings',
    'archive'
];

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        canViewPage: (id: PageId) => allPages.includes(id),
        logout: vi.fn(async () => undefined),
        user: { id: 'u1', email: 'admin@test.local' },
        organizationId: 'org1',
        organizations: [{ id: 'org1', name: 'Гимназия №22' }],
        isSuperAdmin: false,
        switchOrganization: vi.fn()
    })
}));

vi.mock('../context/DataContext', () => ({
    useStaticData: () => ({
        settings: { schoolName: 'Гимназия №22' }
    })
}));

describe('MobileShell', () => {
    beforeEach(() => {
        document.documentElement.classList.remove('app-mobile');
        document.body.classList.remove('app-mobile');
    });

    afterEach(() => {
        cleanup();
        document.documentElement.classList.remove('app-mobile');
        document.body.classList.remove('app-mobile');
    });

    it('монтирует app-mobile и нижнюю навигацию со всеми разделами в «Ещё»', () => {
        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <MobileShell onOpenAppearance={vi.fn()} onOpenCommand={vi.fn()}>
                    <div data-testid="page">content</div>
                </MobileShell>
            </MemoryRouter>
        );

        expect(document.documentElement.classList.contains('app-mobile')).toBe(true);
        expect(screen.getByTestId('page')).toBeInTheDocument();
        expect(screen.getByLabelText('Навигация')).toBeInTheDocument();
        expect(screen.getByText('Ещё')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Ещё'));
        // Полный набор разделов (16)
        expect(screen.getByText('Все разделы')).toBeInTheDocument();
        expect(screen.getByText('Настройки')).toBeInTheDocument();
        expect(screen.getByText('Справочники')).toBeInTheDocument();
        expect(screen.getByText('Дежурство')).toBeInTheDocument();
        expect(screen.getByText('Архив')).toBeInTheDocument();
        expect(screen.getByText('admin@test.local')).toBeInTheDocument();
    });

    it('вызывает onOpenCommand и onOpenAppearance', () => {
        const onOpenAppearance = vi.fn();
        const onOpenCommand = vi.fn();
        render(
            <MemoryRouter initialEntries={['/substitutions']}>
                <MobileShell onOpenAppearance={onOpenAppearance} onOpenCommand={onOpenCommand}>
                    <div />
                </MobileShell>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByLabelText('Поиск'));
        fireEvent.click(screen.getByLabelText('Оформление'));
        expect(onOpenCommand).toHaveBeenCalled();
        expect(onOpenAppearance).toHaveBeenCalled();
    });
});
