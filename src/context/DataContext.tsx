import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    AppData,
    Shift,
    StaticAppData,
    ScheduleAndSubstitutionData,
    ScheduleItem,
    ScheduleAndSubstitutionDataFields,
    AuditLogEntry
} from '../types';
import { INITIAL_DATA, DEFAULT_BELLS, DEFAULT_DUTY_ZONES, getInitialData } from '../constants';
import { dbService } from '../services/db';
import { supabaseDbService } from '../services/dbSupabase';
import { isSupabase } from '../services/dbProvider';
import { useAuth } from './AuthContext';
import { getActiveSemester, generateId } from '../utils/helpers';
import { produce } from 'immer';
import { auditLog } from '../services/auditLog';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';
import { logger } from '../utils/logger';

interface FullDataContextType {
    data: AppData;
    isLoading: boolean;
    isSaving: boolean;
    saveData: (newData: Partial<AppData>, addToHistory?: boolean) => Promise<void>;
    resetData: () => Promise<void>;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

interface DataMetaContextType {
    isLoading: boolean;
    isSaving: boolean;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    resetData: () => Promise<void>;
}

const FullDataContext = createContext<FullDataContextType | undefined>(undefined);
const DataMetaContext = createContext<DataMetaContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'gym_data_local_backup_v2';
const PERSISTENT_QUEUE_KEY = 'gym_sync_queue_backup';
const getLocalStorageKey = (organizationId: string | null | undefined) =>
    organizationId ? `${LOCAL_STORAGE_KEY}_${organizationId}` : LOCAL_STORAGE_KEY;
const getQueueKey = (organizationId: string | null | undefined) =>
    organizationId ? `${PERSISTENT_QUEUE_KEY}_${organizationId}` : PERSISTENT_QUEUE_KEY;


// Вспомогательные функции для безопасной работы с localStorage
const isLocalStorageAvailable = (): boolean => {
    try {
        const test = '__localStorage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch {
        return false;
    }
};

// Очередь отложенной синхронизации
const syncQueue = {
    items: [] as Array<{
        id: string;
        data: Partial<AppData>;
        timestamp: number;
        retryCount: number;
    }>,
    isProcessing: false,

    load: (queueKey?: string) => {
        const stored = safeLocalStorageGet(queueKey || PERSISTENT_QUEUE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    syncQueue.items = parsed;
                }
            } catch (e) {
                logger.warn('Failed to parse persistent sync queue', e);
            }
        }
    },

    save: (queueKey?: string) => {
        try {
            safeLocalStorageSet(queueKey || PERSISTENT_QUEUE_KEY, JSON.stringify(syncQueue.items));
        } catch (e) {
            logger.warn('Failed to save sync queue', e);
        }
    },

    add: (data: Partial<AppData>, queueKey?: string) => {
        const MAX_QUEUE_SIZE = 50;
        if (syncQueue.items.length >= MAX_QUEUE_SIZE) {
            const dropped = syncQueue.items.length - MAX_QUEUE_SIZE + 1;
            syncQueue.items = syncQueue.items.slice(-(MAX_QUEUE_SIZE - 1));
            logger.warn(`Sync queue exceeded ${MAX_QUEUE_SIZE} items. Dropped ${dropped} oldest item(s).`);
        }
        const id = generateId();
        syncQueue.items.push({
            id,
            data,
            timestamp: Date.now(),
            retryCount: 0
        });
        syncQueue.save(queueKey);
    },

    process: async (dataProvider: { save: (data: Partial<AppData>, user?: { email?: string | null } | null, organizationId?: string | null) => Promise<void> }, user: { email?: string | null }, organizationId?: string | null) => {
        if (syncQueue.isProcessing || !navigator.onLine) return;

        syncQueue.isProcessing = true;
        const itemsToRemove: string[] = [];

        try {
            for (const item of syncQueue.items) {
                if (!navigator.onLine) break; // Останавливаемся, если сеть пропала

                try {
                    await dataProvider.save(item.data, user, organizationId);
                    itemsToRemove.push(item.id);
                } catch (error: unknown) {
                    item.retryCount++;
                    // Если ошибка квоты, оставляем в очереди но не удаляем
                    const err = error as { code?: string; message?: string };
                    if (err.code === 'resource-exhausted') {
                        logger.warn('Quota exhausted, keeping item in queue:', item.id);
                        break; // Stop processing to avoid spamming
                    }

                    if (item.retryCount >= 10) {
                        // Increased from 3 to 10 for better resilience
                        logger.error('Не удалось синхронизировать после 10 попыток:', item.id);
                        itemsToRemove.push(item.id); // Удаляем после 10 попыток
                    }
                }
            }
        } finally {
            if (itemsToRemove.length > 0) {
                syncQueue.items = syncQueue.items.filter((item) => !itemsToRemove.includes(item.id));
                syncQueue.save(getQueueKey(organizationId));
            }
            syncQueue.isProcessing = false;

            if (syncQueue.items.length > 0 && navigator.onLine) {
                // Если остались элементы и сеть есть, попробуем снова через 5 секунд
                setTimeout(() => syncQueue.process(dataProvider, user, organizationId), 5000);
            }
        }
    }
};

// Единообразная обработка ошибок
const handleError = {
    log: (message: string, error?: unknown) => {
        logger.error(message, error);
    },

    warn: (message: string, error?: unknown) => {
        logger.warn(message, error);
    },

    alert: (message: string, error?: unknown) => {
        logger.error(message, error);
        window.dispatchEvent(
            new CustomEvent('app-toast', {
                detail: { type: 'danger', title: 'Ошибка', message }
            })
        );
    },

    firebase: (error: unknown, context: string) => {
        const err = error as { code?: string; message?: string };
        const code = err.code;
        let message = 'Произошла неизвестная ошибка.';

        switch (code) {
            case 'resource-exhausted':
                message = 'Превышен лимит запросов к базе данных.';
                break;
            case 'permission-denied':
                message = 'Недостаточно прав доступа.';
                break;
            case 'unavailable':
                message = 'Сервис временно недоступен. Попробуйте позже.';
                break;
            case 'deadline-exceeded':
                message = 'Превышено время ожидания ответа.';
                break;
            default:
                message = `Ошибка ${context}: ${err.message || 'Неизвестная ошибка'}`;
        }

        logger.error(`Firebase ${context}:`, error);
        window.dispatchEvent(
            new CustomEvent('app-toast', {
                detail: { type: 'danger', title: 'Ошибка Firebase', message }
            })
        );
    },

    firebaseOffline: (error: unknown, context: string, data: Partial<AppData>, organizationId?: string | null) => {
        // Для мобильных устройств показываем более мягкое сообщение
        const isMobile = window.innerWidth < 768;
        const message = isMobile
            ? `Сохранено локально. Синхронизируется при подключении к сети.`
            : `Ошибка ${context}. Данные сохранены локально и будут синхронизированы при восстановлении соединения.`;

        logger.warn(`Firebase ${context} (оффлайн):`, error);

        window.dispatchEvent(
            new CustomEvent('app-toast', {
                detail: { type: 'warning', title: 'Оффлайн режим', message }
            })
        );

        // Добавляем в очередь синхронизации
        syncQueue.add(data, getQueueKey(organizationId));
    }
};

export const DataProvider: React.FC<{ children: React.ReactNode; initialData?: AppData }> = ({
    children,
    initialData
}) => {
    const dataProvider = isSupabase ? supabaseDbService : dbService;
    
    const [data, setInternalData] = useState<AppData>(getInitialData());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<AppData[]>([]);
    const [historyPointer, setHistoryPointer] = useState(-1);

    // Refs для предотвращения race condition при быстрых последовательных сохранениях
    const dataRef = useRef(data);
    const historyRef = useRef(history);
    const historyPointerRef = useRef(historyPointer);
    dataRef.current = data;
    historyRef.current = history;
    historyPointerRef.current = historyPointer;

    // Получаем user и role для проверки прав
    const { user, role, loading: authLoading, organizationId } = useAuth();
    const userId = user?.id ?? null;

    // Загрузка данных
    useEffect(() => {
        console.log('[DataContext] Loading effect triggered. initialData:', !!initialData, 'authLoading:', authLoading, 'userId:', userId);

        // Initialize sync queue from storage
        syncQueue.load(getQueueKey(organizationId));

        // 1. Если переданы начальные данные (публичный вид)
        if (initialData) {
            console.log('[DataContext] Using initialData');
            setInternalData(initialData);
            setHistory([initialData]);
            setHistoryPointer(0);
            setIsLoading(false);
            return;
        }

        // Ждем инициализации аутентификации
        if (authLoading) {
            console.log('[DataContext] Waiting for auth...');
            return;
        }

        if (isSupabase && !organizationId) {
            console.log('[DataContext] Waiting for organization...');
            return;
        }

        // 2. Пытаемся загрузить локальную копию сразу, чтобы пользователь что-то видел
        let localBackup: string | null = null;
        if (isLocalStorageAvailable()) {
            localBackup = safeLocalStorageGet(getLocalStorageKey(organizationId));
            if (localBackup) {
                try {
                    const parsed = JSON.parse(localBackup);
                    // Простая валидация
                    if (parsed && parsed.teachers) {
                        setInternalData((prev) => ({ ...prev, ...parsed }));
                    }
                } catch (e) {
                    handleError.log('Error parsing local backup', e);
                }
            }
        }

        if (!user) {
            console.log('[DataContext] No user, clearing data');
            setInternalData(getInitialData());
            setIsLoading(false);
            return;
        }

        console.log('[DataContext] Starting data subscription...');
        setIsLoading(true);

        // 3. Подписываемся на Firebase
        let unsubscribe: (() => void) | undefined;
        try {
            unsubscribe = dataProvider.subscribe(
                (loaded) => {
                    console.log('[DataContext] Data loaded from provider:', Object.keys(loaded));
                    setInternalData((prevData) => {
                        // Merge incoming partial data with previous data (which contains localStorage data)
                        // This prevents overwriting existing data with empty defaults if a collection fails to load
                        const fixedData = { ...prevData, ...loaded };

                        // Нормализация данных (ensure arrays are not undefined if they were missing in both prev and loaded)
                        if (!fixedData.teachers) fixedData.teachers = [];
                        // Fix: apply defaults safely to avoid overwriting or TS warnings
                        fixedData.teachers = fixedData.teachers.map((t) => ({
                            telegramChatId: '',
                            ...t,
                            shifts: t.shifts || [Shift.First, Shift.Second]
                        }));

                        if (!fixedData.schedule) fixedData.schedule = [];
                        if (!fixedData.schedule2) fixedData.schedule2 = [];
                        if (!fixedData.substitutions) fixedData.substitutions = [];
                        if (!fixedData.bellSchedule) fixedData.bellSchedule = DEFAULT_BELLS;
                        if (!fixedData.dutyZones || fixedData.dutyZones.length === 0)
                            fixedData.dutyZones = DEFAULT_DUTY_ZONES;
                        if (!fixedData.dutySchedule) fixedData.dutySchedule = [];
                        if (!fixedData.nutritionRecords) fixedData.nutritionRecords = [];
                        if (!fixedData.absenteeismRecords) fixedData.absenteeismRecords = [];

                        if (!fixedData.settings) fixedData.settings = INITIAL_DATA.settings;
                        else fixedData.settings = { ...INITIAL_DATA.settings, ...fixedData.settings };

                        if (!fixedData.privateSettings) fixedData.privateSettings = INITIAL_DATA.privateSettings;
                        else
                            fixedData.privateSettings = {
                                ...INITIAL_DATA.privateSettings,
                                ...fixedData.privateSettings
                            };

                        // Apply pending changes on top of server data ONLY for fields not returned by the server
                        // This prevents stale sync-queue items from overwriting fresher server data on reload
                        if (syncQueue.items.length > 0) {
                            syncQueue.items.forEach((item) => {
                                Object.keys(item.data).forEach((key) => {
                                    if ((loaded as Record<string, unknown>)[key] === undefined) {
                                        (fixedData as Record<string, unknown>)[key] = (item.data as Record<string, unknown>)[key];
                                    }
                                });
                            });
                        }

                        // Обновляем локальный бэкап актуальными данными из облака
                        if (isLocalStorageAvailable()) {
                            safeLocalStorageSet(getLocalStorageKey(organizationId), JSON.stringify(fixedData));
                        }

                        // Update history inside the callback to access the latest state
                        setHistory((prev) => {
                            if (prev.length === 0) return [fixedData];
                            // Optional: Append to history if significant change?
                            // For now, let's just keep history consistent with current data if it's the first load
                            return prev;
                        });

                        return fixedData;
                    });

                    setIsLoading(false);
                    console.log('[DataContext] isLoading set to false');
                },
                (error) => {
                    console.error('[DataContext] Data subscription error:', error);
                    handleError.log('Failed to subscribe to data:', error);
                    // Если ошибка квоты или сети - мы уже загрузили localBackup выше, так что данные не пропадут
                    setIsLoading(false);
                    console.log('[DataContext] isLoading set to false (error)');
                },
                organizationId
            );
        } catch (error) {
            console.error('[DataContext] Failed to initialize subscription:', error);
            handleError.log('Failed to initialize subscription:', error);
            setIsLoading(false);
            unsubscribe = undefined;
            console.log('[DataContext] isLoading set to false (catch)');
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [initialData, userId, user, role, authLoading, organizationId, dataProvider]);

    const saveData = useCallback(
        async (newData: Partial<AppData>, addToHistory = true) => {
            setIsSaving(true);

            try {
                // Используем refs для получения актуального состояния
                // и предотвращения race condition при быстрых последовательных вызовах
                const currentData = dataRef.current;
                const currentHistory = historyRef.current;
                const currentPointer = historyPointerRef.current;

                // 1. Оптимистичное обновление интерфейса (сразу меняем стейт)
                // Используем Immer для structural sharing — экономим память в истории
                const mergedData = produce(currentData, (draft) => {
                    Object.assign(draft, newData);
                });
                setInternalData(mergedData);
                dataRef.current = mergedData;

                // 2. Всегда сохраняем в LocalStorage как резерв
                if (isLocalStorageAvailable()) {
                    safeLocalStorageSet(getLocalStorageKey(organizationId), JSON.stringify(mergedData));
                }

                // 2.5. Оповещаем другие вкладки
                if ('BroadcastChannel' in window) {
                    const channel = new BroadcastChannel('gym_data_sync');
                    channel.postMessage({ type: 'data-updated', timestamp: Date.now() });
                    channel.close();
                }

                // 3. Пробуем отправить в облако (только для авторизованных и не для публичных данных)
                if (!initialData && user) {
                    try {
                        await dataProvider.save(newData, user, organizationId);
                    } catch (dbError: unknown) {
                        const err = dbError as { code?: string; details?: string; message?: string };
                        const isDataError =
                            err.code === '23503' ||
                            err.code === '23505' ||
                            err.code === 'PGRST204' ||
                            err.message?.includes('Could not find') ||
                            err.message?.includes('Conflict') ||
                            err.message?.includes('violates foreign key');
                        if (isDataError) {
                            handleError.log('Data validation error (not queued):', dbError);
                            const isSchemaError = err.code === 'PGRST204' || err.message?.includes('Could not find');
                            window.dispatchEvent(
                                new CustomEvent('app-toast', {
                                    detail: {
                                        type: 'danger',
                                        title: 'Ошибка сохранения',
                                        message: isSchemaError
                                            ? 'В базе данных отсутствуют необходимые колонки. Выполните SQL-миграцию из supabase/migrations/20260629190000_add_settings_columns.sql и перезагрузите страницу.'
                                            : 'Данные содержат конфликт или нарушение целостности. Проверьте связанные записи (классы, расписание) и попробуйте снова.'
                                    }
                                })
                            );
                            // Пробрасываем ошибку целостности данных, чтобы вызывающий код мог остановиться
                            // и не продолжал цепочку зависимых сохранений (например, импорт schedule → substitutions).
                            throw dbError;
                        } else {
                            // При ошибке Firestore добавляем в очередь синхронизации вместо отката
                            handleError.firebaseOffline(dbError, 'сохранения данных', newData, organizationId);
                            // НЕ откатываем интерфейс - данные остались в localStorage и будут синхронизированы позже
                        }
                    }
                }

                // 4. Audit log
                if (user) {
                    const entityMap: Record<string, AuditLogEntry['entityType']> = {
                        schedule: 'schedule', schedule2: 'schedule', subjects: 'subject',
                        teachers: 'teacher', classes: 'class', rooms: 'room',
                        substitutions: 'substitution', dutySchedule: 'duty',
                        nutritionRecords: 'nutrition', absenteeismRecords: 'absenteeism',
                        settings: 'settings', bellSchedule: 'bells'
                    };
                    Object.keys(newData).forEach((key) => {
                        if (entityMap[key]) {
                            auditLog.log(
                                user.email || user.id || 'unknown',
                                role || 'unknown',
                                'update',
                                entityMap[key],
                                key,
                                `Изменено ${key}`,
                                organizationId
                            );
                        }
                    });
                }

                if (addToHistory) {
                    const newHistory = currentHistory.slice(0, currentPointer + 1);
                    newHistory.push(mergedData);

                    // History management: keep reasonable limit to prevent memory bloat
                    const MAX_HISTORY = 20;
                    let newPointer: number;
                    if (newHistory.length > MAX_HISTORY) {
                        // Remove oldest items, keep the most recent MAX_HISTORY
                        const itemsToRemove = newHistory.length - MAX_HISTORY;
                        newHistory.splice(0, itemsToRemove);
                        // Корректируем указатель с учётом удалённых элементов:
                        // новый элемент находился на индексе currentPointer + 1,
                        // после удаления itemsToRemove элементов с начала его индекс сдвигается
                        newPointer = Math.max(0, currentPointer + 1 - itemsToRemove);
                    } else {
                        newPointer = newHistory.length - 1;
                    }

                    setHistory(newHistory);
                    historyRef.current = newHistory;
                    setHistoryPointer(newPointer);
                    historyPointerRef.current = newPointer;
                }
            } finally {
                setIsSaving(false);
            }
        },
        [user, role, initialData, organizationId, dataProvider]
    );

    // Автоматическая синхронизация при восстановлении сети
    useEffect(() => {
        const handleOnline = () => {
            if (syncQueue.items.length > 0 && user && !initialData) {
                syncQueue.process(dataProvider, user, organizationId);
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [user, role, initialData, dataProvider, organizationId]);

    // BroadcastChannel: синхронизация между вкладками
    useEffect(() => {
        if (!('BroadcastChannel' in window)) return;
        const channel = new BroadcastChannel('gym_data_sync');
        channel.onmessage = (event) => {
            if (event.data?.type === 'data-updated') {
                window.dispatchEvent(
                    new CustomEvent('app-toast', {
                        detail: {
                            type: 'info',
                            title: 'Синхронизация',
                            message: 'Данные обновлены в другой вкладке. Перезагрузите страницу для актуальных данных.'
                        }
                    })
                );
            }
        };
        return () => channel.close();
    }, []);

    const undo = useCallback(async () => {
        const prev = historyPointerRef.current;
        if (prev > 0) {
            const prevData = historyRef.current[prev - 1];
            setInternalData(prevData);
            dataRef.current = prevData;
            setHistoryPointer(prev - 1);
            historyPointerRef.current = prev - 1;
            // Сохраняем локально
            if (isLocalStorageAvailable()) {
                safeLocalStorageSet(getLocalStorageKey(organizationId), JSON.stringify(prevData));
            }

            if (!initialData && user) {
                try {
                    dataProvider.save(prevData, user, organizationId).catch((e) => handleError.firebase(e, 'отмены изменений'));
                } catch (e) {
                    handleError.firebase(e, 'отмены изменений');
                }
            }
        }
    }, [initialData, user, organizationId, dataProvider]);

    const redo = useCallback(async () => {
        const prev = historyPointerRef.current;
        if (prev < historyRef.current.length - 1) {
            const nextData = historyRef.current[prev + 1];
            setInternalData(nextData);
            dataRef.current = nextData;
            setHistoryPointer(prev + 1);
            historyPointerRef.current = prev + 1;
            // Сохраняем локально
            if (isLocalStorageAvailable()) {
                safeLocalStorageSet(getLocalStorageKey(organizationId), JSON.stringify(nextData));
            }

            if (!initialData && user) {
                try {
                    dataProvider.save(nextData, user, organizationId).catch((e) => handleError.firebase(e, 'повтора изменений'));
                } catch (e) {
                    handleError.firebase(e, 'повтора изменений');
                }
            }
        }
    }, [initialData, user, organizationId, dataProvider]);

    const resetData = useCallback(async () => {
        await saveData(getInitialData());
    }, [saveData]);

    const contextValue = useMemo(
        () => ({
            data,
            isLoading,
            isSaving,
            saveData,
            resetData,
            undo,
            redo,
            canUndo: historyPointer > 0,
            canRedo: historyPointer < history.length - 1
        }),
        [data, isLoading, isSaving, saveData, resetData, undo, redo, historyPointer, history.length]
    );

    const metaContextValue = useMemo(
        () => ({
            isLoading,
            isSaving,
            undo,
            redo,
            canUndo: historyPointer > 0,
            canRedo: historyPointer < history.length - 1,
            resetData
        }),
        [isLoading, isSaving, undo, redo, historyPointer, history.length, resetData]
    );

    return (
        <FullDataContext.Provider value={contextValue}>
            <DataMetaContext.Provider value={metaContextValue}>{children}</DataMetaContext.Provider>
        </FullDataContext.Provider>
    );
};

const useFullData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error('useFullData must be used within DataProvider');
    return context;
};

interface StaticDataContextType extends StaticAppData {
    saveStaticData: (newData: Partial<StaticAppData>, addToHistory?: boolean) => Promise<void>;
}

interface ScheduleContextType extends ScheduleAndSubstitutionData {
    saveScheduleData: (newData: Partial<ScheduleAndSubstitutionData>, addToHistory?: boolean) => Promise<void>;
}

const StaticDataContext = createContext<StaticDataContextType | undefined>(undefined);
const ScheduleDataContext = createContext<ScheduleContextType | undefined>(undefined);

export const StaticDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data, saveData } = useFullData();

    const staticData: StaticAppData = useMemo(
        () => ({
            subjects: data.subjects,
            teachers: data.teachers,
            classes: data.classes,
            rooms: data.rooms,
            bellSchedule: data.bellSchedule,
            settings: data.settings,
            privateSettings: data.privateSettings,
            dutyZones: data.dutyZones
        }),
        [
            data.subjects,
            data.teachers,
            data.classes,
            data.rooms,
            data.bellSchedule,
            data.settings,
            data.privateSettings,
            data.dutyZones
        ]
    );

    const saveStaticData = useCallback(
        async (newData: Partial<StaticAppData>, addToHistory?: boolean) => {
            await saveData(newData, addToHistory);
        },
        [saveData]
    );

    const contextValue = useMemo(
        () => ({
            ...staticData,
            saveStaticData
        }),
        [staticData, saveStaticData]
    );

    return <StaticDataContext.Provider value={contextValue}>{children}</StaticDataContext.Provider>;
};

export const ScheduleDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data, saveData } = useFullData();

    // Определяем текущий семестр на основе унифицированной функции
    const now = new Date();
    const currentSemester = getActiveSemester(now, data.settings);
    const activeSchedule = useMemo(() => {
        if (currentSemester === null) return [];
        return currentSemester === 2 ? data.schedule2 || [] : data.schedule || [];
    }, [currentSemester, data.schedule, data.schedule2]);

    const saveSemesterSchedule = useCallback(
        async (semester: 1 | 2, newData: ScheduleItem[]) => {
            if (semester === 1) {
                await saveData({ schedule: newData });
            } else {
                await saveData({ schedule2: newData });
            }
        },
        [saveData]
    );

    const saveScheduleData = useCallback(
        async (newData: Partial<ScheduleAndSubstitutionDataFields>, addToHistory?: boolean) => {
            await saveData(newData, addToHistory);
        },
        [saveData]
    );

    const scheduleData: ScheduleAndSubstitutionData = useMemo(
        () => ({
            schedule: activeSchedule,
            schedule1: data.schedule,
            schedule2: data.schedule2 || [],
            substitutions: data.substitutions,
            dutySchedule: data.dutySchedule,
            nutritionRecords: data.nutritionRecords || [],
            absenteeismRecords: data.absenteeismRecords || [],
            saveSemesterSchedule,
            saveScheduleData
        }),
        [
            activeSchedule,
            data.schedule,
            data.schedule2,
            data.substitutions,
            data.dutySchedule,
            data.nutritionRecords,
            data.absenteeismRecords,
            saveSemesterSchedule,
            saveScheduleData
        ]
    );

    const contextValue = useMemo(
        () => ({
            ...scheduleData,
            saveScheduleData
        }),
        [scheduleData, saveScheduleData]
    );

    return <ScheduleDataContext.Provider value={contextValue}>{children}</ScheduleDataContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useStaticData = () => {
    const context = useContext(StaticDataContext);
    if (!context) throw new Error('useStaticData must be used within StaticDataProvider');
    const metaContext = useContext(DataMetaContext);
    if (!metaContext) throw new Error('useStaticData must be used within DataProvider');

    // Гарантируем, что массивы всегда определены
    const safeContext = useMemo(
        () => ({
            ...context,
            subjects: context.subjects || [],
            teachers: context.teachers || [],
            classes: context.classes || [],
            rooms: context.rooms || [],
            bellSchedule: context.bellSchedule || [],
            settings: context.settings || INITIAL_DATA.settings,
            privateSettings: context.privateSettings || INITIAL_DATA.privateSettings,
            dutyZones: context.dutyZones || []
        }),
        [context]
    );

    return useMemo(
        () => ({
            ...safeContext,
            isLoading: metaContext.isLoading,
            isSaving: metaContext.isSaving,
            undo: metaContext.undo,
            redo: metaContext.redo,
            canUndo: metaContext.canUndo,
            canRedo: metaContext.canRedo,
            resetData: metaContext.resetData
        }),
        [
            safeContext,
            metaContext.isLoading,
            metaContext.isSaving,
            metaContext.undo,
            metaContext.redo,
            metaContext.canUndo,
            metaContext.canRedo,
            metaContext.resetData
        ]
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useScheduleData = () => {
    const context = useContext(ScheduleDataContext);
    if (!context) throw new Error('useScheduleData must be used within ScheduleDataProvider');
    const metaContext = useContext(DataMetaContext);
    if (!metaContext) throw new Error('useScheduleData must be used within DataProvider');

    // Гарантируем, что массивы всегда определены
    const safeContext = useMemo(
        () => ({
            ...context,
            schedule: context.schedule || [],
            schedule1: context.schedule1 || [],
            schedule2: context.schedule2 || [],
            substitutions: context.substitutions || [],
            dutySchedule: context.dutySchedule || [],
            nutritionRecords: context.nutritionRecords || [],
            absenteeismRecords: context.absenteeismRecords || []
        }),
        [context]
    );

    return useMemo(
        () => ({
            ...safeContext,
            isLoading: metaContext.isLoading,
            isSaving: metaContext.isSaving,
            undo: metaContext.undo,
            redo: metaContext.redo,
            canUndo: metaContext.canUndo,
            canRedo: metaContext.canRedo,
            resetData: metaContext.resetData
        }),
        [
            safeContext,
            metaContext.isLoading,
            metaContext.isSaving,
            metaContext.undo,
            metaContext.redo,
            metaContext.canUndo,
            metaContext.canRedo,
            metaContext.resetData
        ]
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error('useData must be used within DataProvider');
    return context;
};
