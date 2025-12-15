import { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';
// FIX: Removed Firebase v9 modular import, switched to compat/v8 syntax.
// import { signInWithEmailAndPassword } from 'firebase/auth';

export const LoginPage = () => {
    const { setGuestRole, role, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState<'select' | 'teacher' | 'admin'>('select');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Если аутентификация не в процессе загрузки и роль установлена (т.е. вход успешен),
        // перенаправляем пользователя.
        if (!authLoading && role) {
            if (role === 'admin' || role === 'teacher') {
                navigate('/dashboard');
            }
            // Для 'guest' навигация происходит в handleParentLogin
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
            }

            await auth.signInWithEmailAndPassword(loginEmail, password);
            // Навигация произойдет автоматически через useEffect после смены 'role'
            
        } catch (err) {
            console.error("Firebase Auth Error:", err);
            const errorCode = (err as { code?: string })?.code;
            
            let friendlyMessage = 'Произошла неизвестная ошибка входа.';
            switch (errorCode) {
                case 'auth/invalid-credential':
                case 'auth/wrong-password':
                case 'auth/user-not-found':
                    friendlyMessage = 'Неверный логин или пароль. Проверьте данные и попробуйте снова.';
                    break;
                case 'auth/invalid-email':
                    friendlyMessage = 'Некорректный формат email адреса.';
                    break;
                case 'auth/too-many-requests':
                    friendlyMessage = 'Слишком много попыток входа. Попробуйте позже.';
                    break;
                default:
                    friendlyMessage = 'Ошибка входа. Проверьте подключение к интернету или настройки Firebase.';
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl max-w-md w-full p-8 transition-all">
                <div className="text-center mb-8">
                    <div className="inline-flex p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400 mb-4">
                        <Icon name="GraduationCap" size={48} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white">Гимназия Pro22</h1>
                    <p className="text-slate-500 dark:text-slate-400">Выберите режим входа</p>
                </div>

                {mode === 'select' && (
                    <div className="space-y-3">
                        <button onClick={handleParentLogin} className="w-full p-4 rounded-xl border-2 border-slate-100 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 group transition-all text-left flex items-center gap-4">
                            <div className="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-lg text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform"><Icon name="Users" size={24}/></div>
                            <div>
                                <div className="font-bold text-slate-800 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Родитель / Ученик</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Только просмотр расписания</div>
                            </div>
                        </button>

                        <button onClick={() => setMode('teacher')} className="w-full p-4 rounded-xl border-2 border-slate-100 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 group transition-all text-left flex items-center gap-4">
                            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform"><Icon name="BookOpen" size={24}/></div>
                            <div>
                                <div className="font-bold text-slate-800 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-400">Учитель</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Вход по общему паролю</div>
                            </div>
                        </button>

                        <button onClick={() => setMode('admin')} className="w-full p-4 rounded-xl border-2 border-slate-100 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 group transition-all text-left flex items-center gap-4">
                            <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-lg text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform"><Icon name="Settings" size={24}/></div>
                            <div>
                                <div className="font-bold text-slate-800 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-400">Администратор</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Полный доступ (логин/пароль)</div>
                            </div>
                        </button>
                    </div>
                )}

                {mode !== 'select' && (
                    <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                        <div className="flex items-center gap-2 mb-4">
                            <button type="button" onClick={() => { setMode('select'); setError(''); }} className="p-2 -ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Icon name="ArrowRight" className="rotate-180" size={20}/></button>
                            <h2 className="font-bold text-lg dark:text-white">{mode === 'teacher' ? 'Вход для учителей' : 'Вход для администратора'}</h2>
                        </div>
                        
                        {mode === 'admin' && (
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Email</label>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 ring-indigo-500" autoFocus required />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Пароль</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 ring-indigo-500" required />
                        </div>

                        {error && <div className="text-red-500 text-sm font-bold text-center bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">{error}</div>}

                        <button type="submit" disabled={loading || authLoading} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-50">
                            {(loading || authLoading) && <Icon name="Loader" className="animate-spin" size={20}/>}
                            Войти
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};