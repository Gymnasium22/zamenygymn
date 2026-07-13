import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { PageId } from '../types';
import { getActiveSemester } from '../utils/helpers';
import { hapticLight, initTelegramMiniApp, isInsideTelegram } from './telegram';
import './miniapp.css';

type NavItem = { to: string; pageId: PageId; label: string; icon: string; short: string };

const ALL_NAV: NavItem[] = [
    { to: 'dashboard', pageId: 'dashboard', label: 'Главная', icon: 'Home', short: 'Главная' },
    { to: 'substitutions', pageId: 'substitutions', label: 'Замены', icon: 'Repeat', short: 'Замены' },
    { to: 'schedule', pageId: 'schedule', label: '1 полугодие', icon: 'Calendar', short: '1 пол.' },
    { to: 'schedule2', pageId: 'schedule2', label: '2 полугодие', icon: 'Calendar', short: '2 пол.' },
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

const PRIMARY_IDS: PageId[] = ['dashboard', 'substitutions', 'schedule', 'nutrition'];

export const MiniShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const { canViewPage, logout, organizationId, organizations, isSuperAdmin, switchOrganization } = useAuth();
    const { settings } = useStaticData();
    const location = useLocation();
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => {
        initTelegramMiniApp();
        document.documentElement.classList.add('tg-mini-app');
        document.body.classList.add('tg-mini-app');
        return () => {
            document.documentElement.classList.remove('tg-mini-app');
            document.body.classList.remove('tg-mini-app');
        };
    }, []);

    const allowed = useMemo(() => ALL_NAV.filter((n) => canViewPage(n.pageId)), [canViewPage]);

    const primary = useMemo(() => {
        const list: NavItem[] = [];
        for (const id of PRIMARY_IDS) {
            const item = allowed.find((a) => a.pageId === id);
            if (item) list.push(item);
            if (list.length >= 3) break;
        }
        // если мало — добиваем из allowed
        for (const a of allowed) {
            if (list.length >= 3) break;
            if (!list.some((x) => x.pageId === a.pageId)) list.push(a);
        }
        return list;
    }, [allowed]);

    const orgName =
        organizations.find((o) => o.id === organizationId)?.name || settings?.schoolName || 'Школа';

    const semester = getActiveSemester(new Date(), settings) ?? 1;
    const scheduleQuick =
        semester === 2 && canViewPage('schedule2')
            ? 'schedule2'
            : canViewPage('schedule')
              ? 'schedule'
              : canViewPage('schedule2')
                ? 'schedule2'
                : null;

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
        return ALL_NAV.find((n) => n.to === seg)?.label || 'Школа';
    }, [location.pathname]);

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
                    <button
                        type="button"
                        className="tg-shell-icon-btn"
                        title="Выйти"
                        onClick={() => {
                            hapticLight();
                            logout().then(() => navigate('/tg', { replace: true }));
                        }}
                    >
                        <Icon name="LogOut" size={18} />
                    </button>
                </div>
                {isInsideTelegram() && (
                    <div className="tg-shell-header__badge">Telegram · полная версия</div>
                )}
            </header>

            <main className="tg-shell-main">
                <div className="tg-shell-content">{children}</div>
            </main>

            {moreOpen && (
                <div className="tg-more" role="dialog" aria-label="Все разделы">
                    <button type="button" className="tg-more__backdrop" aria-label="Закрыть" onClick={() => setMoreOpen(false)} />
                    <div className="tg-more__panel">
                        <div className="tg-more__head">
                            <span>Разделы</span>
                            <button type="button" onClick={() => setMoreOpen(false)} className="tg-shell-icon-btn">
                                <Icon name="X" size={18} />
                            </button>
                        </div>
                        <div className="tg-more__grid">
                            {allowed.map((item) => (
                                <button
                                    key={item.pageId}
                                    type="button"
                                    className="tg-more__item"
                                    onClick={() => go(item.to)}
                                >
                                    <span className="tg-more__item-icon">
                                        <Icon name={item.icon} size={20} />
                                    </span>
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                        {scheduleQuick && (
                            <button type="button" className="tg-more__full" onClick={() => go(scheduleQuick)}>
                                Быстро: расписание {semester} полугодия
                            </button>
                        )}
                        <button
                            type="button"
                            className="tg-more__desktop"
                            onClick={() => {
                                hapticLight();
                                navigate('/dashboard');
                            }}
                        >
                            Открыть десктоп-версию
                        </button>
                    </div>
                </div>
            )}

            <nav className="tg-shell-nav" aria-label="Навигация">
                {primary.map((item) => (
                    <NavLink
                        key={item.pageId}
                        to={`/tg/${item.to}`}
                        onClick={() => hapticLight()}
                        className={({ isActive }) => `tg-shell-nav__item ${isActive ? 'is-active' : ''}`}
                    >
                        <Icon name={item.icon} size={20} />
                        <span>{item.short}</span>
                    </NavLink>
                ))}
                <button
                    type="button"
                    className={`tg-shell-nav__item ${moreOpen ? 'is-active' : ''}`}
                    onClick={() => {
                        hapticLight();
                        setMoreOpen((o) => !o);
                    }}
                >
                    <Icon name="Menu" size={20} />
                    <span>Ещё</span>
                </button>
            </nav>
        </div>
    );
};

export default MiniShell;
