import React, { useState, useEffect } from 'react';
import { authAdapter } from '../services/authAdapter';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';

export const LoginPage = () => {
    const { role, loading: authLoading, isBlocked } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (!authLoading && role) {
            navigate('/dashboard');
        }
    }, [role, authLoading, navigate]);

    useEffect(() => {
        if (submitted && !authLoading && !role) {
            if (isBlocked) {
                setError('Ваш аккаунт заблокирован. Обратитесь к администратору.');
            } else {
                setError('Не удалось получить права доступа. Проверьте, что пользователь создан в настройках.');
            }
            setSubmitted(false);
        }
    }, [submitted, authLoading, role, isBlocked]);

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
        <div className="!min-h-screen mesh-gradient-bg flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-20 left-1/2 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

            <div className="rounded-3xl shadow-2xl max-w-md w-full p-8 transition-all relative z-10 bg-white/60 dark:bg-slate-800/60 border border-white/20 dark:border-slate-700 backdrop-blur-md">
                <div className="text-center mb-8">
                    <div className="inline-flex p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30 mb-4 transform hover:scale-105 transition-transform duration-300">
                        <Icon name="GraduationCap" size={48} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight mb-2">
                        Гимназия Pro22
                    </h1>
                    <p className="text-slate-500 dark:text-slate-300 font-medium">Вход в систему</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 ml-1">
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
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50 dark:text-white outline-none focus:ring-2 ring-indigo-500/50 transition-all font-medium"
                                placeholder="Введите email"
                                autoFocus
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 ml-1">
                            Пароль
                        </label>
                        <div className="relative">
                            <Icon name="Briefcase" className="absolute left-4 top-3.5 text-slate-400" size={18} />
                            <input
                                type="password"
                                inputMode="text"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50 dark:text-white outline-none focus:ring-2 ring-indigo-500/50 transition-all font-medium"
                                placeholder="Введите пароль"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm font-bold text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/50 animate-shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || authLoading || (submitted && !role)}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
                &copy; {new Date().getFullYear()} Гимназия Pro22. Все права защищены.
            </div>
        </div>
    );
};
