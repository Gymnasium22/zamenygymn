import React, { useState, useEffect } from 'react';
import { authAdapter } from '../services/authAdapter';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';

export const LoginPage = () => {
    const { user, role, loading: authLoading, isBlocked, allowedPages } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!authLoading && role) {
            setLoading(false);
            setSubmitted(false);
            const firstPage = allowedPages[0] || 'dashboard';
            navigate(`/${firstPage}`);
        }
    }, [role, authLoading, allowedPages, navigate]);

    useEffect(() => {
        if (!authLoading && user && isBlocked) {
            setError('Ваш аккаунт заблокирован. Обратитесь к администратору.');
        }
    }, [authLoading, user, isBlocked]);

    useEffect(() => {
        if (submitted && !loading && !authLoading && !role) {
            if (isBlocked) {
                setError('Ваш аккаунт заблокирован. Обратитесь к администратору.');
            } else {
                setError('Не удалось получить права доступа. Проверьте, что пользователь создан в настройках.');
            }
            setSubmitted(false);
            setLoading(false);
        }
    }, [submitted, loading, authLoading, role, isBlocked]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setSubmitted(true);

        try {
            const { user: authUser, error: authError } = await authAdapter.signIn(email.trim(), password);
            if (authError) throw authError;
            if (!authUser) throw new Error('Не удалось войти');
        } catch (err) {
            logger.error('Auth Error:', err);
            setSubmitted(false);
            const errorCode = (err as { code?: string })?.code || '';

            let friendlyMessage = 'Произошла неизвестная ошибка входа.';
            if (errorCode.includes('invalid') || errorCode.includes('wrong') || errorCode.includes('not-found')) {
                friendlyMessage = 'Неверный логин или пароль.';
            } else if (errorCode.includes('email')) {
                friendlyMessage = 'Некорректный формат email.';
            } else if (errorCode.includes('too-many')) {
                friendlyMessage = 'Слишком много попыток. Подождите.';
            } else {
                friendlyMessage = 'Ошибка входа. Проверьте сеть.';
            }
            setError(friendlyMessage);
            setLoading(false);
        }
    };

    return (
        <div className="!min-h-screen mesh-gradient-bg noise-overlay flex items-center justify-center p-4 sm:p-6 relative overflow-hidden animate-page-in">
            {/* Soft ambient orbs */}
            <div className="login-2026-orb absolute -top-16 -left-10 w-80 h-80 rounded-full bg-indigo-400/40 dark:bg-indigo-500/25 animate-float" />
            <div
                className="login-2026-orb absolute top-10 -right-16 w-96 h-96 rounded-full bg-violet-400/35 dark:bg-violet-500/20 animate-float"
                style={{ animationDelay: '2s' }}
            />
            <div
                className="login-2026-orb absolute -bottom-24 left-1/3 w-[28rem] h-[28rem] rounded-full bg-fuchsia-300/30 dark:bg-fuchsia-500/15 animate-float"
                style={{ animationDelay: '4s' }}
            />

            <div className="float-panel login-2026-card max-w-[26rem] w-full p-8 sm:p-9 relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex p-3.5 rounded-2xl text-white mb-5 spring-bounce bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 shadow-[0_12px_32px_rgba(79,70,229,0.35)]">
                        <Icon name="GraduationCap" size={40} />
                    </div>
                    <h1 className="text-[1.65rem] sm:text-[1.85rem] font-bold tracking-tight text-slate-900 dark:text-white mb-1.5 leading-tight">
                        Управление учреждением
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                        Войдите, чтобы продолжить работу
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4 animate-slide-up-fade">
                    <div>
                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1.5 ml-0.5">
                            Email
                        </label>
                        <div className="relative">
                            <span
                                className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400"
                                aria-hidden
                            >
                                <Icon name="User" size={18} />
                            </span>
                            <input
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 dark:text-white outline-none transition-all font-medium input-glow"
                                placeholder="name@school.by"
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1.5 ml-0.5">
                            Пароль
                        </label>
                        <div className="relative">
                            <span
                                className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-slate-400"
                                aria-hidden
                            >
                                <Icon name="Lock" size={18} />
                            </span>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                inputMode="text"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/5 dark:text-white outline-none transition-all font-medium input-glow"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                                tabIndex={-1}
                            >
                                <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={18} />
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-600 dark:text-red-400 text-sm font-semibold text-center bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-100 dark:border-red-900/40 animate-shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || authLoading || (submitted && !role)}
                        className="btn-primary w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-1"
                    >
                        {loading || authLoading || (submitted && !role) ? (
                            <Icon name="Loader" className="animate-spin" size={20} />
                        ) : (
                            <Icon name="LogIn" size={20} />
                        )}
                        {loading || (submitted && !role) ? 'Вход…' : 'Войти'}
                    </button>
                </form>
            </div>

            <div className="absolute bottom-5 left-0 right-0 text-center text-slate-400 dark:text-slate-500 text-xs font-medium px-4">
                © {new Date().getFullYear()} Управление учреждением
            </div>
        </div>
    );
};
