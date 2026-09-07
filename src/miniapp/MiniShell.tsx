import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { PageId } from '../types';
import { getActiveSemester } from '../utils/helpers';
import { hapticLight, initTelegramMiniApp, isInsideTelegram, openExternalAppUrl } from './telegram';
import './miniapp.css';
// Reuse PWA mobile layout helpers (duty cards, page-head hide, touch actions)
import '../mobile/mobile-app.css';

type NavItem = { to: string; pageId: PageId; label: string; icon: string; short: string };

const ALL_NAV: NavItem[] = [
    { to: 'dashboard', pageId: 'dashboard', label: 'Главная', icon: 'Home', short: 'Главная' },
    { to: 'substitutions', pageId: 'substitutions', label: 'Замены', icon: 'Repeat', short: 'Замены' },
    { to: 'schedule', pageId: 'schedule', label: 'Расписание', icon: 'Calendar', short: 'Распис.' },
    { to: 'duty', pageId: 'duty', label: 'Дежурство', icon: 'Shield', short: 'Дежур.' },
    { to: 'nutrition', pageId: 'nutrition', label: 'Питание', icon: 'Coffee', short: 'Питание' },
    { to: 'absenteeism', pageId: 'absenteeism', label: 'Пропуски', icon: 'UserX', short: 'Проп.' },
    { to: 'bells', pageId: 'bells', label: 'Звонки', icon: 'Bell', short: 'Звонки' },
    { to: 'directory', pageId: 'directory', label: 'Справочники', icon: 'BookOpen', short: 'Справ.' },
    { to: 'admin', pageId: 'admin', label: 'Админ.', icon: 'Users', short: 'Админ' },
    { to: 'calendar', pageId: 'calendar', label: 'Календарь', icon: 'Calendar', short: 'Календ.' },
    { to: 'planner', pageId: 'planner', label: 'Планер', icon: 'CheckSquare', short: 'Планер' },
    { to: 'reports', pageId: 'reports', label: 'Отчёты', icon: 'BarChart2', short: 'Отчёты' },
    { to: 'export', pageId: 'export', label: 'Экспорт', icon: 'Download', short: 'Экспорт' },
    { to: 'settings', pageId: 'settings', label: 'Настройки', icon: 'Settings', short: 'Настр.' },
    { to: 'archive', pageId: 'archive', label: 'Архив', icon: 'Archive', short: 'Архив' }
];

/** Порядок вкладок: до 3 + «Ещё» (расписание = активный семестр) */
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

export const MiniShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const { canViewPage, logout, organizationId, organizations, isSuperAdmin, switchOrganization, user } =
        useAuth();
    const { settings } = useStaticData();
    const location = useLocation();
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => {
        initTelegramMiniApp();
        // tg-mini-app: mini-specific styles; app-mobile: share PWA layout CSS
        document.documentElement.classList.add('tg-mini-app', 'app-mobile');
        document.body.classList.add('tg-mini-app', 'app-mobile');
        return () => {
            document.documentElement.classList.remove('tg-mini-app', 'app-mobile');
            document.body.classList.remove('tg-mini-app', 'app-mobile');
        };
    }, []);

    useEffect(() => {
        setMoreOpen(false);
    }, [location.pathname]);

    const allowed = useMemo(() => ALL_NAV.filter((n) => canViewPage(n.pageId)), [canViewPage]);

    const semester = getActiveSemester(new Date(), settings) ?? 1;

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
            if (list.length >= 3) return;
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
            if (list.length >= 3) break;
            if (a.pageId === 'schedule' || a.pageId === 'schedule2') {
                push(scheduleNav);
            } else {
                push(a);
            }
        }
        return list;
    }, [allowed, scheduleNav]);

    const orgName =
        organizations.find((o) => o.id === organizationId)?.name ||
        settings?.schoolName ||
        'Управление учреждением';

    const go = useCallback(
        (path: string) => {
            hapticLight();
            setMoreOpen(false);
            navigate(`/tg/${path}`);
        },
        [navigate]
    );

    const title = useMemo(() => {
        const seg = location.pathname.replace(/^\/tg\/?/, '') || 'dashboard';
        if (seg === 'schedule' || seg === 'schedule2') return 'Расписание';
        return ALL_NAV.find((n) => n.to === seg)?.label || 'Школа';
    }, [location.pathname]);

    const currentSeg = location.pathname.replace(/^\/tg\/?/, '') || 'dashboard';

    const handleLogout = async () => {
        hapticLight();
        setMoreOpen(false);
        await logout();
        navigate('/tg', { replace: true });
    };

    return (
        <div className="tg-shell-root">
            <header className="tg-shell-header">
                <div className="tg-shell-header__top">
                    <div className="min-w-0 flex-1">
                        <div className="tg-shell-header__org" title={orgName}>
                            {orgName}
                        </div>
                        <div className="tg-shell-header__title">{title}</div>
                    </div>
                    {isSuperAdmin && organizations.length > 1 && (
                        <select
                            className="tg-shell-org-select"
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
                </div>
                {isInsideTelegram() && (
                    <div className="tg-shell-header__badge">Telegram Mini App</div>
                )}
            </header>

            <main className="tg-shell-main">
                <div className="tg-shell-content">{children}</div>
            </main>

            {moreOpen && (
                <div className="tg-more" role="dialog" aria-label="Все разделы">
                    <button
                        type="button"
                        className="tg-more__backdrop"
                        aria-label="Закрыть"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className="tg-more__panel">
                        <div className="tg-more__handle" aria-hidden />
                        <div className="tg-more__head">
                            <span>Разделы</span>
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="tg-shell-icon-btn"
                                aria-label="Закрыть"
                            >
                                <Icon name="X" size={18} />
                            </button>
                        </div>
                        <div className="tg-more__scroll">
                            <div className="tg-more__grid">
                                {allowed.map((item) => {
                                    const active = currentSeg === item.to;
                                    return (
                                        <button
                                            key={item.pageId}
                                            type="button"
                                            className={`tg-more__item ${active ? 'is-active' : ''}`}
                                            onClick={() => go(item.to)}
                                        >
                                            <span className="tg-more__item-icon">
                                                <Icon name={item.icon} size={20} />
                                            </span>
                                            <span>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="tg-more__footer">
                            <div className="tg-more__user" title={user?.email || ''}>
                                {user?.email || 'Гость'}
                            </div>
                            <div className="tg-more__actions">
                                <button
                                    type="button"
                                    className="tg-more__action"
                                    onClick={() => {
                                        hapticLight();
                                        openExternalAppUrl();
                                    }}
                                >
                                    <Icon name="ExternalLink" size={16} />
                                    Полная версия
                                </button>
                                <button
                                    type="button"
                                    className="tg-more__action tg-more__action--danger"
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

            <nav className="tg-shell-nav" aria-label="Навигация">
                {primary.map((item) => {
                    const active =
                        item.pageId === scheduleNav?.pageId
                            ? currentSeg === 'schedule' || currentSeg === 'schedule2'
                            : currentSeg === item.to;
                    return (
                        <NavLink
                            key={item.pageId}
                            to={`/tg/${item.to}`}
                            onClick={() => hapticLight()}
                            className={() => `tg-shell-nav__item ${active ? 'is-active' : ''}`}
                        >
                            <span className="tg-shell-nav__icon">
                                <Icon name={item.icon} size={20} />
                            </span>
                            <span>{item.short}</span>
                        </NavLink>
                    );
                })}
                <button
                    type="button"
                    className={`tg-shell-nav__item ${moreOpen ? 'is-active' : ''}`}
                    onClick={() => {
                        hapticLight();
                        setMoreOpen((o) => !o);
                    }}
                    aria-expanded={moreOpen}
                    aria-label="Ещё разделы"
                >
                    <span className="tg-shell-nav__icon">
                        <Icon name="Menu" size={20} />
                    </span>
                    <span>Ещё</span>
                </button>
            </nav>
        </div>
    );
};

export default MiniShell;
