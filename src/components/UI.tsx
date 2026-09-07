import React, { useEffect, useState, useRef, useMemo, useCallback, createContext, useContext, ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { DayOfWeek, PageId, Shift } from '../types';
import { formatDateEuropean, generateId, getActiveSemester } from '../utils/helpers';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UndoBar } from './CloudSaveStatus';
import { bellsForDate } from '../utils/bellsForDate';

interface ToastData {
    id: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: ToastData[];
    addToast: (toast: Omit<ToastData, 'id'>) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const addToast = (toast: Omit<ToastData, 'id'>) => {
        const id = generateId();
        setToasts((prev) => [...prev, { ...toast, id }]);
    };

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    };

    useEffect(() => {
        const handleAppToast = (e: Event) => {
            const customEvent = e as CustomEvent<{ type?: string; title?: string; message: string }>;
            const { type = 'danger', title = 'Уведомление', message } = customEvent.detail;

            // Generate ID here to avoid dependency issues
            const id = generateId();
            setToasts((prev) => [...prev, { type: type as ToastProps['type'], title, message, id }]);
        };
        window.addEventListener('app-toast', handleAppToast);
        return () => window.removeEventListener('app-toast', handleAppToast);
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
            <UndoBar />
        </ToastContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

interface ToastContainerProps {
    toasts: Array<{
        id: string;
        type: 'success' | 'warning' | 'danger' | 'info';
        title: string;
        message?: string;
        duration?: number;
    }>;
    onRemoveToast: (id: string) => void;
}

export const ToastContainer = ({ toasts, onRemoveToast }: ToastContainerProps) => {
    const clearAllToasts = () => {
        toasts.forEach((toast) => onRemoveToast(toast.id));
    };

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-3 z-[70] flex flex-col items-end gap-2 w-[min(22rem,calc(100vw-1.5rem))] max-w-sm pointer-events-none app-mobile-toast-stack">
            {toasts.length > 1 && (
                <div className="flex justify-end w-full pointer-events-auto">
                    <button
                        onClick={clearAllToasts}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 underline transition-colors"
                    >
                        Скрыть все ({toasts.length})
                    </button>
                </div>
            )}
            {toasts.map((toast) => (
                <div key={toast.id} className="w-full pointer-events-auto">
                    <Toast
                        id={toast.id}
                        type={toast.type}
                        title={toast.title}
                        message={toast.message}
                        duration={toast.duration}
                        onClose={onRemoveToast}
                    />
                </div>
            ))}
        </div>
    );
};

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'rectangular' | 'circular';
    width?: string | number;
    height?: string | number;
    animation?: boolean;
}

export const Skeleton = ({ className = '', variant = 'text', width, height, animation = true }: SkeletonProps) => {
    const baseClasses = 'skeleton';
    const variantClasses = {
        text: 'h-4 rounded',
        rectangular: 'rounded-lg',
        circular: 'rounded-full'
    };

    const style: React.CSSProperties = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${className} ${animation ? '' : 'animate-none'}`}
            style={style}
        />
    );
};

interface SkeletonTextProps {
    lines?: number;
    className?: string;
}

export const SkeletonText = ({ lines = 3, className = '' }: SkeletonTextProps) => (
    <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }, (_, i) => (
            <Skeleton
                key={i}
                variant="text"
                width={i === lines - 1 ? '60%' : '100%'} // Last line shorter
            />
        ))}
    </div>
);

interface SkeletonCardProps {
    className?: string;
    showAvatar?: boolean;
    lines?: number;
}

export const SkeletonCard = ({ className = '', showAvatar = false, lines = 2 }: SkeletonCardProps) => (
    <div className={`modern-card p-4 ${className}`}>
        <div className="flex items-center space-x-4">
            {showAvatar && <Skeleton variant="circular" width={40} height={40} />}
            <div className="flex-1">
                <Skeleton variant="text" width="60%" className="mb-2" />
                <SkeletonText lines={lines} />
            </div>
        </div>
    </div>
);

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children?: React.ReactNode;
    /** Always-visible actions (e.g. Save) pinned under the scrollable body */
    footer?: React.ReactNode;
    maxWidth?: string;
}

interface ToastProps {
    id: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    title: string;
    message?: string;
    duration?: number;
    onClose: (id: string) => void;
}

// Глобальный Set открытых модалок для корректной блокировки скролла
const activeModals = new Set<string>();

export const Modal = ({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-lg' }: ModalProps) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);
    const modalId = useId();
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;

        // Сохраняем элемент, который был в фокусе до открытия модалки
        previousActiveElement.current = document.activeElement as HTMLElement;

        // Переносим фокус на первый интерактивный элемент внутри модалки
        const modal = modalRef.current;
        if (modal) {
            const focusable = modal.querySelector<HTMLElement>(
                'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
            );
            focusable?.focus();
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab' || !modal) return;

            const focusableElements = Array.from(
                modal.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

            if (focusableElements.length === 0) return;

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        activeModals.add(modalId);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            activeModals.delete(modalId);
            if (activeModals.size === 0) {
                document.body.style.overflow = '';
            }
            // Возвращаем фокус на элемент, который был активен до открытия
            previousActiveElement.current?.focus();
        };
    }, [isOpen, modalId]);

    if (!isOpen) return null;

    // Portal to body: inside MobileShell pages are under overflow:hidden ancestors,
    // so fixed modals were clipped and the Save footer sat under the tab bar.
    const modalTree = (
        <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/45 backdrop-blur-[6px] p-0 sm:p-3 md:p-4 animate-fade-in no-print"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className={`float-panel animate-scale-in w-full ${maxWidth} flex flex-col max-h-[min(92dvh,100%)] sm:max-h-[min(86vh,100%)] rounded-t-2xl sm:rounded-[1.25rem] transition-all duration-300 min-h-0 overflow-hidden`}
            >
                <div className="flex items-center justify-between px-5 py-3.5 sm:py-4 border-b border-slate-200/70 dark:border-slate-700/70 shrink-0 bg-white/40 dark:bg-white/[0.02]">
                    <h2 id="modal-title" className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
                    <button
                        onClick={onClose}
                        className="btn-secondary !px-2 !py-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"
                        aria-label="Закрыть"
                    >
                        <Icon name="X" size={20} />
                    </button>
                </div>
                <div className="p-5 md:p-6 overflow-y-auto overscroll-contain custom-scrollbar-2026 min-h-0 flex-1">{children}</div>
                {footer != null && (
                    <div className="px-5 py-3 sm:px-6 sm:py-4 border-t border-slate-200/70 dark:border-slate-700/70 shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modalTree, document.body);
};


export const Toast = ({ id, type, title, message, duration = 5000, onClose }: ToastProps) => {
    const [isVisible, setIsVisible] = useState(true);
    const [isExiting, setIsExiting] = useState(false);
    const [swipeX, setSwipeX] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleCloseRef = useRef<() => void>(() => {});
    const touchStartX = useRef(0);

    const handleClose = useCallback(() => {
        // Очищаем таймер при ручном закрытии
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (exitTimerRef.current) {
            clearTimeout(exitTimerRef.current);
        }

        setIsExiting(true);
        exitTimerRef.current = setTimeout(() => {
            exitTimerRef.current = null;
            setIsVisible(false);
            onClose(id);
        }, 300);
    }, [onClose, id]);

    handleCloseRef.current = handleClose;

    useEffect(() => {
        // Устанавливаем таймер только один раз при монтировании
        // Используем ref, чтобы не сбрасывать таймер при смене onClose
        timerRef.current = setTimeout(() => {
            handleCloseRef.current();
        }, duration);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            if (exitTimerRef.current) {
                clearTimeout(exitTimerRef.current);
            }
        };
    }, [duration]);

    // Mobile swipe to dismiss
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const diff = e.touches[0].clientX - touchStartX.current;
        if (diff > 0) {
            setSwipeX(diff);
        }
    };

    const handleTouchEnd = () => {
        if (swipeX > 100) {
            handleClose();
        } else {
            setSwipeX(0);
        }
    };

    if (!isVisible) return null;

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return {
                    bg: 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800',
                    icon: 'text-success-600 dark:text-success-400',
                    title: 'text-success-800 dark:text-success-200',
                    message: 'text-success-700 dark:text-success-300'
                };
            case 'warning':
                return {
                    bg: 'bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800',
                    icon: 'text-warning-600 dark:text-warning-400',
                    title: 'text-warning-800 dark:text-warning-200',
                    message: 'text-warning-700 dark:text-warning-300'
                };
            case 'danger':
                return {
                    bg: 'bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800',
                    icon: 'text-danger-600 dark:text-danger-400',
                    title: 'text-danger-800 dark:text-danger-200',
                    message: 'text-danger-700 dark:text-danger-300'
                };
            case 'info':
            default:
                return {
                    bg: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800',
                    icon: 'text-primary-600 dark:text-primary-400',
                    title: 'text-primary-800 dark:text-primary-200',
                    message: 'text-primary-700 dark:text-primary-300'
                };
        }
    };

    const styles = getTypeStyles();
    const iconName =
        type === 'success'
            ? 'CheckCircle'
            : type === 'warning'
              ? 'AlertTriangle'
              : type === 'danger'
                ? 'XCircle'
                : 'Info';

    return (
        <div
            className={`w-full max-w-full animate-slide-up-fade ${isExiting ? 'animate-fade-out' : ''}`}
            style={{
                transform: `translateX(${swipeX}px)`,
                transition: swipeX === 0 ? 'transform 0.3s ease' : 'none',
                opacity: swipeX > 50 ? 1 - (swipeX - 50) / 100 : 1,
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className={`float-panel border p-4 transition-all duration-300 ${styles.bg} ${
                type === 'success' ? 'border-emerald-200/70 dark:border-emerald-800/50' :
                type === 'danger' ? 'border-red-200/70 dark:border-red-800/50' :
                type === 'warning' ? 'border-amber-200/70 dark:border-amber-800/50' :
                'border-indigo-200/70 dark:border-indigo-800/50'
            }`}>
                <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 ${styles.icon}`}>
                        <Icon name={iconName} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-semibold ${styles.title}`}>{title}</h4>
                        {message && <p className={`text-sm mt-1 ${styles.message}`}>{message}</p>}
                    </div>
                    <button
                        onClick={handleClose}
                        className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 min-w-[36px] min-h-[36px] flex items-center justify-center"
                        aria-label="Закрыть уведомление"
                    >
                        <Icon name="X" size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ContextMenuAction {
    label: string;
    icon?: string;
    onClick: () => void;
    color?: string;
    id?: string;
}

interface ContextMenuProps {
    x: number | null;
    y: number | null;
    onClose: () => void;
    actions: ContextMenuAction[];
}

export const ContextMenu = ({ x, y, onClose, actions }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const activeIndexRef = useRef(activeIndex);
    activeIndexRef.current = activeIndex;

    useEffect(() => {
        if (x === null || y === null) return;
        setActiveIndex(0);

        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, actions.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                actions[activeIndexRef.current]?.onClick();
                onClose();
            }
        };

        window.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKey);

        return () => {
            window.removeEventListener('click', handleClick, true);
            document.removeEventListener('keydown', handleKey);
        };
    }, [x, y, onClose, actions]);

    useEffect(() => {
        buttonRefs.current[activeIndex]?.focus();
    }, [activeIndex]);

    if (x === null || y === null) return null;

    const menuW = 224;
    const menuH = Math.max(48, actions.length * 44 + 16);
    let left = x;
    let top = y;
    if (typeof window !== 'undefined') {
        if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);
        if (top + menuH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - menuH - 8);
        if (left < 8) left = 8;
        if (top < 8) top = 8;
    }

    return createPortal(
        <div
            ref={ref}
            role="menu"
            className="fixed z-[200] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-xl shadow-slate-900/10 dark:shadow-black/50 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 py-2 w-56 context-menu no-print"
            style={{ top, left }}
        >
            {actions.map((action, index) => (
                <button
                    key={action.id || action.label}
                    ref={(el) => { buttonRefs.current[index] = el; }}
                    role="menuitem"
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={(e) => {
                        e.stopPropagation();
                        action.onClick();
                        onClose();
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-bold flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all duration-150 tactile-btn ${action.color || 'text-slate-700 dark:text-slate-200'} ${index === activeIndex ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
                >
                    {action.icon && <Icon name={action.icon} size={16} />}
                    {action.label}
                </button>
            ))}
        </div>,
        document.body
    );
};

export const StatusWidget = () => {
    const { bellSchedule, settings, isSaving } = useStaticData();
    const [status, setStatus] = useState('Загрузка...');
    const [details, setDetails] = useState('');
    const [progress, setProgress] = useState(0);
    const [color, setColor] = useState('bg-slate-500');
    const [currentDayName, setCurrentDayName] = useState('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Online/offline status tracking
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const updateStatus = () => {
            const now = new Date();
            const dayIndex = now.getDay();
            const dayMap = [
                null,
                DayOfWeek.Monday,
                DayOfWeek.Tuesday,
                DayOfWeek.Wednesday,
                DayOfWeek.Thursday,
                DayOfWeek.Friday,
                null
            ];
            const todayName = dayMap[dayIndex];
            setCurrentDayName(todayName || 'Выходной');

            // Проверяем каникулы — если месяц не принадлежит ни одному семестру
            if (getActiveSemester(now, settings) === null) {
                setStatus('Каникулы');
                setDetails('Расписание неактивно');
                setColor('bg-violet-500');
                setProgress(0);
                return;
            }

            if (!todayName) {
                setStatus('Сегодня выходной');
                setDetails('Уроков нет');
                setColor('bg-slate-400');
                setProgress(0);
                return;
            }

            const timeToMin = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            };
            const minutesNow = now.getHours() * 60 + now.getMinutes();
            const resolved = bellsForDate(now, bellSchedule, settings);
            let dailyBells = resolved.bells.filter((b) => b.day === todayName);
            if (dailyBells.length === 0) dailyBells = resolved.bells.filter((b) => b.day === 'default');

            dailyBells.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

            let activeLesson = null;
            let breakInfo = null;

            for (let i = 0; i < dailyBells.length; i++) {
                const currentBell = dailyBells[i];
                const start = timeToMin(currentBell.start);
                const end = timeToMin(currentBell.end);

                if (minutesNow >= start && minutesNow < end) {
                    activeLesson = { ...currentBell, duration: end - start, passed: minutesNow - start };
                    break;
                }

                if (i < dailyBells.length - 1) {
                    const nextBell = dailyBells[i + 1];
                    const nextStart = timeToMin(nextBell.start);
                    if (minutesNow >= end && minutesNow < nextStart) {
                        const breakDuration = nextStart - end;
                        if (breakDuration > 0 && breakDuration < 60) {
                            const breakPassed = minutesNow - end;
                            const breakRemaining = nextStart - minutesNow;
                            breakInfo = {
                                nextLesson: nextBell,
                                duration: breakDuration,
                                passed: breakPassed,
                                remaining: breakRemaining
                            };
                            break;
                        }
                    }
                }
            }

            if (activeLesson) {
                setStatus(`${activeLesson.period} урок`);
                const remaining = Math.max(0, activeLesson.duration - activeLesson.passed);
                setDetails(`${activeLesson.shift === Shift.First ? '1 смена' : '2 смена'} • ост. ${remaining} мин`);
                const progressValue =
                    activeLesson.duration > 0 ? (activeLesson.passed / activeLesson.duration) * 100 : 0;
                setProgress(Math.min(100, Math.max(0, progressValue)));
                setColor('bg-indigo-600');
            } else if (breakInfo) {
                setStatus('Перемена');
                setDetails(`через ${breakInfo.remaining} мин ${breakInfo.nextLesson.period} урок`);
                setColor('bg-amber-500');
                const breakProgress = breakInfo.duration > 0 ? (breakInfo.passed / breakInfo.duration) * 100 : 0;
                setProgress(Math.min(100, Math.max(0, breakProgress)));
            } else {
                setStatus('Уроков нет');
                setDetails('Свободное время');
                setColor('bg-slate-400');
                setProgress(0);
            }
        };
        updateStatus();
        const interval = setInterval(updateStatus, 60000);
        return () => clearInterval(interval);
    }, [bellSchedule, settings]);

    return (
        <div className="glass-panel mt-auto mb-20 md:mb-4 p-4 flex flex-col gap-3 relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1 h-full ${color}`}></div>

            {/* Offline indicator - only visible when offline */}
            {!isOnline && (
                <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-xs font-bold py-1 px-3 rounded-t-2xl text-center flex items-center justify-center gap-1">
                    <Icon name="WifiOff" size={12} />
                    <span>Работаем оффлайн — данные сохранятся при подключении</span>
                </div>
            )}

            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">
                        {currentDayName}
                    </div>
                    <div className="text-lg font-black text-slate-800 dark:text-white leading-none mb-1">{status}</div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{details}</div>
                </div>
                <div
                    className={`w-8 h-8 rounded-full ${color} bg-opacity-10 dark:bg-opacity-20 flex items-center justify-center relative`}
                >
                    {isSaving && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Icon name="Loader" size={16} className="animate-spin text-indigo-600" />
                        </div>
                    )}
                    {!isOnline && !isSaving && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Icon name="WifiOff" size={16} className="text-amber-500" />
                        </div>
                    )}
                    <Icon
                        name={isSaving ? 'Loader' : !isOnline ? 'WifiOff' : color === 'bg-violet-500' ? 'Sun' : 'Clock'}
                        size={16}
                        className={
                            isSaving
                                ? 'text-indigo-600 animate-spin'
                                : !isOnline
                                  ? 'text-amber-500'
                                  : color === 'bg-indigo-600'
                                    ? 'text-indigo-600'
                                    : color === 'bg-amber-500'
                                      ? 'text-amber-500'
                                      : color === 'bg-violet-500'
                                        ? 'text-violet-500'
                                        : 'text-slate-400'
                        }
                    />
                </div>
            </div>
            {progress > 0 && (
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                    <div
                        className={`h-full ${color} transition-all duration-1000`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            )}
        </div>
    );
};

interface SelectOption {
    value: string | number;
    label: string;
}

interface SelectGroup {
    label: string;
    options: SelectOption[];
    id?: string;
}

interface SearchableSelectProps {
    options: SelectOption[] | SelectGroup[];
    value: string | number | null;
    onChange: (value: string | number) => void;
    placeholder?: string;
    groupBy?: boolean;
}

export const SearchableSelect = ({
    options,
    value,
    onChange,
    placeholder = 'Выберите...',
    groupBy
}: SearchableSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const flatOptions = groupBy ? (options as SelectGroup[]).flatMap((g) => g.options) : (options as SelectOption[]);
    const selectedLabel = flatOptions.find((o) => o.value === value)?.label || placeholder;

    const filteredOptionsGroups = groupBy
        ? (options as SelectGroup[])
              .map((g) => ({
                  ...g,
                  options: g.options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
              }))
              .filter((g) => g.options.length > 0)
        : null;

    const filteredOptionsSimple = !groupBy
        ? (options as SelectOption[]).filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : null;

    return (
        <div className="relative w-full" ref={ref}>
            <div
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white/95 dark:bg-slate-700/90 dark:text-white cursor-pointer flex justify-between items-center transition-all duration-200 hover:border-indigo-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 shadow-sm"
            >
                <span className={!value ? 'text-slate-400' : ''}>{selectedLabel}</span>
                <Icon name="Filter" size={14} className="text-slate-400 transition-transform duration-200" />
            </div>
            {isOpen && (
                <div role="listbox" className="absolute z-50 w-full mt-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-xl shadow-xl shadow-slate-900/10 dark:shadow-black/40 max-h-96 overflow-auto custom-scrollbar transition-all duration-200 animate-slide-down">
                    <div className="p-2 sticky top-0 bg-white dark:bg-slate-800 z-10 border-b border-slate-100 dark:border-slate-700/50">
                        <input
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Поиск..."
                            className="w-full bg-slate-100 dark:bg-slate-700 rounded-lg p-2 text-sm outline-none dark:text-white"
                        />
                    </div>
                    {groupBy && filteredOptionsGroups
                        ? filteredOptionsGroups.map((g) => (
                              <div key={g.id || g.label}>
                                  <div className="px-3 py-1 text-xs font-bold text-slate-400 bg-slate-50 dark:bg-slate-700/50 sticky top-10 z-0">
                                      {g.label}
                                  </div>
                                  {g.options.map((opt) => (
                                      <div
                                          role="option"
                                          aria-selected={value === opt.value}
                                          key={opt.value}
                                          onClick={() => {
                                              onChange(opt.value);
                                              setIsOpen(false);
                                              setSearch('');
                                          }}
                                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:text-slate-200 ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : ''}`}
                                      >
                                          {opt.label}
                                      </div>
                                  ))}
                              </div>
                          ))
                        : filteredOptionsSimple
                          ? filteredOptionsSimple.map((opt) => (
                                <div
                                    role="option"
                                    aria-selected={value === opt.value}
                                    key={opt.value}
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:text-slate-200 ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : ''}`}
                                >
                                    {opt.label}
                                </div>
                            ))
                          : null}
                </div>
            )}
        </div>
    );
};

interface StaggerContainerProps {
    children?: React.ReactNode;
    className?: string;
}

export const StaggerContainer = ({ children, className = '' }: StaggerContainerProps) => {
    const childrenArray = React.Children.toArray(children);
    return (
        <div className={className}>
            {childrenArray.map((child, i) => {
                const key = React.isValidElement(child) && child.key ? child.key : i;
                return (
                    <div key={key} style={{ animation: `fadeIn 0.3s ease-out forwards ${i * 0.05}s`, opacity: 0 }}>
                        {child}
                    </div>
                );
            })}
        </div>
    );
};

interface BarChartItem {
    label: string;
    value: number;
    id?: string | number;
}

interface BarChartProps {
    items: BarChartItem[];
    max: number;
    barClassName?: string;
}

export const BarChart = ({ items, max, barClassName = 'bg-indigo-500' }: BarChartProps) => {
    const safeMax = max > 0 ? max : 1;

    return (
        <div className="space-y-3">
            {items.map((item) => {
                const key = item.id ?? item.label;
                const width = Math.min(100, Math.max(0, (item.value / safeMax) * 100));

                return (
                    <div key={key} className="flex items-center gap-3 text-sm">
                        <div
                            className="w-32 truncate font-medium text-slate-700 dark:text-slate-300"
                            title={item.label}
                        >
                            {item.label}
                        </div>
                        <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${barClassName} transition-all duration-500`}
                                style={{ width: `${width}%` }}
                            ></div>
                        </div>
                        <div className="w-12 text-right font-bold text-slate-800 dark:text-slate-200">{item.value}</div>
                    </div>
                );
            })}
        </div>
    );
};

/** Единый пустой экран: иконка + текст + действие */
export const EmptyState = ({
    icon = 'Clipboard',
    title,
    description,
    actionLabel,
    onAction,
    actionTo
}: {
    icon?: string;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    actionTo?: string;
}) => (
    <div className="bg-white dark:bg-dark-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-10 sm:p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
            <Icon name={icon} size={32} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">{title}</h3>
        {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">{description}</p>
        )}
        {actionLabel && actionTo && (
            <NavLink
                to={actionTo}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition"
            >
                {actionLabel}
            </NavLink>
        )}
        {actionLabel && onAction && !actionTo && (
            <button
                type="button"
                onClick={onAction}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition"
            >
                {actionLabel}
            </button>
        )}
    </div>
);

interface BottomNavProps {
    onMenuClick: () => void;
    allowedPages?: PageId[];
}

const MORE_NAV_ITEMS: { to: string; icon: string; label: string; pageId: PageId }[] = [
    { to: '/dashboard', icon: 'Home', label: 'Рабочий стол', pageId: 'dashboard' },
    { to: '/schedule', icon: 'Calendar', label: 'Расписание', pageId: 'schedule' },
    { to: '/duty', icon: 'Shield', label: 'Дежурство', pageId: 'duty' },
    { to: '/substitutions', icon: 'Repeat', label: 'Замены', pageId: 'substitutions' },
    { to: '/nutrition', icon: 'Coffee', label: 'Питание', pageId: 'nutrition' },
    { to: '/absenteeism', icon: 'UserX', label: 'Пропуски', pageId: 'absenteeism' },
    { to: '/bells', icon: 'Bell', label: 'Звонки', pageId: 'bells' },
    { to: '/directory', icon: 'BookOpen', label: 'Справочники', pageId: 'directory' },
    { to: '/reports', icon: 'BarChart2', label: 'Отчёты', pageId: 'reports' },
    { to: '/export', icon: 'Download', label: 'Экспорт', pageId: 'export' },
    { to: '/admin', icon: 'Users', label: 'Администрация', pageId: 'admin' },
    { to: '/calendar', icon: 'Calendar', label: 'Календарь', pageId: 'calendar' },
    { to: '/planner', icon: 'CheckSquare', label: 'Планер', pageId: 'planner' },
    { to: '/settings', icon: 'Settings', label: 'Настройки', pageId: 'settings' },
    { to: '/archive', icon: 'Archive', label: 'Архив', pageId: 'archive' }
];

export const BottomNavigation = ({ onMenuClick, allowedPages = [] }: BottomNavProps) => {
    const { settings } = useStaticData();
    const canView = (page: PageId) => allowedPages.includes(page);
    const navigate = useNavigate();
    const [moreOpen, setMoreOpen] = useState(false);

    // Determine current semester for schedule navigation
    const currentSemester = getActiveSemester(new Date(), settings) ?? 1;
    const canViewSchedule1 = canView('schedule');
    const canViewSchedule2 = canView('schedule2');
    const schedulePath =
        currentSemester === 2
            ? canViewSchedule2
                ? '/schedule2'
                : '/schedule'
            : canViewSchedule1
              ? '/schedule'
              : '/schedule2';

    const handleNavClick = (path: string) => {
        // Haptic feedback for mobile (2026 standard)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(8);
        }
        navigate(path);
        setMoreOpen(false);
    };

    const navItems: { to: string; icon: string; label: string; shortLabel: string }[] = [];
    if (canView('dashboard')) {
        navItems.push({ to: '/dashboard', icon: 'Home', label: 'Рабочий', shortLabel: 'Главная' });
    }
    if (canViewSchedule1 || canViewSchedule2) {
        navItems.push({ to: schedulePath, icon: 'Calendar', label: 'Расписание', shortLabel: 'Распис.' });
    }
    if (canView('substitutions')) {
        navItems.push({ to: '/substitutions', icon: 'Repeat', label: 'Замены', shortLabel: 'Замены' });
    }
    // Максимум 3 быстрых + «Ещё»
    const quickItems = navItems.slice(0, 3);
    const moreItems = MORE_NAV_ITEMS.filter((i) => canView(i.pageId));

    return (
        <>
            {moreOpen && (
                <div className="fixed inset-0 z-[45] md:hidden" role="dialog" aria-label="Все разделы">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        aria-label="Закрыть"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className="absolute bottom-16 left-2 right-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-3 pb-4 animate-fade-in">
                        <div className="flex items-center justify-between px-2 mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Все разделы</span>
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                                <Icon name="X" size={18} />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {moreItems.map((item) => (
                                <button
                                    key={item.to}
                                    type="button"
                                    onClick={() => handleNavClick(item.to)}
                                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-200 transition"
                                >
                                    <Icon name={item.icon} size={20} className="text-indigo-600 dark:text-indigo-400" />
                                    <span className="text-[10px] font-semibold text-center leading-tight">{item.label}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setMoreOpen(false);
                                onMenuClick();
                            }}
                            className="mt-3 w-full py-2.5 text-sm font-bold text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                        >
                            Открыть боковое меню
                        </button>
                    </div>
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 bottom-nav-2026 z-40 pb-safe md:hidden transition-all duration-300 no-select safe-area-inset">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
                <div className="flex justify-around items-center h-14 sm:h-16 px-2">
                    {quickItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => handleNavClick(item.to)}
                            className={({ isActive }) =>
                                `relative flex flex-col items-center justify-center gap-0.5 p-1.5 sm:p-2 rounded-xl transition-all duration-300 flex-1 h-full ${isActive ? 'text-indigo-600 dark:text-indigo-400 bottom-nav-active' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                                        <Icon name={item.icon} size={20} strokeWidth={2.25} className="sm:w-[22px] sm:h-[22px]" />
                                    </div>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider leading-none">
                                        {item.shortLabel}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    ))}

                    <button
                        type="button"
                        onClick={() => {
                            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                                navigator.vibrate(8);
                            }
                            setMoreOpen((o) => !o);
                        }}
                        className={`relative flex flex-col items-center justify-center gap-0.5 p-1.5 sm:p-2 rounded-xl transition-all duration-300 flex-1 h-full ${
                            moreOpen
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                        <div className={`p-1.5 rounded-xl ${moreOpen ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                            <Icon name="List" size={20} strokeWidth={2.25} className="sm:w-[22px] sm:h-[22px]" />
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider leading-none">Ещё</span>
                    </button>
                </div>
            </div>
        </>
    );
};

interface Action {
    type: 'nav' | 'teacher' | 'class' | 'subject' | 'room' | 'sub' | 'quick_action';
    label: string;
    subtitle?: string;
    icon: string;
    path?: string;
    id?: string;
    subId?: string;
    shortcut?: string;
    keywords?: string[];
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
    const navigate = useNavigate();
    const { teachers, classes, subjects, rooms } = useStaticData();
    const { substitutions } = useScheduleData();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get allowed pages from auth context
    const { allowedPages, canViewPage } = useAuth();

    // Group actions
    const filteredActions = useMemo(() => {
        if (!isOpen) return [];
        const q = query.toLowerCase().trim();

        const actions: Action[] = [];

        // Navigation Actions — фильтруем по правам доступа пользователя
        const allNavItems: Array<{ label: string; icon: string; path: string; pageId: PageId }> = [
            { label: 'Рабочий стол', icon: 'Home', path: '/dashboard', pageId: 'dashboard' },
            { label: 'Расписание', icon: 'Calendar', path: '/schedule', pageId: 'schedule' },
            { label: 'Дежурство', icon: 'Shield', path: '/duty', pageId: 'duty' },
            { label: 'Замены', icon: 'Repeat', path: '/substitutions', pageId: 'substitutions' },
            { label: 'Питание', icon: 'Coffee', path: '/nutrition', pageId: 'nutrition' },
            { label: 'Пропуски', icon: 'UserX', path: '/absenteeism', pageId: 'absenteeism' },
            { label: 'Звонки', icon: 'Bell', path: '/bells', pageId: 'bells' },
            { label: 'Справочники', icon: 'BookOpen', path: '/directory', pageId: 'directory' },
            { label: 'Отчёты', icon: 'BarChart2', path: '/reports', pageId: 'reports' },
            { label: 'Экспорт', icon: 'Download', path: '/export', pageId: 'export' },
            { label: 'Администрация', icon: 'Users', path: '/admin', pageId: 'admin' },
            { label: 'Календарь', icon: 'Calendar', path: '/calendar', pageId: 'calendar' },
            { label: 'Планер', icon: 'CheckSquare', path: '/planner', pageId: 'planner' },
            { label: 'Архив', icon: 'Archive', path: '/archive', pageId: 'archive' },
            { label: 'Настройки', icon: 'Settings', path: '/settings', pageId: 'settings' }
        ];
        const canOpen = (pageId: PageId) => canViewPage(pageId);
        const canOpenAnySchedule = canOpen('schedule') || canOpen('schedule2');
        const navItems = allNavItems.filter((item) => canOpen(item.pageId));
        navItems.forEach((item) => {
            if (!q || item.label.toLowerCase().includes(q)) {
                actions.push({ type: 'nav', label: item.label, icon: item.icon, path: item.path });
            }
        });

        if (q) {
            // Smart quick actions
            if (canOpen('substitutions') && ['замена', 'заменить', 'поменять'].some(k => k.includes(q) || q.includes(k))) {
                actions.push({ type: 'nav', label: 'Создать новую замену', subtitle: 'Перейти в редактор замен', icon: 'PlusCircle', path: '/substitutions' });
            }
            if (canOpen('absenteeism') && ['болеет', 'пропуск', 'отсутствует'].some(k => k.includes(q) || q.includes(k))) {
                actions.push({ type: 'nav', label: 'Отметить отсутствие', subtitle: 'Перейти в журнал пропусков', icon: 'UserX', path: '/absenteeism' });
            }

            // Teachers
            if (canOpenAnySchedule) {
                teachers.forEach((t) => {
                    const nameMatch = t.name.toLowerCase().includes(q);
                    if (nameMatch) {
                        actions.push({ type: 'teacher', label: t.name, subtitle: 'Открыть расписание учителя', icon: 'User', id: t.id });

                        // Generate smart context actions for the teacher if query is highly specific
                        if (canOpen('absenteeism') && q.length > 3) {
                            actions.push({ type: 'quick_action', label: `Отметить отсутствие: ${t.name}`, subtitle: 'Быстрый переход в пропуски', icon: 'UserMinus', path: `/absenteeism?teacherId=${t.id}` });
                        }
                    }
                });
                // Classes
                classes.forEach((c) => {
                    if (c.name.toLowerCase().includes(q)) {
                        actions.push({ type: 'class', label: c.name, subtitle: `${c.shift} смена`, icon: 'GraduationCap', id: c.id });
                    }
                });
                // Subjects
                subjects.forEach((s) => {
                    if (s.name.toLowerCase().includes(q)) {
                        actions.push({ type: 'subject', label: s.name, subtitle: 'Предмет', icon: 'BookOpen', id: s.id });
                    }
                });
                // Rooms
                rooms.forEach((r) => {
                    if (r.name.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q)) {
                        actions.push({ type: 'room', label: `Кабинет ${r.name}`, subtitle: r.type || 'Учебный класс', icon: 'MapPin', id: r.id });
                    }
                });
            }
            // Substitutions by date
            if (canOpen('substitutions')) {
                const today = new Date().toISOString().split('T')[0];
                substitutions.forEach((s) => {
                    if (s.date.includes(q) || s.date === today) {
                        const t = teachers.find((x) => x.id === s.originalTeacherId);
                        if (t && actions.filter((a) => a.type === 'sub').length < 3) {
                            actions.push({ type: 'sub', label: `Замена ${formatDateEuropean(s.date)}`, subtitle: `Вместо: ${t.name}`, icon: 'Repeat', id: s.date });
                        }
                    }
                });
            }
        }

        return actions.slice(0, 15);
    }, [query, teachers, classes, subjects, rooms, substitutions, isOpen, canViewPage]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setActiveIndex(0);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }, [isOpen]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (filteredActions.length === 0) return;
            setActiveIndex((prev) => (prev + 1) % filteredActions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (filteredActions.length === 0) return;
            setActiveIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredActions[activeIndex]) {
                executeAction(filteredActions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const executeAction = (action: Action) => {
        const scheduleBasePath = allowedPages.includes('schedule') ? '/schedule' : '/schedule2';
        if (action.type === 'nav') {
            if (action.path) navigate(action.path);
        } else if (action.type === 'teacher') {
            navigate(`${scheduleBasePath}?view=teacher&id=${action.id}`);
        } else if (action.type === 'class') {
            navigate(`${scheduleBasePath}?view=class&id=${action.id}`);
        } else if (action.type === 'subject') {
            navigate(`${scheduleBasePath}?view=subject&id=${action.id}`);
        } else if (action.type === 'room') {
            navigate(`${scheduleBasePath}?view=room&id=${action.id}`);
        } else if (action.type === 'sub') {
            navigate(`/substitutions?date=${action.id}`);
        } else if (action.type === 'quick_action') {
            if (action.path) navigate(action.path);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            data-overlay="command-palette"
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/45 backdrop-blur-sm transition-all"
            style={{ position: 'fixed' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-xl float-panel overflow-hidden animate-scale-in mx-auto">
                <div className="flex items-center gap-3 p-4 border-b border-slate-200/70 dark:border-slate-700/70">
                    <Icon name="Search" className="text-slate-400" size={20} />
                    <input
                        ref={inputRef}
                        inputMode="search"
                        className="flex-1 bg-transparent outline-none text-base text-slate-800 dark:text-white placeholder:text-slate-400"
                        placeholder="Куда перейти? Или кого найти..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="text-xs font-bold bg-slate-100/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-lg">
                        ESC
                    </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar-2026 p-2">
                    {filteredActions.length === 0 ? (
                        <div className="ui-empty-state m-2">Нет результатов</div>
                    ) : (
                        filteredActions.map((action, idx) => (
                            <button
                                key={idx}
                                onClick={() => executeAction(action)}
                                className={`ui-list-row w-full text-left ${idx === activeIndex ? 'bg-indigo-50/70 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                                <Icon
                                    name={action.icon}
                                    size={18}
                                    className={
                                        idx === activeIndex ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                                    }
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{action.label}</div>
                                    {action.subtitle && (
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">{action.subtitle}</div>
                                    )}
                                </div>
                                {action.type !== 'nav' && action.type !== 'quick_action' && (
                                    <span className="ui-chip shrink-0 uppercase tracking-wider">
                                        {action.type}
                                    </span>
                                )}
                                {action.type === 'quick_action' && (
                                    <span className="ui-chip shrink-0 uppercase tracking-wider bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300">
                                        Действие
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
                <div className="p-2 bg-slate-50/60 dark:bg-white/5 border-t border-slate-200/70 dark:border-slate-700/70 flex justify-end gap-4 text-[10px] text-slate-400 font-medium px-4">
                    <span className="flex items-center gap-1">
                        <span className="bg-white dark:bg-white/10 px-1 rounded shadow-sm">↵</span> выбрать
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="bg-white dark:bg-white/10 px-1 rounded shadow-sm">↑↓</span> навигация
                    </span>
                </div>
            </div>
        </div>
    );
};
