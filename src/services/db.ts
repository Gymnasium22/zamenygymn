
import { AppData } from '../types';
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
    deleteDoc
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
    NUTRITION: 'nutrition_records',
    ABSENTEEISM: 'absenteeism_records',
    SECRETS: 'secrets'
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
async function awaitHZ<T>(fn: () => Promise<T>, options: { throwOnError?: boolean } = {}): Promise<T | { docs: any[] }> {
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
    // Helper for direct deletion (bypassing syncCollection cache dependency)
    deleteDocument: async (collectionName: string, id: string) => {
        if (!firestoreDB) return;
        try {
            await deleteDoc(doc(firestoreDB, collectionName, id));
            // Update cache if exists to keep it in sync
            const cache = collectionCache.get(collectionName);
            if (cache) {
                cache.delete(id);
            }
        } catch (error) {
            console.error(`Failed to delete document ${collectionName}/${id}:`, error);
            throw error;
        }
    },
    
    clearCache: () => {
        collectionCache.clear();
    },

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
        if (data.absenteeismRecords) promises.push(dbService.syncCollection(COLLECTIONS.ABSENTEEISM, data.absenteeismRecords));

        if (data.settings) {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), sanitizeForFirestore(data.settings), { merge: true }));
        }
        if (data.privateSettings && user.email === 'admin@gymnasium22.com') {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'secrets'), sanitizeForFirestore(data.privateSettings), { merge: true }));
        }
        if (data.bellSchedule) {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), sanitizeForFirestore({ items: data.bellSchedule })));
        }

        await Promise.all(promises);
    },

    subscribe: (
        onNext: (data: Partial<AppData>) => void,
        onError: (error: Error) => void
    ) => {
        if (!firestoreDB) {
            return () => {};
        }

        let localData: Partial<AppData> = {};
        let isInitialLoad = true;
        const collectionsToLoad = [
            'teachers', 'subjects', 'classes', 'rooms', 
            'schedule', 'schedule2', 'substitutions', 
            'dutyZones', 'dutySchedule', 'nutritionRecords', 
            'absenteeismRecords', 'settings', 'bellSchedule', 'privateSettings'
        ];
        const loadedCollections = new Set<string>();

        let updateTimeout: any;
        const triggerUpdate = (collectionKey?: string) => {
            if (collectionKey) loadedCollections.add(collectionKey);
            
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(async () => {
                // Wait for all collections to load initially before the first update
                if (isInitialLoad && loadedCollections.size < collectionsToLoad.length) {
                    return;
                }

                const data = { ...localData };

                if (isInitialLoad) {
                    isInitialLoad = false;
                }

                onNext(data);
            }, isInitialLoad ? 200 : 50);
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
                triggerUpdate(key as string);
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
        unsubs.push(subColl(COLLECTIONS.ABSENTEEISM, 'absenteeismRecords'));

        // Listen to settings
        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), (snapshot) => {
            if (snapshot.exists()) {
                localData.settings = { ...INITIAL_DATA.settings, ...snapshot.data() };
            } else {
                localData.settings = INITIAL_DATA.settings;
            }
            loadedCollections.add('settings');
            triggerUpdate();
        }, (err) => {
            console.warn("Error reading settings:", err);
            loadedCollections.add('settings'); // Mark as loaded even if failed
            triggerUpdate();
        }));

        // Listen to bells
        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                localData.bellSchedule = data.items || INITIAL_DATA.bellSchedule;
            } else {
                localData.bellSchedule = INITIAL_DATA.bellSchedule;
            }
            loadedCollections.add('bellSchedule');
            triggerUpdate();
        }, (err) => {
            console.warn("Error reading bells:", err);
            loadedCollections.add('bellSchedule');
            triggerUpdate();
        }));

        // Listen to secrets (ONLY if admin)
        const user = auth?.currentUser;
        if (user && user.email === 'admin@gymnasium22.com') {
            unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'secrets'), (snapshot) => {
                if (snapshot.exists()) {
                    localData.privateSettings = snapshot.data();
                } else {
                    localData.privateSettings = INITIAL_DATA.privateSettings;
                }
                loadedCollections.add('privateSettings');
                triggerUpdate();
            }, (err) => {
                console.warn("Error reading secrets:", err);
                loadedCollections.add('privateSettings');
                triggerUpdate();
            }));
        } else {
            // Not an admin or not logged in, mark as "loaded" with empty defaults
            localData.privateSettings = INITIAL_DATA.privateSettings;
            loadedCollections.add('privateSettings');
            triggerUpdate();
        }

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

        // Helper to pick only specific fields from an object (White-listing)
        const pick = (obj: any, fields: string[]) => {
            const result: any = {};
            fields.forEach(f => {
                if (obj && obj[f] !== undefined) result[f] = obj[f];
            });
            return result;
        };

        // Explicitly define public-safe versions of data structures using White-listing
        const publicDataSubset = {
            subjects: data.subjects.map(s => pick(s, ['id', 'name', 'color', 'difficulty', 'requiredRoomType', 'order'])),
            teachers: data.teachers.map(t => pick(t, ['id', 'name', 'subjectIds', 'shifts', 'order'])),
            classes: data.classes.map(c => pick(c, ['id', 'name', 'shift', 'studentsCount', 'order'])),
            rooms: data.rooms.map(r => pick(r, ['id', 'name', 'capacity', 'type', 'order'])),
            schedule: data.schedule.map(s => pick(s, ['id', 'classId', 'subjectId', 'teacherId', 'roomId', 'day', 'period', 'shift', 'direction'])),
            schedule2: data.schedule2.map(s => pick(s, ['id', 'classId', 'subjectId', 'teacherId', 'roomId', 'day', 'period', 'shift', 'direction'])),
            substitutions: data.substitutions.map(s => pick(s, ['id', 'date', 'scheduleItemId', 'originalTeacherId', 'replacementTeacherId', 'replacementRoomId', 'isMerger', 'replacementClassId', 'replacementSubjectId', 'comment', 'dayComment'])),
            bellSchedule: data.bellSchedule.map(b => pick(b, ['shift', 'period', 'start', 'end', 'day', 'cancelled'])),
            settings: pick(data.settings, ['publicScheduleId', 'bellPresets', 'semesterConfig', 'schoolName', 'currentYear']),
            dutyZones: data.dutyZones.map(dz => pick(dz, ['id', 'name', 'description', 'includedRooms', 'order', 'floor'])),
            dutySchedule: data.dutySchedule.map(ds => pick(ds, ['id', 'day', 'shift', 'zoneId', 'teacherId']))
        };

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
