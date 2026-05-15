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
import { useAuth } from './AuthContext';
import { User } from 'firebase/auth';
import { getActiveSemester, generateId } from '../utils/helpers';
import { produce } from 'immer';
import { auditLog } from '../services/auditLog';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';

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

    load: () => {
        const stored = safeLocalStorageGet(PERSISTENT_QUEUE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    syncQueue.items = parsed;
                }
            } catch (e) {
                console.warn('Failed to parse persistent sync queue', e);
            }
        }
    },

    save: () => {
        try {
            safeLocalStorageSet(PERSISTENT_QUEUE_KEY, JSON.stringify(syncQueue.items));
        } catch (e) {
            console.warn('Failed to save sync queue', e);
        }
    },

    add: (data: Partial<AppData>) => {
        const MAX_QUEUE_SIZE = 50;
        if (syncQueue.items.length >= MAX_QUEUE_SIZE) {
            const dropped = syncQueue.items.length - MAX_QUEUE_SIZE + 1;
            syncQueue.items = syncQueue.items.slice(-(MAX_QUEUE_SIZE - 1));
            console.warn(`Sync queue exceeded ${MAX_QUEUE_SIZE} items. Dropped ${dropped} oldest item(s).`);
        }
        const id = generateId();
        syncQueue.items.push({
            id,
            data,
            timestamp: Date.now(),
            retryCount: 0
        });
        syncQueue.save();
    },

    process: async (user: User) => {
        if (syncQueue.isProcessing || !navigator.onLine) return;

        syncQueue.isProcessing = true;
        const itemsToRemove: string[] = [];

        try {
            for (const item of syncQueue.items) {
                if (!navigator.onLine) break; // Останавливаемся, если сеть пропала

                try {
                    await dbService.save(item.data, user);
                    itemsToRemove.push(item.id);
                } catch (error: unknown) {
                    item.retryCount++;
                    // Если ошибка квоты, оставляем в очереди но не удаляем
                    const err = error as { code?: string; message?: string };
                    if (err.code === 'resource-exhausted') {
                        console.warn('Quota exhausted, keeping item in queue:', item.id);
                        break; // Stop processing to avoid spamming
                    }

                    if (item.retryCount >= 10) {
                        // Increased from 3 to 10 for better resilience
                        console.error('Не удалось синхронизировать после 10 попыток:', item.id);
                        itemsToRemove.push(item.id); // Удаляем после 10 попыток
                    }
                }
            }
        } finally {
            if (itemsToRemove.length > 0) {
                syncQueue.items = syncQueue.items.filter((item) => !itemsToRemove.includes(item.id));
                syncQueue.save();
            }
            syncQueue.isProcessing = false;

            if (syncQueue.items.length > 0 && navigator.onLine) {
                // Если остались элементы и сеть есть, попробуем снова через 5 секунд
                setTimeout(() => syncQueue.process(user), 5000);
            }
        }
    }
};

// Единообразная обработка ошибок
const handleError = {
    log: (message: string, error?: unknown) => {
        console.error(message, error);
    },

    warn: (message: string, error?: unknown) => {
        console.warn(message, error);
    },

    alert: (message: string, error?: unknown) => {
        console.error(message, error);
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

        console.error(`Firebase ${context}:`, error);
        window.dispatchEvent(
            new CustomEvent('app-toast', {
                detail: { type: 'danger', title: 'Ошибка Firebase', message }
            })
        );
    },

    firebaseOffline: (error: unknown, context: string, data: Partial<AppData>) => {
        // Для мобильных устройств показываем более мягкое сообщение
        const isMobile = window.innerWidth < 768;
        const message = isMobile
            ? `Сохранено локально. Синхронизируется при подключении к сети.`
            : `Ошибка ${context}. Данные сохранены локально и будут синхронизированы при восстановлении соединения.`;

        console.warn(`Firebase ${context} (оффлайн):`, error);

        window.dispatchEvent(
            new CustomEvent('app-toast', {
                detail: { type: 'warning', title: 'Оффлайн режим', message }
            })
        );

        // Добавляем в очередь синхронизации
        syncQueue.add(data);
    }
};

export const DataProvider: React.FC<{ children: React.ReactNode; initialData?: AppData }> = ({
    children,
    initialData
}) => {
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
    const { user, role, loading: authLoading } = useAuth();

    // Загрузка данных
    useEffect(() => {
        // Initialize sync queue from storage
        syncQueue.load();

        // 1. Если переданы начальные данные (публичный вид)
        if (initialData) {
            setInternalData(initialData);
            setHistory([initialData]);
            setHistoryPointer(0);
            setIsLoading(false);
            return;
        }

        // Ждем инициализации аутентификации
        if (authLoading) return;

        // 2. Пытаемся загрузить локальную копию сразу, чтобы пользователь что-то видел
        let localBackup: string | null = null;
        if (isLocalStorageAvailable()) {
            localBackup = safeLocalStorageGet(LOCAL_STORAGE_KEY);
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

        const canLoadFromFirebase = user && role !== 'guest';
        const canUseLocalData = user || role === 'guest';

        if (!canUseLocalData) {
            setInternalData(getInitialData());
            setIsLoading(false);
            return;
        }

        // Для авторизованных пользователей подписываемся на Firebase
        if (!canLoadFromFirebase) {
            if (!localBackup) setInternalData(getInitialData());
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // 3. Подписываемся на Firebase
        let unsubscribe: (() => void) | undefined;
        try {
            unsubscribe = dbService.subscribe(
                (loaded) => {
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

                        // Apply pending changes on top of Firebase data
                        // This ensures that local changes are not overwritten by stale server data
                        if (syncQueue.items.length > 0) {
                            syncQueue.items.forEach((item) => {
                                // Shallow merge of top-level keys (e.g. absenteeismRecords)
                                // This assumes that the pending change contains the FULL array for that key
                                Object.assign(fixedData, item.data);
                            });
                        }

                        // Обновляем локальный бэкап актуальными данными из облака
                        if (isLocalStorageAvailable()) {
                            safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(fixedData));
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
                },
                (error) => {
                    handleError.log('Failed to subscribe to data:', error);
                    // Если ошибка квоты или сети - мы уже загрузили localBackup выше, так что данные не пропадут
                    setIsLoading(false);
                }
            );
        } catch (error) {
            handleError.log('Failed to initialize subscription:', error);
            setIsLoading(false);
            unsubscribe = undefined;
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [initialData, user, role, authLoading]);

    const saveData = useCallback(
        async (newData: Partial<AppData>, addToHistory = true) => {
            const isGuest = role === 'guest';
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
                    safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
                }

                // 3. Пробуем отправить в облако (только для авторизованных, не для гостей и не для публичных данных)
                if (!initialData && user && !isGuest) {
                    try {
                        await dbService.save(newData, user);
                    } catch (dbError: unknown) {
                        // При ошибке Firestore добавляем в очередь синхронизации вместо отката
                        handleError.firebaseOffline(dbError, 'сохранения данных', newData);
                        // НЕ откатываем интерфейс - данные остались в localStorage и будут синхронизированы позже
                    }
                } else if (isGuest) {
                    // Гость не сохраняет данные в облако
                }

                // 4. Audit log
                if (user && !isGuest) {
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
                                user.email || user.uid || 'unknown',
                                role || 'unknown',
                                'update',
                                entityMap[key],
                                key,
                                `Изменено ${key}`
                            );
                        }
                    });
                }

                if (addToHistory) {
                    const newHistory = currentHistory.slice(0, currentPointer + 1);
                    newHistory.push(mergedData);

                    // History management: keep reasonable limit to prevent memory bloat
                    const MAX_HISTORY = 50;
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
        [user, role, initialData]
    );

    // Автоматическая синхронизация при восстановлении сети
    useEffect(() => {
        const handleOnline = () => {
            if (syncQueue.items.length > 0 && user && role !== 'guest' && !initialData) {
                syncQueue.process(user);
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [user, role, initialData]);

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
                safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(prevData));
            }

            if (!initialData && user) {
                try {
                    dbService.save(prevData, user).catch((e) => handleError.firebase(e, 'отмены изменений'));
                } catch (e) {
                    handleError.firebase(e, 'отмены изменений');
                }
            }
        }
    }, [initialData, user]);

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
                safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(nextData));
            }

            if (!initialData && user) {
                try {
                    dbService.save(nextData, user).catch((e) => handleError.firebase(e, 'повтора изменений'));
                } catch (e) {
                    handleError.firebase(e, 'повтора изменений');
                }
            }
        }
    }, [initialData, user]);

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
    const activeSchedule = useMemo(
        () => (currentSemester === 2 ? data.schedule2 || [] : data.schedule || []),
        [currentSemester, data.schedule, data.schedule2]
    );

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

export const useData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error('useData must be used within DataProvider');
    return context;
};
