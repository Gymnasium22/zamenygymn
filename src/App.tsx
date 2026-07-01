import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, NavLink, Outlet, useSearchParams, useLocation } from 'react-router-dom';
import { DataProvider, useStaticData, StaticDataProvider, ScheduleDataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Icon } from './components/Icons';
import { StatusWidget, BottomNavigation, ToastProvider, CommandPalette } from './components/UI';
import { AnnouncementModal } from './components/AnnouncementModal';
import { PullToRefresh } from './components/PullToRefresh';
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
import { dbService } from './services/db';
import { AppData, PageId } from './types';
import { INITIAL_DATA, getInitialData } from './constants';
import { useAutoBackup } from './hooks/useAutoBackup';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { safeLocalStorageGet, safeLocalStorageSet } from './utils/localStorage';
import { logger } from './utils/logger';

const ProtectedRoute = ({
    children,
    allowedRoles,
    pageId
}: React.PropsWithChildren<{ allowedRoles?: string[]; pageId?: PageId }>) => {
    const { role, loading, canViewPage, allowedPages } = useAuth();

    if (loading)
        return (
            <div className="h-screen flex items-center justify-center">
                <Icon name="Loader" className="animate-spin text-indigo-600" size={48} />
            </div>
        );

    if (!role) {
        return <Navigate to="/login" replace />;
    }

    const firstAllowed = allowedPages[0] || 'login';

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to={`/${firstAllowed}`} replace />;
    }

    if (pageId && !canViewPage(pageId)) {
        return <Navigate to={`/${firstAllowed}`} replace />;
    }

    return <>{children}</>;
};

const HomeRedirect = () => {
    const { loading, allowedPages } = useAuth();
    if (loading) return null;
    const firstPage = allowedPages[0];
    if (firstPage) return <Navigate to={`/${firstPage}`} replace />;
    return <Navigate to="/login" replace />;
};

const Layout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
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

    useSessionTimeout({
        timeoutMinutes: settings?.sessionTimeoutMinutes || 30,
        warningMinutes: 2,
        onWarning: () => setSessionWarning(true),
        onTimeout: () => {
            setSessionWarning(false);
            logout();
        }
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

    // Меню строится на основе allowedPages из профиля пользователя
    const menuItems: { to: string; label: string; icon: string; pageId: import('./types').PageId }[] = [
        { to: '/dashboard', label: 'Рабочий стол', icon: 'Home', pageId: 'dashboard' },
        { to: '/schedule', label: 'Расписание 1 пол.', icon: 'Calendar', pageId: 'schedule' },
        { to: '/schedule2', label: 'Расписание 2 пол.', icon: 'Calendar', pageId: 'schedule2' },
        { to: '/substitutions', label: 'Замены', icon: 'Repeat', pageId: 'substitutions' },
        { to: '/duty', label: 'Дежурство', icon: 'Shield', pageId: 'duty' },
        { to: '/nutrition', label: 'Питание', icon: 'Coffee', pageId: 'nutrition' },
        { to: '/absenteeism', label: 'Пропуски', icon: 'UserX', pageId: 'absenteeism' },
        { to: '/bells', label: 'Звонки', icon: 'Bell', pageId: 'bells' },
        { to: '/directory', label: 'Справочники', icon: 'BookOpen', pageId: 'directory' },
        { to: '/reports', label: 'Отчеты', icon: 'BarChart2', pageId: 'reports' },
        { to: '/export', label: 'Экспорт', icon: 'Download', pageId: 'export' },
        { to: '/admin', label: 'Администрация', icon: 'Users', pageId: 'admin' },
        { to: '/calendar', label: 'Календарь', icon: 'Calendar', pageId: 'calendar' },
        { to: '/planner', label: 'Планер', icon: 'CheckSquare', pageId: 'planner' },
        { to: '/settings', label: 'Настройки', icon: 'Settings', pageId: 'settings' },
        { to: '/archive', label: 'Архив', icon: 'Archive', pageId: 'archive' }
    ];

    const filteredMenuItems = menuItems.filter((item) => canViewPage(item.pageId));

    return (
        <div
            ref={spotlightRef}
            className="spotlight-container flex h-screen bg-slate-50 dark:bg-dark-950 overflow-hidden transition-colors duration-300 mesh-gradient-bg noise-overlay"
        >
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar - hidden on mobile unless opened via menu */}
            <aside
                className={`fixed lg:static inset-y-0 left-0 z-50 w-64 lg:w-64 sidebar-2026 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} no-print overflow-hidden relative`}
            >
                <div className="h-full flex flex-col relative">
                    <div className="p-5 flex items-center gap-3 border-b border-white/20 dark:border-white/5 pt-6">
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-2xl text-white relative shadow-lg shadow-indigo-500/30 dark:shadow-none transition-colors duration-500 neon-glow">
                            <Icon name="GraduationCap" size={24} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight truncate max-w-[140px]" title={organizationName}>{organizationName}</h1>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Управление V2.0</p>
                        </div>
                    </div>

                    <nav className="flex-1 p-4 space-y-0.5 overflow-y-auto no-scrollbar">
                        {filteredMenuItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={({ isActive }) => `
                                    group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all relative tactile-btn spring-bounce
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
                        ))}
                    </nav>

                    {/* Динамический StatusWidget — расположен выше панели пользователя/тем */}
                    <div className="hidden lg:block mb-2 px-3">
                        <StatusWidget />
                    </div>


                        {isSuperAdmin && organizations.length > 0 && (
                            <div className="px-3 mb-2">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 px-2">Организация</label>
                                <select
                                    value={organizationId || ''}
                                    onChange={(e) => switchOrganization(e.target.value || null)}
                                    className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {organizations.map((o) => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    <div className="p-3 border-t border-white/20 dark:border-white/5 space-y-2">
                        <div className="flex items-center justify-between px-2">
                            <div
                                title={user?.email || 'Гость'}
                                className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate max-w-[120px]"
                            >
                                {user ? user.email || 'Гость' : 'Гость'}
                            </div>
                            <button
                                onClick={logout}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 rounded-xl transition-colors spring-bounce"
                                title="Выйти"
                            >
                                <Icon name="LogOut" size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all border border-white/30 dark:border-white/5 active:scale-95 shadow-sm btn-glow"
                                title="Сменить тему"
                            >
                                {theme === 'light' ? <Icon name="Moon" size={18} /> : <Icon name="Sun" size={18} />}
                            </button>
                            <button
                                onClick={() => setCompact((c) => !c)}
                                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl transition-all border active:scale-95 shadow-sm btn-glow ${
                                    compact
                                        ? 'bg-indigo-50/80 text-indigo-600 border-indigo-200/50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-700/30'
                                        : 'bg-white/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 border-white/30 dark:border-white/5'
                                }`}
                                title="Компактный режим"
                            >
                                <Icon name="Columns" size={18} />
                            </button>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            {[
                                { id: 'default', color: 'bg-gradient-to-br from-indigo-500 to-purple-600' },
                                { id: 'ocean', color: 'bg-gradient-to-br from-sky-500 to-cyan-500' },
                                { id: 'forest', color: 'bg-gradient-to-br from-emerald-500 to-lime-500' },
                                { id: 'sunset', color: 'bg-gradient-to-br from-amber-500 to-orange-500' },
                                { id: 'rose', color: 'bg-gradient-to-br from-rose-500 to-pink-500' }
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setThemePreset(t.id)}
                                    className={`w-6 h-6 rounded-full ${t.color} transition-all ${
                                        themePreset === t.id ? 'ring-2 ring-offset-2 ring-slate-300 dark:ring-slate-500 scale-110 shadow-glow' : 'opacity-60 hover:opacity-100'
                                    }`}
                                    title={t.id === 'default' ? 'Классика' : t.id === 'ocean' ? 'Океан' : t.id === 'forest' ? 'Лес' : t.id === 'sunset' ? 'Закат' : 'Роза'}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
                <header className="lg:hidden p-4 flex items-center gap-3 glass-panel border-b border-white/20 dark:border-white/5 no-print sticky top-0 z-30">
                    <span className="font-bold text-slate-800 dark:text-white text-lg tracking-tight truncate" title={organizationName}>{organizationName}</span>
                </header>

                <div key={location.pathname} className="flex-1 overflow-auto lg:overflow-auto p-4 lg:p-8 pb-24 lg:pb-8 custom-scrollbar-2026 relative animate-page-in">
                    {/* Mobile-only pull-to-refresh wrapper */}
                    <div className="lg:hidden h-full">
                        <PullToRefresh
                            onRefresh={async () => {
                                await new Promise((r) => setTimeout(r, 800));
                            }}
                        >
                            <Outlet />
                        </PullToRefresh>
                    </div>
                    {/* Desktop: no pull-to-refresh */}
                    <div className="hidden lg:block h-full">
                        <Outlet />
                    </div>
                </div>

                <BottomNavigation onMenuClick={() => setIsMobileMenuOpen(true)} allowedPages={allowedPages} />
            </main>
            <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />
            {showAnnouncement && settings?.appAnnouncement && (
                <AnnouncementModal
                    announcement={settings.appAnnouncement}
                    onClose={() => setShowAnnouncement(false)}
                />
            )}
            {sessionWarning && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="float-panel rounded-3xl w-full max-w-sm p-6 text-center">
                        <Icon name="Clock" size={48} className="mx-auto mb-4 text-amber-500 animate-pulse-glow" />
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Сессия истекает</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                            Вы неактивны более {Math.max(1, (settings?.sessionTimeoutMinutes || 30) - 2)} минут. Через 2 минуты произойдёт автоматический выход.
                        </p>
                        <button
                            onClick={() => setSessionWarning(false)}
                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-bold transition-all shadow-glow active:scale-95"
                        >
                            Продолжить работу
                        </button>
                    </div>
                </div>
            )}
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
                                <React.Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950"><Icon name="Loader" className="animate-spin text-indigo-600" size={48} /></div>}>
                                    <Routes>
                                        <Route path="/login" element={<LoginPage />} />
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
                                            <Route path="schedule" element={<SchedulePageWrapper semester={1} />} />
                                            <Route path="schedule2" element={<SchedulePageWrapper semester={2} />} />
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
                                                    <ProtectedRoute allowedRoles={['admin']} pageId="archive">
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

const SchedulePageWrapper = ({ semester = 1 }: { semester?: 1 | 2 }) => {
    const { role, hasPermission } = useAuth();
    const { settings } = useStaticData();
    const canEdit = hasPermission('edit_schedule') || (role === 'teacher' && settings?.allowTeacherEdit);
    return <SchedulePage readOnly={!canEdit} semester={semester} />;
};
