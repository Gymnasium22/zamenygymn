import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { PageId } from '../types';
import { getActiveSemester } from '../utils/helpers';
import './mobile-app.css';

type NavItem = {
    to: string;
    pageId: PageId;
    label: string;
    icon: string;
    short: string;
};

const ALL_NAV: NavItem[] = [
    { to: '/dashboard', pageId: 'dashboard', label: 'Рабочий стол', icon: 'Home', short: 'Главная' },
    { to: '/substitutions', pageId: 'substitutions', label: 'Замены', icon: 'Repeat', short: 'Замены' },
    { to: '/schedule', pageId: 'schedule', label: '1 полугодие', icon: 'Calendar', short: '1 пол.' },
    { to: '/schedule2', pageId: 'schedule2', label: '2 полугодие', icon: 'Calendar', short: '2 пол.' },
    { to: '/duty', pageId: 'duty', label: 'Дежурство', icon: 'Shield', short: 'Дежур.' },
    { to: '/nutrition', pageId: 'nutrition', label: 'Питание', icon: 'Coffee', short: 'Питание' },
    { to: '/absenteeism', pageId: 'absenteeism', label: 'Пропуски', icon: 'UserX', short: 'Проп.' },
    { to: '/bells', pageId: 'bells', label: 'Звонки', icon: 'Bell', short: 'Звонки' },
    { to: '/directory', pageId: 'directory', label: 'Справочники', icon: 'BookOpen', short: 'Справ.' },
    { to: '/admin', pageId: 'admin', label: 'Администрация', icon: 'Users', short: 'Админ' },
    { to: '/calendar', pageId: 'calendar', label: 'Календарь', icon: 'Calendar', short: 'Календ.' },
    { to: '/planner', pageId: 'planner', label: 'Планер', icon: 'CheckSquare', short: 'Планер' },
    { to: '/reports', pageId: 'reports', label: 'Отчёты', icon: 'BarChart2', short: 'Отчёты' },
    { to: '/export', pageId: 'export', label: 'Экспорт', icon: 'Download', short: 'Экспорт' },
    { to: '/settings', pageId: 'settings', label: 'Настройки', icon: 'Settings', short: 'Настр.' },
    { to: '/archive', pageId: 'archive', label: 'Архив', icon: 'Archive', short: 'Архив' }
];

/** Приоритет вкладок нижней панели (до 4 + «Ещё») */
const PRIMARY_ORDER: PageId[] = [
    'dashboard',
    'substitutions',
    'schedule',
    'schedule2',
    'duty',
    'nutrition',
    'absenteeism',
    'planner'
];

const haptic = () => {
    try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
    } catch {
        /* ignore */
    }
};

export type MobileShellProps = {
    children: React.ReactNode;
    onOpenAppearance: () => void;
    onOpenCommand: () => void;
};

/**
 * Полнофункциональная мобильная оболочка PWA:
 * нижние вкладки + лист «Ещё» со всеми разделами, без обрезки маршрутов.
 * Десктопный Layout не затрагивает.
 */
export const MobileShell: React.FC<MobileShellProps> = ({
    children,
    onOpenAppearance,
    onOpenCommand
}) => {
    const {
        canViewPage,
        logout,
        user,
        organizationId,
        organizations,
        isSuperAdmin,
        switchOrganization
    } = useAuth();
    const { settings } = useStaticData();
    const location = useLocation();
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => {
        document.documentElement.classList.add('app-mobile');
        document.body.classList.add('app-mobile');
        return () => {
            document.documentElement.classList.remove('app-mobile');
            document.body.classList.remove('app-mobile');
        };
    }, []);

    useEffect(() => {
        setMoreOpen(false);
    }, [location.pathname]);

    const allowed = useMemo(() => ALL_NAV.filter((n) => canViewPage(n.pageId)), [canViewPage]);

    const semester = getActiveSemester(new Date(), settings) ?? 1;

    /** Расписание в табах: активный семестр, если доступен */
    const scheduleNav = useMemo((): NavItem | null => {
        const s1 = allowed.find((a) => a.pageId === 'schedule');
        const s2 = allowed.find((a) => a.pageId === 'schedule2');
        if (semester === 2) {
            if (s2) return { ...s2, label: 'Расписание', short: 'Распис.' };
            if (s1) return { ...s1, label: 'Расписание', short: 'Распис.' };
        } else {
            if (s1) return { ...s1, label: 'Расписание', short: 'Распис.' };
            if (s2) return { ...s2, label: 'Расписание', short: 'Распис.' };
        }
        return null;
    }, [allowed, semester]);

    const primary = useMemo(() => {
        const list: NavItem[] = [];
        const push = (item: NavItem | undefined | null) => {
            if (!item) return;
            if (list.some((x) => x.pageId === item.pageId || x.to === item.to)) return;
            if (list.length >= 4) return;
            list.push(item);
        };

        for (const id of PRIMARY_ORDER) {
            if (id === 'schedule' || id === 'schedule2') {
                push(scheduleNav);
                continue;
            }
            push(allowed.find((a) => a.pageId === id) || null);
        }
        for (const a of allowed) {
            if (list.length >= 4) break;
            if (a.pageId === 'schedule' || a.pageId === 'schedule2') {
                push(scheduleNav);
            } else {
                push(a);
            }
        }
        return list;
    }, [allowed, scheduleNav]);

    const moreItems = allowed;

    const orgName =
        organizations.find((o) => o.id === organizationId)?.name ||
        settings?.schoolName ||
        'Управление учреждением';

    const currentPath = location.pathname.replace(/\/$/, '') || '/';

    const title = useMemo(() => {
        const hit = ALL_NAV.find((n) => currentPath === n.to || currentPath.endsWith(n.to));
        return hit?.label || 'Школа';
    }, [currentPath]);

    const go = useCallback(
        (path: string) => {
            haptic();
            setMoreOpen(false);
            navigate(path);
        },
        [navigate]
    );

    const handleLogout = async () => {
        haptic();
        setMoreOpen(false);
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="app-mobile-root mesh-gradient-bg">
            <header className="app-mobile-header no-print">
                <div className="app-mobile-header__row">
                    <div className="app-mobile-header__brand">
                        <div className="app-mobile-header__org" title={orgName}>
                            {orgName}
                        </div>
                        <div className="app-mobile-header__title">{title}</div>
                    </div>
                    {isSuperAdmin && organizations.length > 1 && (
                        <select
                            className="app-mobile-org-select"
                            value={organizationId || ''}
                            onChange={(e) => switchOrganization(e.target.value || null)}
                            aria-label="Организация"
                        >
                            {organizations.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <div className="app-mobile-header__actions">
                        <button
                            type="button"
                            className="app-mobile-icon-btn"
                            title="Поиск"
                            aria-label="Поиск"
                            onClick={() => {
                                haptic();
                                onOpenCommand();
                            }}
                        >
                            <Icon name="Search" size={20} />
                        </button>
                        <button
                            type="button"
                            className="app-mobile-icon-btn"
                            title="Оформление"
                            aria-label="Оформление"
                            onClick={() => {
                                haptic();
                                onOpenAppearance();
                            }}
                        >
                            <Icon name="Sun" size={20} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="app-mobile-main">
                <div className="app-mobile-content custom-scrollbar-2026">{children}</div>
            </main>

            {moreOpen && (
                <div className="app-mobile-more no-print" role="dialog" aria-label="Все разделы">
                    <button
                        type="button"
                        className="app-mobile-more__backdrop"
                        aria-label="Закрыть"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className="app-mobile-more__panel">
                        <div className="app-mobile-more__handle" aria-hidden />
                        <div className="app-mobile-more__head">
                            <span>Все разделы</span>
                            <button
                                type="button"
                                className="app-mobile-icon-btn"
                                onClick={() => setMoreOpen(false)}
                                aria-label="Закрыть"
                            >
                                <Icon name="X" size={18} />
                            </button>
                        </div>
                        <div className="app-mobile-more__scroll">
                            <div className="app-mobile-more__grid">
                                {moreItems.map((item) => {
                                    const active = currentPath === item.to;
                                    return (
                                        <button
                                            key={item.pageId}
                                            type="button"
                                            className={`app-mobile-more__item ${active ? 'is-active' : ''}`}
                                            onClick={() => go(item.to)}
                                        >
                                            <span className="app-mobile-more__item-icon">
                                                <Icon name={item.icon} size={20} />
                                            </span>
                                            <span>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="app-mobile-more__footer">
                            <div className="app-mobile-more__user" title={user?.email || ''}>
                                {user?.email || 'Гость'}
                            </div>
                            <div className="app-mobile-more__actions">
                                <button
                                    type="button"
                                    className="app-mobile-more__action"
                                    onClick={() => {
                                        haptic();
                                        setMoreOpen(false);
                                        onOpenAppearance();
                                    }}
                                >
                                    <Icon name="Settings" size={16} />
                                    Тема
                                </button>
                                <button
                                    type="button"
                                    className="app-mobile-more__action app-mobile-more__action--danger"
                                    onClick={handleLogout}
                                >
                                    <Icon name="LogOut" size={16} />
                                    Выйти
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <nav className="app-mobile-nav no-print" aria-label="Навигация">
                {primary.map((item) => {
                    const active =
                        item.pageId === scheduleNav?.pageId
                            ? currentPath === '/schedule' || currentPath === '/schedule2'
                            : currentPath === item.to;
                    return (
                        <NavLink
                            key={item.pageId}
                            to={item.to}
                            onClick={() => haptic()}
                            className={() => `app-mobile-nav__item ${active ? 'is-active' : ''}`}
                        >
                            <span className="app-mobile-nav__icon">
                                <Icon name={item.icon} size={20} strokeWidth={active ? 2.4 : 2} />
                            </span>
                            <span>{item.short}</span>
                        </NavLink>
                    );
                })}
                <button
                    type="button"
                    className={`app-mobile-nav__item ${moreOpen ? 'is-active' : ''}`}
                    onClick={() => {
                        haptic();
                        setMoreOpen((o) => !o);
                    }}
                    aria-expanded={moreOpen}
                    aria-label="Ещё разделы"
                >
                    <span className="app-mobile-nav__icon">
                        <Icon name="Menu" size={20} />
                    </span>
                    <span>Ещё</span>
                </button>
            </nav>
        </div>
    );
};

export default MobileShell;
