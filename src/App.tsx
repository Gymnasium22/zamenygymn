import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, NavLink, useSearchParams, useLocation, useOutlet } from 'react-router-dom';
import useMedia from 'use-media';
import { DataProvider, useStaticData, StaticDataProvider, ScheduleDataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Icon } from './components/Icons';
import { StatusWidget, BottomNavigation, ToastProvider, CommandPalette, Modal } from './components/UI';
import { AnnouncementModal } from './components/AnnouncementModal';
import { PullToRefresh } from './components/PullToRefresh';
import { useIsMobileApp } from './hooks/useIsMobileApp';
import { DashboardPage } from './pages/Dashboard';
import { SchedulePage } from './pages/Schedule';
import { SubstitutionsPage } from './pages/Substitutions';

// Lazy loaded pages for performance
const DirectoryPage = React.lazy(() => import('./pages/Directory').then(m => ({ default: m.DirectoryPage })));
const BellsPage = React.lazy(() => import('./pages/Bells').then(m => ({ default: m.BellsPage })));
const AdminPage = React.lazy(() => import('./pages/Admin').then(m => ({ default: m.AdminPage })));
const SettingsPage = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })));
const ExportPage = React.lazy(() => import('./pages/Export').then(m => ({ default: m.ExportPage })));
const ReportsPage = React.lazy(() => import('./pages/Reports').then(m => ({ default: m.ReportsPage })));
const ArchivePage = React.lazy(() => import('./pages/Archive').then(m => ({ default: m.ArchivePage })));
const DutyPage = React.lazy(() => import('./pages/Duty').then(m => ({ default: m.DutyPage })));
const NutritionPage = React.lazy(() => import('./pages/Nutrition').then(m => ({ default: m.NutritionPage })));
const AbsenteeismPage = React.lazy(() => import('./pages/Absenteeism').then(m => ({ default: m.AbsenteeismPage })));
const CalendarPage = React.lazy(() => import('./pages/Calendar').then(m => ({ default: m.CalendarPage })));
const PlannerPage = React.lazy(() => import('./pages/Planner').then(m => ({ default: m.PlannerPage })));
const LoginPage = React.lazy(() => import('./pages/Login').then(m => ({ default: m.LoginPage })));
const MiniApp = React.lazy(() => import('./miniapp/MiniApp').then(m => ({ default: m.MiniApp })));
const MiniHomeRedirect = React.lazy(() =>
    import('./miniapp/MiniApp').then((m) => ({ default: m.MiniHomeRedirect }))
);
import { TelegramHost } from './miniapp/TelegramHost';
import { MobileShell } from './mobile/MobileShell';
import { dbService } from './services/db';
import { AppData, PageId } from './types';
import { INITIAL_DATA, getInitialData } from './constants';
import { useAutoBackup } from './hooks/useAutoBackup';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { safeLocalStorageGet, safeLocalStorageSet } from './utils/localStorage';
import { logger } from './utils/logger';

/** Страницы с реальными маршрутами (не settings-табы users/organizations). */
const NAVIGABLE_PAGE_IDS: PageId[] = [
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

const getSafeHomePath = (allowedPages: PageId[], role: string | null, base = ''): string => {
    const fromList = allowedPages.find((p) => NAVIGABLE_PAGE_IDS.includes(p));
    if (fromList) return `${base}/${fromList}`;
    if (role === 'superadmin' || role === 'admin') return `${base}/dashboard`;
    return base ? `${base}` : '/login';
};

const ProtectedRoute = ({
    children,
    allowedRoles,
    pageId,
    /** База для редиректов: '' = основное приложение, '/tg' = Mini App */
    pathBase = ''
}: React.PropsWithChildren<{ allowedRoles?: string[]; pageId?: PageId; pathBase?: string }>) => {
    const { role, loading, canViewPage, allowedPages } = useAuth();

    if (loading)
        return (
            <div className="h-screen flex items-center justify-center">
                <Icon name="Loader" className="animate-spin text-indigo-600" size={48} />
            </div>
        );

    if (!role) {
        return <Navigate to={pathBase === '/tg' || pathBase === '/mini' ? '/tg' : '/login'} replace />;
    }

    const fallback = getSafeHomePath(allowedPages, role, pathBase);

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to={fallback} replace />;
    }

    if (pageId && !canViewPage(pageId)) {
        return <Navigate to={fallback} replace />;
    }

    return <>{children}</>;
};

const HomeRedirect = () => {
    const { loading, allowedPages, role } = useAuth();
    if (loading) return null;
    if (!role) return <Navigate to="/login" replace />;
    return <Navigate to={getSafeHomePath(allowedPages, role)} replace />;
};

type MenuItemDef = { to: string; label: string; icon: string; pageId: PageId };

const DEFAULT_MENU_ITEMS: MenuItemDef[] = [
    { to: '/dashboard', label: 'Рабочий стол', icon: 'Home', pageId: 'dashboard' },
    { to: '/schedule', label: '1 полугодие', icon: 'Calendar', pageId: 'schedule' },
    { to: '/schedule2', label: '2 полугодие', icon: 'Calendar', pageId: 'schedule2' },
    { to: '/duty', label: 'Дежурство', icon: 'Shield', pageId: 'duty' },
    { to: '/bells', label: 'Звонки', icon: 'Bell', pageId: 'bells' },
    { to: '/substitutions', label: 'Замены', icon: 'Repeat', pageId: 'substitutions' },
    { to: '/absenteeism', label: 'Пропуски', icon: 'UserX', pageId: 'absenteeism' },
    { to: '/nutrition', label: 'Питание', icon: 'Coffee', pageId: 'nutrition' },
    { to: '/directory', label: 'Справочники', icon: 'BookOpen', pageId: 'directory' },
    { to: '/admin', label: 'Администрация', icon: 'Users', pageId: 'admin' },
    { to: '/calendar', label: 'Календарь', icon: 'Calendar', pageId: 'calendar' },
    { to: '/planner', label: 'Планер', icon: 'CheckSquare', pageId: 'planner' },
    { to: '/reports', label: 'Отчёты', icon: 'BarChart2', pageId: 'reports' },
    { to: '/export', label: 'Экспорт', icon: 'Download', pageId: 'export' },
    { to: '/settings', label: 'Настройки', icon: 'Settings', pageId: 'settings' },
    { to: '/archive', label: 'Архив', icon: 'Archive', pageId: 'archive' }
];

const MENU_ORDER_KEY = 'gym_menu_order_v1';

const loadMenuOrder = (): PageId[] => {
    try {
        const raw = safeLocalStorageGet(MENU_ORDER_KEY);
        if (!raw) return DEFAULT_MENU_ITEMS.map((i) => i.pageId);
        const parsed = JSON.parse(raw) as PageId[];
        if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MENU_ITEMS.map((i) => i.pageId);
        const defaults = DEFAULT_MENU_ITEMS.map((i) => i.pageId);
        const ordered = parsed.filter((id) => defaults.includes(id));
        defaults.forEach((id) => {
            if (!ordered.includes(id)) ordered.push(id);
        });
        return ordered;
    } catch {
        return DEFAULT_MENU_ITEMS.map((i) => i.pageId);
    }
};

const Layout = () => {
    /** До lg — app-like MobileShell; lg+ — прежний десктопный Layout */
    const isMobileApp = useIsMobileApp();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
    const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
    const [theme, setTheme] = useState(() => {
        const saved = safeLocalStorageGet('theme');
        if (saved === 'light' || saved === 'dark') return saved;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [sessionWarning, setSessionWarning] = useState(false);
    const [themePreset, setThemePreset] = useState(() => safeLocalStorageGet('theme-preset') || 'default');
    const { isLoading, settings } = useStaticData();
    const { logout, user, profile, loading: authLoading, allowedPages, canViewPage, organizationId, organizations, isSuperAdmin, switchOrganization } = useAuth();
    const location = useLocation();
    useAutoBackup();

    const handleSessionWarning = useCallback(() => setSessionWarning(true), []);
    const handleSessionTimeout = useCallback(() => {
        setSessionWarning(false);
        logout();
    }, [logout]);

    const { resetTimer } = useSessionTimeout({
        timeoutMinutes: settings?.sessionTimeoutMinutes || 30,
        warningMinutes: 2,
        onWarning: handleSessionWarning,
        onTimeout: handleSessionTimeout
    });

    useEffect(() => {
        if (isLoading || authLoading || !user || !profile) return;
        const announcement = settings?.appAnnouncement;
        if (
            announcement?.active &&
            announcement.publishedAt &&
            profile.dismissedAppAnnouncementAt !== announcement.publishedAt &&
            safeLocalStorageGet(`dismissedAppAnnouncement_${user.id}`) !== announcement.publishedAt
        ) {
            setShowAnnouncement(true);
        }
    }, [isLoading, authLoading, user, profile, settings?.appAnnouncement]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsCommandOpen((open) => !open);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Закрываем мобильное меню при изменении размера экрана
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                // lg breakpoint
                setIsMobileMenuOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [compact, setCompact] = useState(() => safeLocalStorageGet('compact') === 'true');
    const [menuOrder, setMenuOrder] = useState<PageId[]>(loadMenuOrder);
    const [menuReorderMode, setMenuReorderMode] = useState(false);
    const [dragMenuId, setDragMenuId] = useState<PageId | null>(null);

    const persistMenuOrder = useCallback((next: PageId[]) => {
        safeLocalStorageSet(MENU_ORDER_KEY, JSON.stringify(next));
        setMenuOrder(next);
    }, []);

    const reorderMenu = useCallback(
        (fromId: PageId, toId: PageId) => {
            if (fromId === toId) return;
            setMenuOrder((prev) => {
                const next = [...prev];
                const from = next.indexOf(fromId);
                const to = next.indexOf(toId);
                if (from === -1 || to === -1) return prev;
                next.splice(from, 1);
                next.splice(to, 0, fromId);
                safeLocalStorageSet(MENU_ORDER_KEY, JSON.stringify(next));
                return next;
            });
        },
        []
    );

    const moveMenuItem = useCallback(
        (pageId: PageId, direction: 'up' | 'down', visibleIds: PageId[]) => {
            const idx = visibleIds.indexOf(pageId);
            if (idx === -1) return;
            const swapWith = direction === 'up' ? idx - 1 : idx + 1;
            if (swapWith < 0 || swapWith >= visibleIds.length) return;
            reorderMenu(pageId, visibleIds[swapWith]);
        },
        [reorderMenu]
    );

    const resetMenuOrder = useCallback(() => {
        const defaults = DEFAULT_MENU_ITEMS.map((i) => i.pageId);
        persistMenuOrder(defaults);
    }, [persistMenuOrder]);

    useEffect(() => {
        if (compact) document.documentElement.classList.add('compact');
        else document.documentElement.classList.remove('compact');
        safeLocalStorageSet('compact', String(compact));
    }, [compact]);

    useEffect(() => {
        if (themePreset && themePreset !== 'default') {
            document.documentElement.setAttribute('data-theme', themePreset);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        safeLocalStorageSet('theme-preset', themePreset);
    }, [themePreset]);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            const saved = safeLocalStorageGet('theme');
            if (!saved || saved === 'auto') {
                setTheme(e.matches ? 'dark' : 'light');
            }
        };
        mq.addEventListener('change', handleChange);
        return () => mq.removeEventListener('change', handleChange);
    }, []);

    // 2026 Spotlight Cursor Effect — attach after layout mounts (post loading spinner)
    const spotlightRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const container = spotlightRef.current;
        if (!container || isLoading) return;
        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            container.style.setProperty('--spotlight-x', `${x}%`);
            container.style.setProperty('--spotlight-y', `${y}%`);
        };
        container.addEventListener('mousemove', handleMouseMove);
        return () => container.removeEventListener('mousemove', handleMouseMove);
    }, [isLoading]);

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        safeLocalStorageSet('theme', theme);
    }, [theme]);


    const currentOrganization = organizations.find((o) => o.id === organizationId);
    const organizationName = currentOrganization?.name || settings?.schoolName || 'Управление учреждением';

    if (isLoading)
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950">
                <Icon name="Loader" className="animate-spin text-indigo-600" size={48} />
            </div>
        );

    const byPageId = new Map(DEFAULT_MENU_ITEMS.map((i) => [i.pageId, i]));
    const filteredMenuItems = menuOrder
        .map((id) => byPageId.get(id))
        .filter((item): item is MenuItemDef => !!item && canViewPage(item.pageId));
    // На случай новых pageId, которых ещё нет в сохранённом порядке
    DEFAULT_MENU_ITEMS.forEach((item) => {
        if (canViewPage(item.pageId) && !filteredMenuItems.some((m) => m.pageId === item.pageId)) {
            filteredMenuItems.push(item);
        }
    });

    const appearanceModal = (
            <Modal
                isOpen={isAppearanceOpen}
                onClose={() => setIsAppearanceOpen(false)}
                title="Оформление"
                maxWidth="max-w-sm"
            >
                <div className="space-y-5">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Тема
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setTheme('light')}
                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition ${
                                    theme === 'light'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700'
                                        : 'bg-white/50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                                }`}
                            >
                                <Icon name="Sun" size={18} /> Светлая
                            </button>
                            <button
                                type="button"
                                onClick={() => setTheme('dark')}
                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition ${
                                    theme === 'dark'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700'
                                        : 'bg-white/50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                                }`}
                            >
                                <Icon name="Moon" size={18} /> Тёмная
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Плотность
                        </div>
                        <button
                            type="button"
                            onClick={() => setCompact((c) => !c)}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition ${
                                compact
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700'
                                    : 'bg-white/50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <Icon name="Columns" size={18} />
                                Компактный режим
                            </span>
                            <span className="text-[11px] font-bold opacity-70">{compact ? 'Вкл' : 'Выкл'}</span>
                        </button>
                    </div>

                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Цвет приложения
                        </div>
                        <div className="flex items-center justify-center gap-3 flex-wrap">
                            {[
                                { id: 'default', color: 'bg-gradient-to-br from-indigo-500 to-purple-600', label: 'Классика' },
                                { id: 'ocean', color: 'bg-gradient-to-br from-sky-500 to-cyan-500', label: 'Океан' },
                                { id: 'forest', color: 'bg-gradient-to-br from-emerald-500 to-lime-500', label: 'Лес' },
                                { id: 'sunset', color: 'bg-gradient-to-br from-amber-500 to-orange-500', label: 'Закат' },
                                { id: 'rose', color: 'bg-gradient-to-br from-rose-500 to-pink-500', label: 'Роза' }
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setThemePreset(t.id)}
                                    className={`w-9 h-9 rounded-full ${t.color} transition-all ${
                                        themePreset === t.id
                                            ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-400 scale-110 shadow-md'
                                            : 'opacity-70 hover:opacity-100'
                                    }`}
                                    title={t.label}
                                    aria-label={t.label}
                                />
                            ))}
                        </div>
                        <p className="text-center text-[11px] text-slate-400 mt-2">
                            {[
                                { id: 'default', label: 'Классика' },
                                { id: 'ocean', label: 'Океан' },
                                { id: 'forest', label: 'Лес' },
                                { id: 'sunset', label: 'Закат' },
                                { id: 'rose', label: 'Роза' }
                            ].find((t) => t.id === themePreset)?.label || 'Классика'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsAppearanceOpen(false)}
                        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition"
                    >
                        Готово
                    </button>
                </div>
            </Modal>
    );

    const sessionAndAnnouncements = (
        <>
            <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />
            {showAnnouncement && settings?.appAnnouncement && (
                <AnnouncementModal
                    announcement={settings.appAnnouncement}
                    onClose={() => setShowAnnouncement(false)}
                />
            )}
            {sessionWarning && (
                <div
                    data-overlay="session"
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in"
                >
                    <div className="float-panel rounded-3xl w-full max-w-sm p-6 text-center">
                        <Icon name="Clock" size={48} className="mx-auto mb-4 text-amber-500 animate-pulse-glow" />
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Сессия истекает</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                            Вы неактивны более {Math.max(1, (settings?.sessionTimeoutMinutes || 30) - 2)} минут. Через 2 минуты произойдёт автоматический выход.
                        </p>
                        <button
                            onClick={() => {
                                setSessionWarning(false);
                                resetTimer();
                            }}
                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-bold transition-all shadow-glow active:scale-95"
                        >
                            Продолжить работу
                        </button>
                    </div>
                </div>
            )}
        </>
    );

    /* ——— Мобильная PWA-оболочка: полный функционал, app-like chrome ——— */
    if (isMobileApp) {
        return (
            <>
                <MobileShell
                    onOpenAppearance={() => setIsAppearanceOpen(true)}
                    onOpenCommand={() => setIsCommandOpen(true)}
                >
                    <div key={location.pathname} className="animate-page-in min-h-0 w-full max-w-full min-w-0 box-border">
                        <MainContent />
                    </div>
                </MobileShell>
                {appearanceModal}
                {sessionAndAnnouncements}
            </>
        );
    }

    return (
        <div
            ref={spotlightRef}
            className="spotlight-container flex h-screen w-full max-w-full bg-slate-50 dark:bg-dark-950 overflow-hidden transition-colors duration-300 mesh-gradient-bg noise-overlay"
        >
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar - hidden on mobile unless opened via menu */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-64 sidebar-2026 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} no-print overflow-hidden shrink-0`}
            >
                <div className="h-full flex flex-col relative">
                    <div className="p-5 flex items-center gap-3 border-b border-white/20 dark:border-white/5 pt-6">
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-2xl text-white relative shadow-lg shadow-indigo-500/30 dark:shadow-none transition-colors duration-500 neon-glow">
                            <Icon name="GraduationCap" size={24} />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight truncate max-w-[150px]" title={organizationName}>{organizationName}</h1>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Управление V2.0</p>
                        </div>
                    </div>

                    {/* Яркий переключатель организации для суперадмина — сверху, не внизу */}
                    {isSuperAdmin && organizations.length > 0 && (
                        <div className="mx-3 mt-3 p-3 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-700 shadow-sm">
                            <div className="flex items-center gap-2 mb-1.5">
                                <Icon name="Building" size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <label className="block text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                                    Организация
                                </label>
                            </div>
                            <select
                                value={organizationId || ''}
                                onChange={(e) => switchOrganization(e.target.value || null)}
                                className="w-full px-3 py-2.5 text-sm font-bold rounded-xl border border-indigo-200 dark:border-indigo-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {organizations.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <nav className="flex-1 flex flex-col min-h-0 p-3 pr-1.5">
                        <div className="flex-1 space-y-0.5 overflow-y-auto sidebar-nav-scroll min-h-0">
                            {filteredMenuItems.map((item, idx) => (
                                <div
                                    key={item.to}
                                    draggable={menuReorderMode}
                                    onDragStart={(e) => {
                                        if (!menuReorderMode) return;
                                        setDragMenuId(item.pageId);
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', item.pageId);
                                    }}
                                    onDragOver={(e) => {
                                        if (!menuReorderMode) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (dragMenuId && dragMenuId !== item.pageId) {
                                            reorderMenu(dragMenuId, item.pageId);
                                        }
                                    }}
                                    onDragEnd={() => setDragMenuId(null)}
                                    className={`flex items-center gap-1 rounded-xl ${
                                        menuReorderMode ? 'bg-white/30 dark:bg-white/[0.03]' : ''
                                    } ${dragMenuId === item.pageId ? 'opacity-50' : ''}`}
                                >
                                    {menuReorderMode ? (
                                        <>
                                            <div
                                                className="flex-1 flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-grab active:cursor-grabbing select-none"
                                                title="Перетащите или используйте стрелки"
                                            >
                                                <Icon name={item.icon} size={18} className="shrink-0 text-slate-400" />
                                                <span className="flex-1 truncate">{item.label}</span>
                                            </div>
                                            <div className="flex flex-col pr-1 shrink-0">
                                                <button
                                                    type="button"
                                                    disabled={idx === 0}
                                                    onClick={() =>
                                                        moveMenuItem(
                                                            item.pageId,
                                                            'up',
                                                            filteredMenuItems.map((m) => m.pageId)
                                                        )
                                                    }
                                                    className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                                                    title="Выше"
                                                >
                                                    <Icon name="ArrowRight" size={14} className="-rotate-90" />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={idx === filteredMenuItems.length - 1}
                                                    onClick={() =>
                                                        moveMenuItem(
                                                            item.pageId,
                                                            'down',
                                                            filteredMenuItems.map((m) => m.pageId)
                                                        )
                                                    }
                                                    className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20"
                                                    title="Ниже"
                                                >
                                                    <Icon name="ArrowRight" size={14} className="rotate-90" />
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <NavLink
                                            to={item.to}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className={({ isActive }) => `
                                                group flex flex-1 min-w-0 items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all relative tactile-btn spring-bounce
                                                ${isActive
                                                    ? 'bg-white/60 dark:bg-white/5 text-indigo-700 dark:text-indigo-300 shadow-sm border border-indigo-200/40 dark:border-indigo-500/20'
                                                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-200 border border-transparent'
                                                }
                                            `}
                                        >
                                            {({ isActive }) => (
                                                <>
                                                    {isActive && (
                                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-gradient-to-b from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-500 rounded-r-full shadow shadow-indigo-500/50 sidebar-indicator" />
                                                    )}
                                                    <Icon
                                                        name={item.icon}
                                                        size={18}
                                                        className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 text-indigo-600 dark:text-indigo-400' : 'group-hover:scale-110 text-slate-500 dark:text-slate-400'}`}
                                                    />
                                                    <span className="flex-1 truncate">{item.label}</span>
                                                </>
                                            )}
                                        </NavLink>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Порядок меню — внизу, не мешает навигации */}
                        <div className="pt-2 mt-1 border-t border-white/15 dark:border-white/5 space-y-1 shrink-0">
                            {menuReorderMode ? (
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuReorderMode(false);
                                            setDragMenuId(null);
                                        }}
                                        className="flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                                    >
                                        Готово
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetMenuOrder}
                                        className="py-1.5 px-2 text-[11px] font-semibold rounded-lg text-slate-500 hover:bg-white/40 dark:hover:bg-white/5 transition"
                                        title="Вернуть порядок по умолчанию"
                                    >
                                        Сброс
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setMenuReorderMode(true)}
                                    className="w-full py-1.5 px-2 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-white/30 dark:hover:bg-white/5 transition"
                                >
                                    Порядок меню
                                </button>
                            )}
                        </div>
                    </nav>

                    <div className="hidden lg:block mb-2 px-3">
                        <StatusWidget />
                    </div>

                    <div className="p-3 border-t border-white/20 dark:border-white/5">
                        <div className="flex items-center gap-1.5 px-1">
                            <div
                                title={user?.email || 'Гость'}
                                className="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate px-1"
                            >
                                {user ? user.email || 'Гость' : 'Гость'}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAppearanceOpen(true)}
                                className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white/50 dark:hover:bg-white/5 transition-colors shrink-0"
                                title="Оформление"
                                aria-label="Оформление: тема, цвет, компактный режим"
                            >
                                <Icon name="Settings" size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={logout}
                                className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                                title="Выйти"
                                aria-label="Выйти"
                            >
                                <Icon name="LogOut" size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {appearanceModal}

            <main className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden bg-transparent relative z-10">
                <header className="lg:hidden p-4 flex items-center gap-3 glass-panel border-b border-white/20 dark:border-white/5 no-print sticky top-0 z-30 w-full max-w-full box-border">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
                        aria-label="Открыть меню"
                    >
                        <Icon name="Menu" size={22} />
                    </button>
                    <span className="font-bold text-slate-800 dark:text-white text-lg tracking-tight truncate flex-1 min-w-0" title={organizationName}>{organizationName}</span>
                    <button
                        type="button"
                        onClick={() => setIsCommandOpen(true)}
                        className="p-2 rounded-xl text-slate-500 hover:bg-white/40 dark:hover:bg-white/5 shrink-0"
                        aria-label="Поиск (Ctrl+K)"
                        title="Поиск (Ctrl+K)"
                    >
                        <Icon name="Search" size={20} />
                    </button>
                </header>

                <div key={location.pathname} className="flex-1 overflow-x-hidden overflow-y-auto lg:overflow-auto p-4 lg:p-8 pb-24 lg:pb-8 custom-scrollbar-2026 relative animate-page-in w-full max-w-full min-w-0 box-border">
                    <MainContent />
                </div>

                {/* На <lg всегда MobileShell — этот BottomNavigation только fallback, если media-query сбойнул */}
                <BottomNavigation onMenuClick={() => setIsMobileMenuOpen(true)} allowedPages={allowedPages} />
            </main>
            {sessionAndAnnouncements}
        </div>
    );
};

const PublicLayout = () => {
    const [publicData, setPublicData] = useState<AppData | null>(null);
    const [loadingPublic, setLoadingPublic] = useState(true);
    const [searchParams] = useSearchParams();
    const publicId = searchParams.get('id');

    useEffect(() => {
        if (publicId) {
            setLoadingPublic(true);
            dbService
                .getPublicData(publicId)
                .then((data) => {
                    const mergedData: AppData = {
                        ...getInitialData(),
                        ...data,
                        settings: { ...INITIAL_DATA.settings, ...data?.settings }
                    };
                    setPublicData(mergedData);
                    setLoadingPublic(false);
                })
                .catch((e) => {
                    logger.error('Failed to load public data:', e);
                    setPublicData(null);
                    setLoadingPublic(false);
                });
        } else {
            setLoadingPublic(false);
            setPublicData(null);
        }
    }, [publicId]);

    if (loadingPublic) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950">
                <Icon name="Loader" className="animate-spin text-indigo-600" size={48} />
            </div>
        );
    }

    if (!publicData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
                <Icon name="AlertTriangle" size={64} className="text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Расписание не найдено</h1>
                <p className="text-slate-500 dark:text-slate-400">Публичное расписание недоступно по этой ссылке.</p>
            </div>
        );
    }

    return (
        <DataProvider initialData={publicData}>
            <StaticDataProvider>
                <ScheduleDataProvider>
                    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex flex-col">
                        <header className="bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-50 no-print shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-600 p-2 rounded-lg text-white">
                                    <Icon name="GraduationCap" size={24} />
                                </div>
                                <div>
                                    <h1 className="font-black text-slate-800 dark:text-white text-lg leading-none">
                                        {publicData?.settings?.schoolName || 'Расписание'}
                                    </h1>
                                    <p className="text-xs font-bold text-slate-400 uppercase">Публичное расписание</p>
                                </div>
                            </div>
                        </header>
                        <main className="flex-1 p-4 lg:p-8 overflow-auto">
                            <SchedulePage readOnly={true} />
                        </main>
                    </div>
                </ScheduleDataProvider>
            </StaticDataProvider>
        </DataProvider>
    );
};

export default function App() {
    return (
        <ToastProvider>
            <AuthProvider>
                <DataProvider>
                    <StaticDataProvider>
                        <ScheduleDataProvider>
                            <HashRouter
                                future={{
                                    v7_startTransition: true,
                                    v7_relativeSplatPath: true
                                }}
                            >
                                <TelegramHost />
                                <React.Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950"><Icon name="Loader" className="animate-spin text-indigo-600" size={48} /></div>}>
                                    <Routes>
                                        <Route path="/login" element={<LoginPage />} />
                                        <Route path="/mini" element={<Navigate to="/tg" replace />} />
                                        {/* Telegram Mini App: компактный shell, те же страницы что и в полной версии */}
                                        <Route path="/tg" element={<MiniApp />}>
                                            <Route index element={<MiniHomeRedirect />} />
                                            <Route
                                                path="dashboard"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="dashboard">
                                                        <DashboardPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="schedule"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="schedule">
                                                        <SchedulePageWrapper semester={1} />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="schedule2"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="schedule2">
                                                        <SchedulePageWrapper semester={2} />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="substitutions"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="substitutions">
                                                        <SubstitutionsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="duty"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="duty">
                                                        <DutyPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="nutrition"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="nutrition">
                                                        <NutritionPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="absenteeism"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="absenteeism">
                                                        <AbsenteeismPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="directory"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="directory">
                                                        <DirectoryPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="bells"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="bells">
                                                        <BellsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="admin"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="admin">
                                                        <AdminPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="calendar"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="calendar">
                                                        <CalendarPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="planner"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="planner">
                                                        <PlannerPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="reports"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="reports">
                                                        <ReportsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="export"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="export">
                                                        <ExportPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="settings"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="settings">
                                                        <SettingsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="archive"
                                                element={
                                                    <ProtectedRoute pathBase="/tg" pageId="archive">
                                                        <ArchivePage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                        </Route>
                                        <Route
                                            path="/"
                                            element={
                                                <ProtectedRoute>
                                                    <Layout />
                                                </ProtectedRoute>
                                            }
                                        >
                                            <Route index element={<HomeRedirect />} />
                                            <Route
                                                path="dashboard"
                                                element={
                                                    <ProtectedRoute pageId="dashboard">
                                                        <DashboardPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="schedule"
                                                element={
                                                    <ProtectedRoute pageId="schedule">
                                                        <SchedulePageWrapper semester={1} />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="schedule2"
                                                element={
                                                    <ProtectedRoute pageId="schedule2">
                                                        <SchedulePageWrapper semester={2} />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="substitutions"
                                                element={
                                                    <ProtectedRoute pageId="substitutions">
                                                        <SubstitutionsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="duty"
                                                element={
                                                    <ProtectedRoute pageId="duty">
                                                        <DutyPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="nutrition"
                                                element={
                                                    <ProtectedRoute pageId="nutrition">
                                                        <NutritionPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="absenteeism"
                                                element={
                                                    <ProtectedRoute pageId="absenteeism">
                                                        <AbsenteeismPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="directory"
                                                element={
                                                    <ProtectedRoute pageId="directory">
                                                        <DirectoryPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="bells"
                                                element={
                                                    <ProtectedRoute pageId="bells">
                                                        <BellsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="admin"
                                                element={
                                                    <ProtectedRoute pageId="admin">
                                                        <AdminPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="calendar"
                                                element={
                                                    <ProtectedRoute pageId="calendar">
                                                        <CalendarPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="planner"
                                                element={
                                                    <ProtectedRoute pageId="planner">
                                                        <PlannerPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="reports"
                                                element={
                                                    <ProtectedRoute pageId="reports">
                                                        <ReportsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="export"
                                                element={
                                                    <ProtectedRoute pageId="export">
                                                        <ExportPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="settings"
                                                element={
                                                    <ProtectedRoute pageId="settings">
                                                        <SettingsPage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                            <Route
                                                path="archive"
                                                element={
                                                    <ProtectedRoute pageId="archive">
                                                        <ArchivePage />
                                                    </ProtectedRoute>
                                                }
                                            />
                                        </Route>
                                        <Route path="/public" element={<PublicLayout />} />
                                    </Routes>
                                </React.Suspense>
                            </HashRouter>
                        </ScheduleDataProvider>
                    </StaticDataProvider>
                </DataProvider>
            </AuthProvider>
        </ToastProvider>
    );
}

/** Один экземпляр Outlet — pull-to-refresh только на мобильных */
const MainContent = () => {
    const outlet = useOutlet();
    const isDesktop = useMedia('(min-width: 1024px)');

    const handleRefresh = useCallback(async () => {
        window.location.reload();
    }, []);

    if (isDesktop) {
        return <>{outlet}</>;
    }

    return (
        <div className="h-full min-h-0 w-full max-w-full min-w-0 flex-1 flex flex-col overflow-hidden overflow-x-hidden box-border">
            <PullToRefresh onRefresh={handleRefresh}>{outlet}</PullToRefresh>
        </div>
    );
};

const SchedulePageWrapper = ({ semester = 1 }: { semester?: 1 | 2 }) => {
    const { role, hasPermission } = useAuth();
    const { settings } = useStaticData();
    const canEdit = hasPermission('edit_schedule') || (role === 'teacher' && settings?.allowTeacherEdit);
    return <SchedulePage readOnly={!canEdit} semester={semester} />;
};
