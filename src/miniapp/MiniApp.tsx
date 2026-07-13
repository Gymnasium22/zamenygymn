import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAdapter } from '../services/authAdapter';
import { Icon } from '../components/Icons';
import { MiniShell } from './MiniShell';
import { getTelegramUserName, hapticLight, initTelegramMiniApp, isInsideTelegram } from './telegram';
import './miniapp.css';

/**
 * Gate Mini App:
 * — не авторизован → экран входа
 * — авторизован → компактная оболочка + <Outlet /> (все разделы)
 */
export const MiniApp: React.FC = () => {
    const { role, loading: authLoading, isBlocked, user } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const tgName = getTelegramUserName();

    useEffect(() => {
        initTelegramMiniApp();
        try {
            sessionStorage.setItem('gym_entry', 'telegram_mini');
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user && isBlocked) {
            setError('Аккаунт заблокирован. Обратитесь к администратору.');
        }
    }, [authLoading, user, isBlocked]);

    if (authLoading) {
        return (
            <div className="tg-entry">
                <div className="tg-entry__loader">
                    <div className="tg-entry__spinner" />
                    <p>Загрузка…</p>
                </div>
            </div>
        );
    }

    if (role) {
        return (
            <MiniShell>
                <Outlet />
            </MiniShell>
        );
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        hapticLight();
        try {
            const { error: authError } = await authAdapter.signIn(email.trim(), password);
            if (authError) throw authError;
        } catch {
            setError('Неверный email или пароль.');
            setLoading(false);
        }
    };

    return (
        <div className="tg-entry">
            <div className="tg-entry__bg" aria-hidden />
            <div className="tg-entry__card">
                <div className="tg-entry__brand">
                    <div className="tg-entry__logo">
                        <Icon name="GraduationCap" size={26} />
                    </div>
                    <div>
                        <h1>Управление учреждением</h1>
                        <p>
                            {isInsideTelegram()
                                ? tgName
                                    ? `${tgName} · вход`
                                    : 'Telegram Mini App'
                                : 'Мобильный вход'}
                        </p>
                    </div>
                </div>

                {error && <div className="tg-entry__error">{error}</div>}

                <form onSubmit={handleLogin} className="tg-entry__form">
                    <label className="tg-entry__label">
                        Email
                        <input
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@school.by"
                            required
                            className="tg-entry__input"
                        />
                    </label>
                    <label className="tg-entry__label">
                        Пароль
                        <div className="tg-entry__pass-wrap">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="tg-entry__input"
                            />
                            <button
                                type="button"
                                className="tg-entry__eye"
                                onClick={() => setShowPassword((v) => !v)}
                            >
                                <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={18} />
                            </button>
                        </div>
                    </label>
                    <button type="submit" className="tg-entry__submit" disabled={loading}>
                        {loading ? 'Вход…' : 'Войти'}
                    </button>
                </form>

                <p className="tg-entry__hint">
                    После входа — все разделы в компактном интерфейсе Mini App (не десктопная вёрстка).
                </p>

                <button type="button" className="tg-entry__link" onClick={() => navigate('/login')}>
                    Полная версия (ПК)
                </button>
            </div>
        </div>
    );
};

/** Редирект /tg → первый доступный раздел */
export const MiniHomeRedirect: React.FC = () => {
    const { allowedPages, role, loading } = useAuth();
    if (loading || !role) return null;
    const first =
        allowedPages.find((p) =>
            ['dashboard', 'substitutions', 'schedule', 'schedule2', 'duty', 'nutrition'].includes(p)
        ) ||
        allowedPages[0] ||
        'dashboard';
    return <Navigate to={`/tg/${first}`} replace />;
};

export default MiniApp;
