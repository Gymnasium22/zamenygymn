
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { DataProvider, useStaticData, StaticDataProvider, ScheduleDataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Icon } from './components/Icons';
import { StatusWidget, BottomNavigation, ToastProvider } from './components/UI';
import { DashboardPage } from './pages/Dashboard';
import { SchedulePage } from './pages/Schedule';
import { DirectoryPage } from './pages/Directory';
import { BellsPage } from './pages/Bells';
import { SubstitutionsPage } from './pages/Substitutions';
import { AdminPage } from './pages/Admin';
import { ExportPage } from './pages/Export';
import { ReportsPage } from './pages/Reports';
import { DutyPage } from './pages/Duty';
import { NutritionPage } from './pages/Nutrition';
import { AbsenteeismPage } from './pages/Absenteeism';
import { LoginPage } from './pages/Login';
import { dbService } from './services/db';
import { AppData } from './types';
import { INITIAL_DATA } from './constants';

// Вспомогательные функции для localStorage (упрощенная версия для App.tsx)
const safeLocalStorageGet = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('Failed to read from localStorage:', e);
        return null;
    }
};

const safeLocalStorageSet = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}; 

const ProtectedRoute = ({ children, allowedRoles }: React.PropsWithChildren<{ allowedRoles?: string[] }>) => {
    const { user, role, loading } = useAuth();

    if (loading) return <div className="h-screen flex items-center justify-center"><Icon name="Loader" className="animate-spin text-indigo-600" size={48} /></div>;

    if (!role) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to={role === 'guest' ? '/schedule' : '/dashboard'} replace />;
    }

    return <>{children}</>;
};

const HomeRedirect = () => {
    const { role, loading } = useAuth();
    if (loading) return null;
    if (role === 'guest') return <Navigate to="/schedule" replace />;
    return <Navigate to="/dashboard" replace />;
};

const Layout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [theme, setTheme] = useState(safeLocalStorageGet('theme') || 'light');
    const { isLoading } = useStaticData();
    const { logout, role, user } = useAuth();


    // Закрываем мобильное меню при изменении размера экрана
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) { // lg breakpoint
                setIsMobileMenuOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        safeLocalStorageSet('theme', theme);
    }, [theme]);

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950"><Icon name="Loader" className="animate-spin text-indigo-600" size={48} /></div>;

    // Простое плоское меню без группировки
    const menuItems = [
        { to: '/dashboard', label: 'Рабочий стол', icon: 'Home', roles: ['admin', 'teacher', 'canteen'] },
        { to: '/schedule', label: 'Расписание 1 пол.', icon: 'Calendar', roles: ['admin', 'teacher', 'guest'] },
        { to: '/schedule2', label: 'Расписание 2 пол.', icon: 'Calendar', roles: ['admin', 'teacher', 'guest'] },
        { to: '/substitutions', label: 'Замены', icon: 'Repeat', roles: ['admin'] },
        { to: '/duty', label: 'Дежурство', icon: 'Shield', roles: ['admin'] },
        { to: '/nutrition', label: 'Питание', icon: 'Coffee', roles: ['admin', 'teacher', 'canteen'] },
        { to: '/absenteeism', label: 'Пропуски', icon: 'UserX', roles: ['admin', 'teacher'] },
        { to: '/bells', label: 'Звонки', icon: 'Bell', roles: ['admin'] },
        { to: '/directory', label: 'Справочники', icon: 'BookOpen', roles: ['admin'] },
        { to: '/reports', label: 'Отчеты', icon: 'BarChart2', roles: ['admin'] },
        { to: '/export', label: 'Экспорт', icon: 'Download', roles: ['admin'] },
        { to: '/admin', label: 'Администрация', icon: 'Settings', roles: ['admin'] },
    ];

    const filteredMenuItems = menuItems.filter(item => item.roles.includes(role || ''));

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-dark-950 overflow-hidden transition-colors duration-300 mesh-gradient-bg">
            {isMobileMenuOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
            
            {/* Sidebar - hidden on mobile unless opened via menu */}
                    <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 lg:w-64 bg-white/80 dark:bg-dark-800/90 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} no-print shadow-2xl lg:shadow-none overflow-hidden`}>
                <div className="h-full flex flex-col relative">
                    <div className="p-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 pt-8">
                        <div className="bg-indigo-600 p-2.5 rounded-xl text-white relative shadow-lg shadow-indigo-200 dark:shadow-none transition-colors duration-500">
                            <Icon name="GraduationCap" size={24} />
                        </div>
                        <div><h1 className="text-lg font-black text-slate-800 dark:text-white">Гимназия Pro22</h1><p className="text-[10px] font-bold text-slate-400 uppercase">Управление V2.0</p></div>
                    </div>

                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
                        {filteredMenuItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={({ isActive }) => `
                                    group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all relative
                                    ${isActive
                                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-700 dark:hover:text-slate-300'
                                    }
                                `}
                            >
                                <Icon name={item.icon} size={18} className="flex-shrink-0" />
                                <span className="flex-1 truncate">{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>

                    {/* Динамический StatusWidget — расположен выше панели пользователя/тем */}
                    <div className="hidden lg:block mb-2">
                        <StatusWidget />
                    </div>

                    <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                         <div className="flex items-center justify-between px-2">
                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate max-w-[120px]">{user ? (user.email || 'Гость') : 'Гость'}</div>
                            <button onClick={logout} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title="Выйти"><Icon name="LogOut" size={16}/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 dark:border-slate-600 active:scale-95 shadow-sm">
                                {theme === 'light' ? <Icon name="Moon" size={18} /> : <Icon name="Sun" size={18} />}
                            </button>
                        </div>
                    </div>
                </div>
                </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-transparent relative">
                <header className="lg:hidden p-4 flex items-center gap-3 bg-white/80 dark:bg-dark-800/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 no-print sticky top-0 z-30">
                    <span className="font-bold text-slate-800 dark:text-white text-lg">Гимназия Pro22</span>
                </header>
                
                <div className="flex-1 overflow-auto p-4 lg:p-8 pb-24 lg:pb-8 custom-scrollbar relative">
                    <Outlet />
                </div>

                <BottomNavigation onMenuClick={() => setIsMobileMenuOpen(true)} role={role} />
            </main>
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
            dbService.getPublicData(publicId).then(data => {
                const mergedData: AppData = { 
                    ...INITIAL_DATA, 
                    ...data,
                    settings: { ...INITIAL_DATA.settings, ...data?.settings }
                };
                setPublicData(mergedData);
                setLoadingPublic(false);
            }).catch(e => {
                console.error("Failed to load public data:", e);
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
                                <div className="bg-indigo-600 p-2 rounded-lg text-white"><Icon name="GraduationCap" size={24}/></div>
                                <div><h1 className="font-black text-slate-800 dark:text-white text-lg leading-none">Гимназия №22</h1><p className="text-xs font-bold text-slate-400 uppercase">Публичное расписание</p></div>
                            </div>
                        </header>
                        <main className="flex-1 p-4 lg:p-8 overflow-auto"><SchedulePage readOnly={true} /></main>
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
                            <HashRouter>
                            <Routes>
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                                    <Route index element={<HomeRedirect />} />
                                    <Route path="dashboard" element={
                                        <ProtectedRoute allowedRoles={['admin', 'teacher', 'canteen']}>
                                            <DashboardPage />
                                        </ProtectedRoute>
                                    } />
                                    <Route path="schedule" element={
                                        <SchedulePageWrapper semester={1} />
                                    } />
                                    <Route path="schedule2" element={
                                        <SchedulePageWrapper semester={2} />
                                    } />
                                    <Route path="substitutions" element={<ProtectedRoute allowedRoles={['admin']}><SubstitutionsPage /></ProtectedRoute>} />
                                    <Route path="duty" element={<ProtectedRoute allowedRoles={['admin']}><DutyPage /></ProtectedRoute>} />
                                    <Route path="nutrition" element={<ProtectedRoute allowedRoles={['admin', 'teacher', 'canteen']}><NutritionPage /></ProtectedRoute>} />
                                    <Route path="absenteeism" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AbsenteeismPage /></ProtectedRoute>} />
                                    <Route path="directory" element={<ProtectedRoute allowedRoles={['admin']}><DirectoryPage /></ProtectedRoute>} />
                                    <Route path="bells" element={<ProtectedRoute allowedRoles={['admin']}><BellsPage /></ProtectedRoute>} />
                                    <Route path="admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminPage /></ProtectedRoute>} />
                                    <Route path="reports" element={<ProtectedRoute allowedRoles={['admin']}><ReportsPage /></ProtectedRoute>} />
                                    <Route path="export" element={<ProtectedRoute allowedRoles={['admin']}><ExportPage /></ProtectedRoute>} />
                                </Route>
                                <Route path="/public" element={<PublicLayout />} />
                            </Routes>
                            </HashRouter>
                        </ScheduleDataProvider>
                    </StaticDataProvider>
                </DataProvider>
            </AuthProvider>
        </ToastProvider>
    );
}

const SchedulePageWrapper = ({ semester = 1 }: { semester?: 1 | 2 }) => {
    const { role } = useAuth();
    return <SchedulePage readOnly={role !== 'admin'} semester={semester} />;
};
