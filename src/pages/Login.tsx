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
        <div className="!min-h-screen mesh-gradient-bg noise-overlay flex items-center justify-center p-4 relative overflow-hidden animate-page-in">
            {/* Background Decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
            <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: '2s' }}></div>
            <div className="absolute -bottom-20 left-1/2 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: '4s' }}></div>

            <div className="float-panel rounded-3xl max-w-md w-full p-8 relative z-10 spotlight-card">
                <div className="text-center mb-8">
                    <div className="inline-flex p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-glow mb-4 spring-bounce">
                        <Icon name="GraduationCap" size={48} />
                    </div>
                    <h1 className="display-large text-slate-800 dark:text-white mb-2">
                        Управление учреждением
                    </h1>
                    <p className="text-slate-500 dark:text-slate-300 font-medium">Вход в систему</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5 animate-slide-up-fade">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 ml-1 tracking-wider">
                            Email
                        </label>
                        <div className="relative">
                            <Icon name="User" className="absolute left-4 top-3.5 text-slate-400" size={18} />
                            <input
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/50 dark:bg-white/5 dark:text-white outline-none focus-glow transition-all font-medium input-glow"
                                placeholder="Введите email"
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 ml-1 tracking-wider">
                            Пароль
                        </label>
                        <div className="relative">
                            <Icon name="Briefcase" className="absolute left-4 top-3.5 text-slate-400" size={18} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                inputMode="text"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/50 dark:bg-white/5 dark:text-white outline-none focus-glow transition-all font-medium input-glow"
                                placeholder="Введите пароль"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-3 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                                tabIndex={-1}
                            >
                                <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={18} />
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm font-bold text-center bg-red-50/50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100/50 dark:border-red-900/30 animate-shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || authLoading || (submitted && !role)}
                        className="btn-primary btn-glow w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading || authLoading || (submitted && !role) ? (
                            <Icon name="Loader" className="animate-spin" size={20} />
                        ) : (
                            <Icon name="LogOut" className="rotate-180" size={20} />
                        )}
                        {loading || (submitted && !role) ? 'Вход...' : 'Войти в систему'}
                    </button>
                </form>
            </div>

            <div className="absolute bottom-6 text-center w-full text-slate-400 dark:text-slate-500 text-xs font-medium">
                &copy; {new Date().getFullYear()} Управление учреждением. Все права защищены.
            </div>
        </div>
    );
};
