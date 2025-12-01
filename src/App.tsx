
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { DataProvider, useStaticData, StaticDataProvider, ScheduleDataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Icon } from './components/Icons';
import { StatusWidget } from './components/UI';
import { DashboardPage } from './pages/Dashboard';
import { SchedulePage } from './pages/Schedule';
import { DirectoryPage } from './pages/Directory';
import { SubstitutionsPage } from './pages/Substitutions';
import { AdminPage } from './pages/Admin';
import { ExportPage } from './pages/Export'; 
import { ReportsPage } from './pages/Reports';
import { LoginPage } from './pages/Login';
import { dbService } from './services/db';
import { AppData } from './types'; 
import { INITIAL_DATA } from './constants'; 

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
    const { user, role, loading } = useAuth();

    if (loading) return <div className="h-screen flex items-center justify-center"><Icon name="Loader" className="animate-spin text-indigo-600" size={48} /></div>;

    if (!role) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        // Если роль не разрешена, перенаправляем на домашнюю страницу для этой роли
        return <Navigate to={role === 'guest' ? '/schedule' : '/dashboard'} replace />;
    }

    return <>{children}</>;
};

// Компонент для перенаправления с корневого пути в зависимости от роли
const HomeRedirect = () => {
    const { role, loading } = useAuth();
    if (loading) return null;
    if (role === 'guest') return <Navigate to="/schedule" replace />;
    return <Navigate to="/dashboard" replace />;
};

const Layout = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const { isLoading } = useStaticData(); 
    const { logout, role, user } = useAuth();

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950"><Icon name="Loader" className="animate-spin text-indigo-600" size={48} /></div>;

    const menuItems = [
        // Dashboard: Только Админ и Учитель
        { to: '/dashboard', label: 'Рабочий стол', icon: 'Home', roles: ['admin', 'teacher'] },
        // Schedule: Все роли (1 полугодие)
        { to: '/schedule', label: 'Расписание 1 полугодие', icon: 'Calendar', roles: ['admin', 'teacher', 'guest'] },
        // Schedule 2: Все роли (2 полугодие)
        { to: '/schedule2', label: 'Расписание 2 полугодие', icon: 'Calendar', roles: ['admin', 'teacher', 'guest'] },
        // Substitutions (Назначение замен): Только Админ
        { to: '/substitutions', label: 'Замены', icon: 'Repeat', roles: ['admin'] }, 
        // Остальные: Только Админ
        { to: '/directory', label: 'Справочники', icon: 'BookOpen', roles: ['admin'] },
        { to: '/reports', label: 'Отчеты', icon: 'BarChart2', roles: ['admin'] }, 
        { to: '/export', label: 'Экспорт', icon: 'Download', roles: ['admin'] },
        { to: '/admin', label: 'Администрация', icon: 'Settings', roles: ['admin'] },
    ];

    const filteredMenu = menuItems.filter(item => item.roles.includes(role || ''));

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-dark-950 overflow-hidden transition-colors duration-300">
            {isMobileMenuOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-dark-800 border-r border-slate-200 dark:border-slate-700 transform transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} no-print`}>
                <div className="h-full flex flex-col">
                    <div className="p-6 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700">
                        <div className="bg-indigo-600 p-2.5 rounded-xl text-white"><Icon name="GraduationCap" size={24} /></div>
                        <div><h1 className="text-lg font-black text-slate-800 dark:text-white">Гимназия №22</h1><p className="text-[10px] font-bold text-slate-400 uppercase">Управление V1.0</p></div>
                    </div>
                    
                    <div className="px-6 pt-4">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Меню</div>
                    </div>

                    <nav className="flex-1 p-4 space-y-1 pt-0">
                        {filteredMenu.map((item) => (
                            <NavLink key={item.to} to={item.to} onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                <Icon name={item.icon} size={20} />{item.label}
                            </NavLink>
                        ))}
                    </nav>
                    <StatusWidget />
                    <div className="p-4 border-t border-slate-100 dark:border-slate-700 space-y-2">
                         <div className="flex items-center justify-between">
                            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{user ? (user.email || 'Гость') : 'Гость'}</div>
                            <button onClick={logout} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors" title="Выйти"><Icon name="LogOut" size={16}/></button>
                        </div>
                        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 w-full hover:text-indigo-600 transition-colors">
                            {theme === 'light' ? <><Icon name="Moon" size={16} /> Темная тема</> : <><Icon name="Sun" size={16} /> Светлая тема</>}
                        </button>
                    </div>
                </div>
            </aside>
            <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-dark-950">
                <header className="lg:hidden p-4 flex items-center gap-3 bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 no-print">
                    <button onClick={() => setIsMobileMenuOpen(true)}><Icon name="Menu" size={24} /></button>
                    <span className="font-bold">Меню</span>
                </header>
                <div className="flex-1 overflow-auto p-4 lg:p-8"><Outlet /></div>
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
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Ошибка загрузки расписания</h1>
                <p className="text-slate-500 dark:text-slate-400">Публичное расписание не найдено или ссылка недействительна.</p>
            </div>
        );
    }

    return (
        <DataProvider initialData={publicData}>
            <StaticDataProvider>
                <ScheduleDataProvider>
                    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex flex-col">
                        <header className="bg-white dark:bg-dark-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-50 no-print">
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
        <AuthProvider>
            <DataProvider> 
                <StaticDataProvider>
                    <ScheduleDataProvider>
                        <HashRouter>
                            <Routes>
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                                    <Route index element={<HomeRedirect />} />
                                    
                                    {/* Dashboard: Доступно Admin и Teacher */}
                                    <Route path="dashboard" element={
                                        <ProtectedRoute allowedRoles={['admin', 'teacher']}>
                                            <DashboardPage />
                                        </ProtectedRoute>
                                    } />
                                    
                                    {/* Schedule: Доступно всем. readOnly, если не админ (1 полугодие) */}
                                    <Route path="schedule" element={
                                        <SchedulePageWrapper semester={1} />
                                    } />

                                    {/* Schedule 2: Доступно всем (2 полугодие) */}
                                    <Route path="schedule2" element={
                                        <SchedulePageWrapper semester={2} />
                                    } />
                                    
                                    {/* Остальные страницы: Только Admin */}
                                    <Route path="substitutions" element={<ProtectedRoute allowedRoles={['admin']}><SubstitutionsPage /></ProtectedRoute>} />
                                    <Route path="directory" element={<ProtectedRoute allowedRoles={['admin']}><DirectoryPage /></ProtectedRoute>} />
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
    );
}

// Вспомогательный компонент для передачи пропса readOnly
const SchedulePageWrapper = ({ semester = 1 }: { semester?: 1 | 2 }) => {
    const { role } = useAuth();
    // Редактировать может только админ
    return <SchedulePage readOnly={role !== 'admin'} semester={semester} />;
};
