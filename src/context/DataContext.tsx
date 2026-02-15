
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppData, Shift, StaticAppData, ScheduleAndSubstitutionData, ScheduleItem } from '../types';
import { INITIAL_DATA, DEFAULT_BELLS, DEFAULT_DUTY_ZONES } from '../constants';
import { dbService } from '../services/db';
import { useAuth } from './AuthContext';
import { getActiveSemester, generateId } from '../utils/helpers';

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

const FullDataContext = createContext<FullDataContextType | undefined>(undefined);

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

const safeLocalStorageSet = (key: string, value: string): boolean => {
    try {
        // Проверяем размер данных (localStorage обычно имеет лимит 5-10MB)
        const sizeInBytes = new Blob([value]).size;
        const maxSize = 4 * 1024 * 1024; // 4MB лимит для безопасности

        if (sizeInBytes > maxSize) {
            console.warn('Data too large for localStorage, skipping backup');
            return false;
        }

        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
        return false;
    }
};

const safeLocalStorageGet = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('Failed to read from localStorage:', e);
        return null;
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
                    console.log(`Loaded ${parsed.length} pending items from sync queue`);
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
        const id = generateId();
        syncQueue.items.push({
            id,
            data,
            timestamp: Date.now(),
            retryCount: 0
        });
        syncQueue.save();
        console.log('Добавлено в очередь синхронизации:', id);
    },

    process: async (user: any) => {
        if (syncQueue.isProcessing || !navigator.onLine) return;

        syncQueue.isProcessing = true;
        const itemsToRemove: string[] = [];

        try {
            for (const item of syncQueue.items) {
                if (!navigator.onLine) break; // Останавливаемся, если сеть пропала

                try {
                    await dbService.save(item.data, user);
                    itemsToRemove.push(item.id);
                    console.log('Успешно синхронизировано:', item.id);
                } catch (error: any) {
                    item.retryCount++;
                    // Если ошибка квоты, оставляем в очереди но не удаляем
                    if (error?.code === 'resource-exhausted') {
                         console.warn('Quota exhausted, keeping item in queue:', item.id);
                         break; // Stop processing to avoid spamming
                    }

                    if (item.retryCount >= 10) { // Increased from 3 to 10 for better resilience
                        console.error('Не удалось синхронизировать после 10 попыток:', item.id);
                        itemsToRemove.push(item.id); // Удаляем после 10 попыток
                    } else {
                        console.log(`Повторная попытка синхронизации ${item.retryCount}/10:`, item.id);
                    }
                }
            }
        } finally {
            if (itemsToRemove.length > 0) {
                syncQueue.items = syncQueue.items.filter(item => !itemsToRemove.includes(item.id));
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
    log: (message: string, error?: any) => {
        console.error(message, error);
    },

    warn: (message: string, error?: any) => {
        console.warn(message, error);
    },

    alert: (message: string, error?: any) => {
        console.error(message, error);
        alert(`⚠️ ${message}`);
    },

    firebase: (error: any, context: string) => {
        const code = error?.code;
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
                message = `Ошибка ${context}: ${error?.message || 'Неизвестная ошибка'}`;
        }

        console.error(`Firebase ${context}:`, error);
        alert(message);
    },

    firebaseOffline: (error: any, context: string, data: Partial<AppData>) => {
        // Для мобильных устройств показываем более мягкое сообщение
        const isMobile = window.innerWidth < 768;
        const message = isMobile
            ? `Сохранено локально. Синхронизируется при подключении к сети.`
            : `Ошибка ${context}. Данные сохранены локально и будут синхронизированы при восстановлении соединения.`;

        console.warn(`Firebase ${context} (оффлайн):`, error);

        if (isMobile) {
            // На мобильных показываем toast вместо alert
            // Это будет работать через ToastProvider
        } else {
            alert(message);
        }

        // Добавляем в очередь синхронизации
        syncQueue.add(data);
    }
};

export const DataProvider: React.FC<{ children: React.ReactNode; initialData?: AppData }> = ({ children, initialData }) => {
    const [data, setInternalData] = useState<AppData>(INITIAL_DATA);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<AppData[]>([]);
    const [historyPointer, setHistoryPointer] = useState(-1);
    
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
                        setInternalData(prev => ({ ...prev, ...parsed }));
                        console.log('Loaded from local storage backup');
                    }
                } catch (e) {
                    handleError.log('Error parsing local backup', e);
                }
            }
        }

        const canLoadFromFirebase = user && role !== 'guest';
        const canUseLocalData = user || role === 'guest';

        if (!canUseLocalData) {
            setInternalData(INITIAL_DATA);
            setIsLoading(false);
            return;
        }

        // Для авторизованных пользователей подписываемся на Firebase
        if (!canLoadFromFirebase) {
            if (!localBackup) setInternalData(INITIAL_DATA);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // 3. Подписываемся на Firebase
        let unsubscribe: (() => void) | undefined;
        try {
            unsubscribe = dbService.subscribe(
                (loaded) => {
                setInternalData(prevData => {
                    // Merge incoming partial data with previous data (which contains localStorage data)
                    // This prevents overwriting existing data with empty defaults if a collection fails to load
                    const fixedData = { ...prevData, ...loaded };
                    
                    // Нормализация данных (ensure arrays are not undefined if they were missing in both prev and loaded)
                    if (!fixedData.teachers) fixedData.teachers = [];
                    // Fix: apply defaults safely to avoid overwriting or TS warnings
                    fixedData.teachers = fixedData.teachers.map(t => ({ 
                        telegramChatId: '', 
                        ...t,
                        shifts: t.shifts || [Shift.First, Shift.Second]
                    }));

                    if (!fixedData.schedule) fixedData.schedule = [];
                    if (!fixedData.schedule2) fixedData.schedule2 = []; 
                    if (!fixedData.substitutions) fixedData.substitutions = [];
                    if (!fixedData.bellSchedule) fixedData.bellSchedule = DEFAULT_BELLS;
                    if (!fixedData.dutyZones || fixedData.dutyZones.length === 0) fixedData.dutyZones = DEFAULT_DUTY_ZONES;
                    if (!fixedData.dutySchedule) fixedData.dutySchedule = [];
                    if (!fixedData.nutritionRecords) fixedData.nutritionRecords = [];
                    if (!fixedData.absenteeismRecords) fixedData.absenteeismRecords = [];
                    
                    if (!fixedData.settings) fixedData.settings = INITIAL_DATA.settings;
                    else fixedData.settings = { ...INITIAL_DATA.settings, ...fixedData.settings };
                    
                    // Apply pending changes on top of Firebase data
                    // This ensures that local changes are not overwritten by stale server data
                    if (syncQueue.items.length > 0) {
                         console.log(`Applying ${syncQueue.items.length} pending changes to incoming data`);
                         syncQueue.items.forEach(item => {
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
                    setHistory(prev => {
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
                handleError.log("Failed to subscribe to data:", error);
                // Если ошибка квоты или сети - мы уже загрузили localBackup выше, так что данные не пропадут
                setIsLoading(false);
            }
        );
        } catch (error) {
            handleError.log("Failed to initialize subscription:", error);
            setIsLoading(false);
            unsubscribe = undefined;
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };

    }, [initialData, user, role, authLoading]); 

    const saveData = useCallback(async (newData: Partial<AppData>, addToHistory = true) => {
        const isGuest = role === 'guest';
        setIsSaving(true);

        try {
            // 1. Оптимистичное обновление интерфейса (сразу меняем стейт)
            const mergedData = { ...data, ...newData };
            setInternalData(mergedData);

            // 2. Всегда сохраняем в LocalStorage как резерв
            if (isLocalStorageAvailable()) {
                safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
            }

            // 3. Пробуем отправить в облако (только для авторизованных, не для гостей и не для публичных данных)
            if (!initialData && user && !isGuest) {
                try {
                    await dbService.save(newData, user);
                } catch (dbError: any) {
                    // При ошибке Firestore добавляем в очередь синхронизации вместо отката
                    handleError.firebaseOffline(dbError, 'сохранения данных', newData);
                    // НЕ откатываем интерфейс - данные остались в localStorage и будут синхронизированы позже
                }
            } else if (isGuest) {
                console.warn("Гости не могут сохранять изменения в базу данных.");
            }

            if (addToHistory) {
                const newHistory = history.slice(0, historyPointer + 1);
                newHistory.push(mergedData);

                // History management: keep reasonable limit to prevent memory bloat
                const MAX_HISTORY = 50;
                if (newHistory.length > MAX_HISTORY) {
                    // Remove oldest items, keep the most recent MAX_HISTORY
                    const itemsToRemove = newHistory.length - MAX_HISTORY;
                    newHistory.splice(0, itemsToRemove);
                    setHistoryPointer(MAX_HISTORY - 1);
                } else {
                    setHistoryPointer(newHistory.length - 1);
                }

                setHistory(newHistory);
            }
        } finally {
            setIsSaving(false);
        }
    }, [data, history, historyPointer, user, role, initialData]);

    // Автоматическая синхронизация при восстановлении сети
    useEffect(() => {
        const handleOnline = () => {
            if (syncQueue.items.length > 0 && user && role !== 'guest' && !initialData) {
                console.log(`Восстановлено соединение. Синхронизирую ${syncQueue.items.length} элементов...`);
                syncQueue.process(user);
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [user, role, initialData]);

    const undo = useCallback(async () => {
        setHistoryPointer(prev => {
            if (prev > 0) {
                const prevData = history[prev - 1];
                setInternalData(prevData);
                // Сохраняем локально
                if (isLocalStorageAvailable()) {
                    safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(prevData));
                }
                
                if (!initialData && user) {
                    try {
                        dbService.save(prevData, user).catch(e => handleError.firebase(e, 'отмены изменений'));
                    } catch(e) { handleError.firebase(e, 'отмены изменений'); }
                }
                return prev - 1;
            }
            return prev;
        });
    }, [history, initialData, user]);

    const redo = useCallback(async () => {
        setHistoryPointer(prev => {
            if (prev < history.length - 1) {
                const nextData = history[prev + 1];
                setInternalData(nextData);
                // Сохраняем локально
                if (isLocalStorageAvailable()) {
                    safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(nextData));
                }

                if (!initialData && user) {
                    try {
                        dbService.save(nextData, user).catch(e => handleError.firebase(e, 'повтора изменений'));
                    } catch(e) { handleError.firebase(e, 'повтора изменений'); }
                }
                return prev + 1;
            }
            return prev;
        });
    }, [history, initialData, user]);

    const resetData = useCallback(async () => { await saveData(INITIAL_DATA); }, [saveData]);

    const contextValue = useMemo(() => ({
        data, isLoading, isSaving, saveData, resetData,
        undo, redo, canUndo: historyPointer > 0, canRedo: historyPointer < history.length - 1
    }), [data, isLoading, isSaving, saveData, resetData, undo, redo, historyPointer]);

    return (
        <FullDataContext.Provider value={contextValue}>
            {children}
        </FullDataContext.Provider>
    );
};

const useFullData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error("useFullData must be used within DataProvider");
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

    const staticData: StaticAppData = useMemo(() => ({
        subjects: data.subjects,
        teachers: data.teachers,
        classes: data.classes,
        rooms: data.rooms,
        bellSchedule: data.bellSchedule,
        settings: data.settings,
        dutyZones: data.dutyZones,
    }), [data.subjects, data.teachers, data.classes, data.rooms, data.bellSchedule, data.settings, data.dutyZones]);

    const saveStaticData = useCallback(async (newData: Partial<StaticAppData>, addToHistory?: boolean) => {
        await saveData(newData, addToHistory);
    }, [saveData]);

    const contextValue = useMemo(() => ({
        ...staticData,
        saveStaticData,
    }), [staticData, saveStaticData]);

    return (
        <StaticDataContext.Provider value={contextValue}>
            {children}
        </StaticDataContext.Provider>
    );
};

export const ScheduleDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data, saveData } = useFullData();

    // Определяем текущий семестр на основе унифицированной функции
    const now = new Date();
    const currentSemester = getActiveSemester(now, data.settings);
    const activeSchedule = currentSemester === 2 ? (data.schedule2 || []) : (data.schedule || []);

    const saveSemesterSchedule = useCallback(async (semester: 1 | 2, newData: ScheduleItem[]) => {
        if (semester === 1) {
            await saveData({ schedule: newData });
        } else {
            await saveData({ schedule2: newData });
        }
    }, [saveData]);

    const saveScheduleData = useCallback(async (newData: Partial<ScheduleAndSubstitutionData>, addToHistory?: boolean) => {
        await saveData(newData as any, addToHistory);
    }, [saveData]);

    const scheduleData: ScheduleAndSubstitutionData = useMemo(() => ({
        schedule: activeSchedule,
        schedule1: data.schedule,
        schedule2: data.schedule2 || [],
        substitutions: data.substitutions,
        dutySchedule: data.dutySchedule,
        nutritionRecords: data.nutritionRecords || [],
        absenteeismRecords: data.absenteeismRecords || [],
        saveSemesterSchedule,
        saveScheduleData
    }), [activeSchedule, data.schedule, data.schedule2, data.substitutions, data.dutySchedule, data.nutritionRecords, data.absenteeismRecords, saveSemesterSchedule, saveScheduleData]);

    const contextValue = useMemo(() => ({
        ...scheduleData,
        saveScheduleData,
    }), [scheduleData, saveScheduleData]);

    return (
        <ScheduleDataContext.Provider value={contextValue}>
            {children}
        </ScheduleDataContext.Provider>
    );
};


export const useStaticData = () => {
    const context = useContext(StaticDataContext);
    if (!context) throw new Error("useStaticData must be used within StaticDataProvider");
    const fullContext = useFullData();

    // Гарантируем, что массивы всегда определены
    const safeContext = {
        ...context,
        subjects: context.subjects || [],
        teachers: context.teachers || [],
        classes: context.classes || [],
        rooms: context.rooms || [],
        bellSchedule: context.bellSchedule || [],
        settings: context.settings || INITIAL_DATA.settings,
        dutyZones: context.dutyZones || []
    };

    return { ...safeContext, isLoading: fullContext.isLoading, isSaving: fullContext.isSaving, undo: fullContext.undo, redo: fullContext.redo, canUndo: fullContext.canUndo, canRedo: fullContext.canRedo, resetData: fullContext.resetData };
};

export const useScheduleData = () => {
    const context = useContext(ScheduleDataContext);
    if (!context) throw new Error("useScheduleData must be used within ScheduleDataProvider");
    const fullContext = useFullData();

    // Гарантируем, что массивы всегда определены
    const safeContext = {
        ...context,
        schedule: context.schedule || [],
        schedule1: context.schedule1 || [],
        schedule2: context.schedule2 || [],
        substitutions: context.substitutions || [],
        dutySchedule: context.dutySchedule || [],
        nutritionRecords: context.nutritionRecords || [],
        absenteeismRecords: context.absenteeismRecords || []
    };

    return { ...safeContext, isLoading: fullContext.isLoading, isSaving: fullContext.isSaving, undo: fullContext.undo, redo: fullContext.redo, canUndo: fullContext.canUndo, canRedo: fullContext.canRedo, resetData: fullContext.resetData };
};

export const useData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error("useData must be used within DataProvider");
    return context;
};
