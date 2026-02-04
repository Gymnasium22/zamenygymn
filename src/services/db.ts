
import { AppData, Teacher, Subject, ClassEntity, Room, ScheduleItem, Substitution } from '../types';
import { INITIAL_DATA } from '../constants';
import { firestoreDB, auth } from './firebase';
import { 
    collection, 
    doc, 
    setDoc, 
    writeBatch, 
    onSnapshot, 
    getDocs, 
    query,
    deleteDoc,
    updateDoc
} from "firebase/firestore";

// Конфигурация коллекций
const COLLECTIONS = {
    TEACHERS: 'teachers',
    SUBJECTS: 'subjects',
    CLASSES: 'classes',
    ROOMS: 'rooms',
    SCHEDULE_1: 'schedule_sem1',
    SCHEDULE_2: 'schedule_sem2',
    SUBSTITUTIONS: 'substitutions',
    CONFIG: 'config',
    PUBLIC: 'publicSchedules',
    DUTY_ZONES: 'duty_zones',
    DUTY_SCHEDULE: 'duty_schedule',
    NUTRITION: 'nutrition_records'
};

// Кеш предыдущих состояний коллекций для оптимизации
const collectionCache = new Map<string, Map<string, any>>();

const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

// Helper to remove undefined values which Firebase doesn't support
const sanitizeForFirestore = (data: any): any => {
    if (data === null || data === undefined) {
        return null; // Convert undefined to null for Firestore compatibility
    }

    if (typeof data === 'object') {
        if (Array.isArray(data)) {
            return data.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
        }

        const sanitized: any = {};
        for (const [key, value] of Object.entries(data)) {
            const sanitizedValue = sanitizeForFirestore(value);
            if (sanitizedValue !== undefined) {
                sanitized[key] = sanitizedValue;
            }
        }
        return sanitized;
    }

    return data;
};

// Глубокое сравнение объектов
const deepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }

    return false;
};

// Wrapper to safely execute getDocs even if it fails
async function awaitHZ(fn: Function, options: { throwOnError?: boolean } = {}) {
    try {
        return await fn();
    } catch(e) {
        console.error("Firestore read error (likely quota):", e);
        if (options.throwOnError) {
            throw e; // Re-throw for UI error handling
        }
        // Return empty snapshot structure to prevent crash in loop
        return { docs: [] };
    }
};

export const dbService = {
    // Оптимизированная синхронизация с использованием локального кеша
    syncCollection: async (collectionName: string, items: any[]) => {
        if (!firestoreDB) return;

        // Получаем кеш для этой коллекции
        let cachedItems = collectionCache.get(collectionName);
        if (!cachedItems) {
            cachedItems = new Map();
            collectionCache.set(collectionName, cachedItems);
        }

        // Создаем Map из новых элементов
        const newItemsMap = new Map<string, any>();
        items.forEach(item => {
            if (item && item.id) {
                newItemsMap.set(item.id, sanitizeForFirestore(item));
            }
        });

        // Вычисляем операции только на основе кеша
        const operations: { type: 'create' | 'update' | 'delete', item?: any, id: string }[] = [];

        // Удаление элементов, которые есть в кеше, но нет в новых данных
        cachedItems.forEach((_, id) => {
            if (!newItemsMap.has(id)) {
                operations.push({ type: 'delete', id });
            }
        });

        // Создание/обновление элементов
        newItemsMap.forEach((item, id) => {
            const cachedItem = cachedItems!.get(id);

            // Сравниваем с кешем
            if (!cachedItem || !deepEqual(cachedItem, item)) {
                operations.push({
                    type: cachedItem ? 'update' : 'create',
                    item,
                    id
                });
            }
        });

        if (operations.length === 0) return;

        try {
            // Запись пачками
            const chunks = chunkArray(operations, 450);

            for (const chunk of chunks) {
                const batch = writeBatch(firestoreDB);

                chunk.forEach((op) => {
                    const docRef = doc(firestoreDB, collectionName, op.id);

                    if (op.type === 'delete') {
                        batch.delete(docRef);
                        cachedItems!.delete(op.id);
                    } else {
                        // Используем setDoc с merge: true для надежности
                        batch.set(docRef, op.item, { merge: true });
                        cachedItems!.set(op.id, op.item);
                    }
                });

                await batch.commit();
            }
        } catch (error) {
            console.error(`Failed to sync ${collectionName}:`, error);
            throw error;
        }
    },

    // Метод для принудительной синхронизации кеша с базой данных (при первой загрузке)
    syncCacheWithDatabase: async (collectionName: string) => {
        if (!firestoreDB) return;

        // Проверяем, есть ли уже данные в кеше, чтобы не делать лишние запросы
        if (collectionCache.has(collectionName) && collectionCache.get(collectionName)!.size > 0) {
            console.log(`Cache already exists for ${collectionName}, skipping sync`);
            return;
        }

        try {
            const q = query(collection(firestoreDB, collectionName));
            const querySnapshot = await awaitHZ(async() => await getDocs(q), { throwOnError: true });

            const cachedItems = new Map<string, any>();
            querySnapshot.docs.forEach((doc: any) => {
                cachedItems.set(doc.id, doc.data());
            });

            collectionCache.set(collectionName, cachedItems);
            console.log(`Cache synced for ${collectionName} (${cachedItems.size} items)`);
        } catch (error) {
            console.error(`Failed to sync cache for ${collectionName}:`, error);
            // Не бросаем ошибку, чтобы не ломать загрузку
        }
    },

    save: async (data: Partial<AppData>, currentUser?: any) => {
        if (!firestoreDB) return;

        const user = currentUser || auth?.currentUser;
        if (!user) return;

        const promises = [];

        if (data.teachers) promises.push(dbService.syncCollection(COLLECTIONS.TEACHERS, data.teachers));
        if (data.subjects) promises.push(dbService.syncCollection(COLLECTIONS.SUBJECTS, data.subjects));
        if (data.classes) promises.push(dbService.syncCollection(COLLECTIONS.CLASSES, data.classes));
        if (data.rooms) promises.push(dbService.syncCollection(COLLECTIONS.ROOMS, data.rooms));
        if (data.schedule) promises.push(dbService.syncCollection(COLLECTIONS.SCHEDULE_1, data.schedule));
        if (data.schedule2) promises.push(dbService.syncCollection(COLLECTIONS.SCHEDULE_2, data.schedule2));
        if (data.substitutions) promises.push(dbService.syncCollection(COLLECTIONS.SUBSTITUTIONS, data.substitutions));
        if (data.dutyZones) promises.push(dbService.syncCollection(COLLECTIONS.DUTY_ZONES, data.dutyZones));
        if (data.dutySchedule) promises.push(dbService.syncCollection(COLLECTIONS.DUTY_SCHEDULE, data.dutySchedule));
        if (data.nutritionRecords) promises.push(dbService.syncCollection(COLLECTIONS.NUTRITION, data.nutritionRecords));

        if (data.settings) {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), sanitizeForFirestore(data.settings), { merge: true }));
        }
        if (data.bellSchedule) {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), sanitizeForFirestore({ items: data.bellSchedule })));
        }

        await Promise.all(promises);
    },

    subscribe: (
        onNext: (data: AppData) => void,
        onError: (error: Error) => void
    ) => {
        if (!firestoreDB) {
            return () => {};
        }

        let localData: AppData = { ...INITIAL_DATA };
        let isInitialLoad = true;

        let updateTimeout: any;
        const triggerUpdate = () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(async () => {
                const data = { ...localData };

                // При первой загрузке НЕ делаем полную синхронизацию кеша
                // Это экономит квоты Firestore - данные будут загружаться по требованию
                if (isInitialLoad) {
                    isInitialLoad = false;
                    console.log('Skipping initial cache synchronization to save Firestore quota');
                }

                onNext(data);
            }, 50);
        };

        const unsubs: (() => void)[] = [];

        const subColl = (colName: string, key: keyof AppData) => {
            const q = query(collection(firestoreDB, colName));
            return onSnapshot(q, (snapshot) => {
                const items = snapshot.docs.map(d => d.data());
                
                // IMPORTANT: Populate the internal cache with data from Firestore
                // This ensures that when syncCollection runs (e.g. on delete),
                // it knows what currently exists in the DB to calculate deletions correctly.
                const cachedItems = new Map<string, any>();
                items.forEach((item: any) => {
                    if (item && item.id) {
                        cachedItems.set(item.id, item);
                    }
                });
                collectionCache.set(colName, cachedItems);
                
                // Sort items based on 'order' property client-side
                items.sort((a: any, b: any) => {
                    const orderA = typeof a.order === 'number' ? a.order : 999999;
                    const orderB = typeof b.order === 'number' ? b.order : 999999;
                    return orderA - orderB;
                });
                (localData as any)[key] = items;
                triggerUpdate();
            }, (err) => {
                console.warn(`Error reading ${colName}:`, err);
            });
        };

        unsubs.push(subColl(COLLECTIONS.TEACHERS, 'teachers'));
        unsubs.push(subColl(COLLECTIONS.SUBJECTS, 'subjects'));
        unsubs.push(subColl(COLLECTIONS.CLASSES, 'classes'));
        unsubs.push(subColl(COLLECTIONS.ROOMS, 'rooms'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_1, 'schedule'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_2, 'schedule2'));
        unsubs.push(subColl(COLLECTIONS.SUBSTITUTIONS, 'substitutions'));
        unsubs.push(subColl(COLLECTIONS.DUTY_ZONES, 'dutyZones'));
        unsubs.push(subColl(COLLECTIONS.DUTY_SCHEDULE, 'dutySchedule'));
        unsubs.push(subColl(COLLECTIONS.NUTRITION, 'nutritionRecords'));

        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), (doc) => {
            if (doc.exists()) {
                localData.settings = { ...INITIAL_DATA.settings, ...doc.data() };
                triggerUpdate();
            }
        }));

        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                localData.bellSchedule = data.items || INITIAL_DATA.bellSchedule;
                triggerUpdate();
            }
        }));

        return () => {
            unsubs.forEach(unsub => unsub());
            clearTimeout(updateTimeout);
        };
    },

    exportJson: (data: AppData) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const getLocalDateString = (date: Date = new Date()): string => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        link.download = `gymnasium_backup_${getLocalDateString()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    setPublicData: async (id: string, data: AppData) => {
        if (!firestoreDB) throw new Error("Database not initialized");
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") throw new Error("Нет прав.");

        // Explicitly define public-safe versions of data structures
        const publicDataSubset = {
            subjects: data.subjects.map(s => ({
                id: s.id,
                name: s.name,
                color: s.color,
                difficulty: s.difficulty,
                requiredRoomType: s.requiredRoomType,
                order: s.order
            })),
            teachers: data.teachers.map(t => ({
                id: t.id,
                name: t.name,
                subjectIds: t.subjectIds,
                shifts: t.shifts,
                // Explicitly clear private fields
                unavailableDates: [],
                telegramChatId: '',
                absenceReasons: undefined,
                birthDate: undefined,
                order: t.order // Keep order for display purposes
            })),
            classes: data.classes.map(c => ({
                id: c.id,
                name: c.name,
                shift: c.shift,
                studentsCount: c.studentsCount,
                order: c.order
            })),
            rooms: data.rooms,
            schedule: data.schedule,
            schedule2: data.schedule2,
            substitutions: data.substitutions,
            bellSchedule: data.bellSchedule,
            settings: {
                telegramToken: '',
                publicScheduleId: data.settings.publicScheduleId,
                bellPresets: data.settings.bellPresets,
                semesterConfig: data.settings.semesterConfig
            },
            // Duty Schedule is usually public too
            dutyZones: data.dutyZones,
            dutySchedule: data.dutySchedule
        };
        // sanitize here too just in case
        const cleanData = sanitizeForFirestore(publicDataSubset);
        await setDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id), cleanData);
    },

    getPublicData: async (id: string): Promise<AppData | null> => {
        if (!firestoreDB) return null;
        try {
            const d = await import("firebase/firestore").then(m => m.getDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id)));
            if (d.exists()) return d.data() as AppData;
            return null;
        } catch (error) {
            console.error(error);
            return null;
        }
    },

    deletePublicData: async (id: string) => {
        if (!firestoreDB) return;
        await deleteDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id));
    }
};
