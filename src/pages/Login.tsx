
import React, { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';

export const LoginPage = () => {
    const { setGuestRole, role, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState<'select' | 'teacher' | 'admin' | 'canteen'>('select');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!authLoading && role) {
            if (role === 'admin' || role === 'teacher' || role === 'canteen') {
                navigate('/dashboard');
            }
        }
    }, [role, authLoading, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!auth) {
            setError("Firebase недоступен. Проверьте настройки.");
            setLoading(false);
            return;
        }

        try {
            let loginEmail = email;
            
            if (mode === 'teacher') {
                loginEmail = 'teacher@gymnasium22.com';
            } else if (mode === 'canteen') {
                loginEmail = 'canteen@gymnasium22.com';
            }

            await signInWithEmailAndPassword(auth, loginEmail, password);
            
        } catch (err) {
            console.error("Firebase Auth Error:", err);
            const errorCode = (err as { code?: string })?.code;
            
            let friendlyMessage = 'Произошла неизвестная ошибка входа.';
            switch (errorCode) {
                case 'auth/invalid-credential':
                case 'auth/wrong-password':
                case 'auth/user-not-found':
                    friendlyMessage = 'Неверный логин или пароль.';
                    break;
                case 'auth/invalid-email':
                    friendlyMessage = 'Некорректный формат email.';
                    break;
                case 'auth/too-many-requests':
                    friendlyMessage = 'Слишком много попыток. Подождите.';
                    break;
                default:
                    friendlyMessage = 'Ошибка входа. Проверьте сеть.';
            }
            setError(friendlyMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleParentLogin = () => {
        setGuestRole();
        navigate('/schedule');
    };

    return (
        <div className="min-h-screen mesh-gradient-bg flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-20 left-1/2 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

            <div className="rounded-3xl shadow-2xl max-w-md w-full p-8 transition-all relative z-10 bg-white/60 dark:bg-slate-800/60 border border-white/20 dark:border-slate-700 backdrop-blur-md">
                <div className="text-center mb-8">
                    <div className="inline-flex p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30 mb-4 transform hover:scale-105 transition-transform duration-300">
                        <Icon name="GraduationCap" size={48} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight mb-2">Гимназия Pro22</h1>
                    <p className="text-slate-500 dark:text-slate-300 font-medium">Выберите режим входа</p>
                </div>

                {mode === 'select' && (
                    <div className="space-y-4 animate-fade-in">
                        <button onClick={handleParentLogin} className="w-full p-4 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-white/50 dark:border-slate-700 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-slate-800 group transition-all text-left flex items-center gap-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform"><Icon name="Users" size={24}/></div>
                            <div className="relative z-10">
                                <div className="font-bold text-slate-800 dark:text-white text-lg">Родитель / Ученик</div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Только просмотр</div>
                            </div>
                            <Icon name="ArrowRight" className="ml-auto text-slate-300 group-hover:text-emerald-500 transition-colors" size={20}/>
                        </button>

                        <button onClick={() => setMode('teacher')} className="w-full p-4 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-white/50 dark:border-slate-700 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-slate-800 group transition-all text-left flex items-center gap-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform"><Icon name="BookOpen" size={24}/></div>
                            <div className="relative z-10">
                                <div className="font-bold text-slate-800 dark:text-white text-lg">Учитель</div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Вход по общему паролю</div>
                            </div>
                            <Icon name="ArrowRight" className="ml-auto text-slate-300 group-hover:text-indigo-500 transition-colors" size={20}/>
                        </button>

                        <button onClick={() => setMode('canteen')} className="w-full p-4 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-white/50 dark:border-slate-700 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-slate-800 group transition-all text-left flex items-center gap-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="bg-green-100 dark:bg-green-900/50 p-3 rounded-xl text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform"><Icon name="Coffee" size={24}/></div>
                            <div className="relative z-10">
                                <div className="font-bold text-slate-800 dark:text-white text-lg">Столовая</div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Вход по общему паролю</div>
                            </div>
                            <Icon name="ArrowRight" className="ml-auto text-slate-300 group-hover:text-green-500 transition-colors" size={20}/>
                        </button>

                        <button onClick={() => setMode('admin')} className="w-full p-4 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-white/50 dark:border-slate-700 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-slate-800 group transition-all text-left flex items-center gap-4 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-xl text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform"><Icon name="Settings" size={24}/></div>
                            <div className="relative z-10">
                                <div className="font-bold text-slate-800 dark:text-white text-lg">Администратор</div>
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Вход по логину и паролю</div>
                            </div>
                            <Icon name="ArrowRight" className="ml-auto text-slate-300 group-hover:text-purple-500 transition-colors" size={20}/>
                        </button>
                    </div>
                )}

                {mode !== 'select' && (
                    <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
                        <div className="flex items-center gap-2 mb-6">
                            <button type="button" onClick={() => { setMode('select'); setError(''); }} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"><Icon name="ArrowRight" className="rotate-180" size={24}/></button>
                            <h2 className="font-bold text-xl dark:text-white">
                                {mode === 'teacher' ? 'Вход для учителей' :
                                 mode === 'canteen' ? 'Вход для столовой' :
                                 'Вход для администратора'}
                            </h2>
                        </div>
                        
                        {mode === 'admin' && (
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 ml-1">Email</label>
                                <div className="relative">
                                    <Icon name="User" className="absolute left-4 top-3.5 text-slate-400" size={18}/>
                                    <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50 dark:text-white outline-none focus:ring-2 ring-indigo-500/50 transition-all font-medium" placeholder="admin@school.com" autoFocus required />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2 ml-1">Пароль</label>
                            <div className="relative">
                                <Icon name="Briefcase" className="absolute left-4 top-3.5 text-slate-400" size={18}/>
                                <input type="password" inputMode="text" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50 dark:text-white outline-none focus:ring-2 ring-indigo-500/50 transition-all font-medium" placeholder="••••••••" required />
                            </div>
                        </div>

                        {error && <div className="text-red-500 text-sm font-bold text-center bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-900/50 animate-shake">{error}</div>}

                        <button type="submit" disabled={loading || authLoading} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                            {(loading || authLoading) ? <Icon name="Loader" className="animate-spin" size={20}/> : <Icon name="LogOut" className="rotate-180" size={20}/>}
                            {loading ? 'Вход...' : 'Войти в систему'}
                        </button>
                    </form>
                )}
            </div>
            
            <div className="absolute bottom-6 text-center w-full text-slate-400 dark:text-slate-500 text-xs font-medium">
                &copy; {new Date().getFullYear()} Гимназия Pro22. Все права защищены.
            </div>
        </div>
    );
};
