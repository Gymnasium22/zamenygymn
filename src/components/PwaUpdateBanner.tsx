import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from './Icons';

/**
 * Баннер «доступна новая версия» для установленного PWA.
 * Не влияет на десктоп-навигацию — fixed поверх shell.
 */
export function PwaUpdateBanner() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker
    } = useRegisterSW({
        onRegisteredSW(_swUrl, registration) {
            // Периодически проверяем обновления (PWA часто «залипает» на старом SW)
            if (registration) {
                setInterval(
                    () => {
                        registration.update().catch(() => undefined);
                    },
                    60 * 60 * 1000
                );
            }
        }
    });

    if (!needRefresh) return null;

    return (
        <div
            className="fixed left-3 right-3 z-[90] flex items-center gap-3 rounded-2xl border border-indigo-200/80 bg-white/95 px-3 py-2.5 shadow-xl shadow-indigo-500/15 backdrop-blur-md dark:border-indigo-800/60 dark:bg-slate-900/95 app-mobile-pwa-update"
            role="status"
        >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                <Icon name="Download" size={18} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white">Доступна новая версия</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Обновите, чтобы получить последние исправления</p>
            </div>
            <button
                type="button"
                onClick={() => updateServiceWorker(true)}
                className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
                Обновить
            </button>
            <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                aria-label="Закрыть"
            >
                <Icon name="X" size={16} />
            </button>
        </div>
    );
}
