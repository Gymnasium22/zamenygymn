import { AppData } from '../types';
import { INITIAL_DATA } from '../constants';
import { formatDateISO } from '../utils/helpers';
import { logger } from '../utils/logger';
import { firestoreDB, auth } from './firebase';
import { collection, doc, setDoc, writeBatch, onSnapshot, getDocs, query, deleteDoc, getDoc, where, orderBy } from 'firebase/firestore';

// Сколько последних дней загружать для больших журнальных коллекций
const RECENT_RECORDS_DAYS = 90;

const getRecentCutoffDate = (): string => {
    const date = new Date();
    date.setDate(date.getDate() - RECENT_RECORDS_DAYS);
    return formatDateISO(date);
};

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
const collectionCache = new Map<string, Map<string, Record<string, unknown>>>();

// Сериализация syncCollection по коллекциям (предотвращает race conditions)
const syncLocks = new Map<string, Promise<void>>();

const withSyncLock = async (collectionName: string, fn: () => Promise<void>): Promise<void> => {
    const previous = syncLocks.get(collectionName) || Promise.resolve();
    const next = previous.then(fn).catch((err) => {
        // Не ломаем цепочку — следующий вызов может продолжить
        throw err;
    });
    syncLocks.set(collectionName, next);
    // Очищаем завершенные промисы, чтобы не накапливать память
    next.finally(() => {
        if (syncLocks.get(collectionName) === next) {
            syncLocks.delete(collectionName);
        }
    });
    return next;
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

// Helper to remove undefined values which Firebase doesn't support
const sanitizeForFirestore = <T>(data: T): T | null => {
    if (data === null || data === undefined) {
        return null; // Convert undefined to null for Firestore compatibility
    }

    if (typeof data === 'object') {
        if (Array.isArray(data)) {
            return data.map((item) => sanitizeForFirestore(item)).filter((item) => item !== undefined) as unknown as T;
        }

        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            const sanitizedValue = sanitizeForFirestore(value);
            if (sanitizedValue !== undefined) {
                sanitized[key] = sanitizedValue;
            }
        }
        return sanitized as unknown as T;
    }

    return data;
};

// Глубокое сравнение объектов
const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const aRecord = a as Record<string, unknown>;
        const bRecord = b as Record<string, unknown>;

        const keysA = Object.keys(aRecord);
        const keysB = Object.keys(bRecord);

        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual(aRecord[key], bRecord[key])) return false;
        }
        return true;
    }

    return false;
};

// Wrapper to safely execute getDocs even if it fails
async function awaitHZ<T>(
    fn: () => Promise<T>,
    options: { throwOnError?: boolean } = {}
): Promise<T | { docs: Array<Record<string, unknown>> }> {
    try {
        return await fn();
    } catch (e) {
        logger.error('Firestore read error (likely quota):', e);
        if (options.throwOnError) {
            throw e; // Re-throw for UI error handling
        }
        // Return empty snapshot structure to prevent crash in loop
        return { docs: [] };
    }
}

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
            logger.error(`Failed to delete document ${collectionName}/${id}:`, error);
            throw error;
        }
    },

    clearCache: () => {
        collectionCache.clear();
    },

    // Оптимизированная синхронизация с использованием локального кеша
    syncCollection: async <T extends { id: string }>(collectionName: string, items: T[]) => {
        if (!firestoreDB) return;
        await withSyncLock(collectionName, async () => {
            // Читаем кеш один раз в начале, чтобы избежать гонки с onSnapshot
            const existingCache = collectionCache.get(collectionName);
            const cachedItems = existingCache ? new Map(existingCache) : new Map();

            // Создаем Map из новых элементов
            const newItemsMap = new Map<string, Record<string, unknown>>();
            items.forEach((item) => {
                if (item && item.id) {
                    newItemsMap.set(item.id, sanitizeForFirestore(item) as Record<string, unknown>);
                }
            });

            // Вычисляем операции только на основе локальной копии кеша
            const operations: { type: 'create' | 'update' | 'delete'; item?: Record<string, unknown>; id: string }[] = [];

            // Удаление элементов, которые есть в кеше, но нет в новых данных
            cachedItems.forEach((_, id) => {
                if (!newItemsMap.has(id)) {
                    operations.push({ type: 'delete', id });
                }
            });

            // Создание/обновление элементов
            newItemsMap.forEach((item, id) => {
                const cachedItem = cachedItems.get(id);

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
                            cachedItems.delete(op.id);
                        } else {
                            // Используем setDoc с merge: true для надежности
                            batch.set(docRef, op.item, { merge: true });
                            cachedItems.set(op.id, op.item);
                        }
                    });

                    await batch.commit();
                }

                // Атомарно заменяем кеш только после успешной записи
                collectionCache.set(collectionName, cachedItems);
            } catch (error) {
                logger.error(`Failed to sync ${collectionName}:`, error);
                throw error;
            }
        });
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
            const querySnapshot = (await awaitHZ(async () => await getDocs(q), { throwOnError: true })) as {
                docs: Array<{ id: string; data: () => Record<string, unknown> }>;
            };

            const cachedItems = new Map<string, Record<string, unknown>>();
            querySnapshot.docs.forEach((doc) => {
                cachedItems.set(doc.id, doc.data() as Record<string, unknown>);
            });

            collectionCache.set(collectionName, cachedItems);
        } catch (error) {
            logger.error(`Failed to sync cache for ${collectionName}:`, error);
            // Не бросаем ошибку, чтобы не ломать загрузку
        }
    },

    save: async (data: Partial<AppData>, currentUser?: { email?: string | null } | null) => {
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
        if (data.nutritionRecords)
            promises.push(dbService.syncCollection(COLLECTIONS.NUTRITION, data.nutritionRecords));
        if (data.absenteeismRecords)
            promises.push(dbService.syncCollection(COLLECTIONS.ABSENTEEISM, data.absenteeismRecords));

        // Атомарно записываем config-документы одним batch
        const hasConfigDocs = data.settings || (data.privateSettings && user.email === 'admin@gymnasium22.com') || data.bellSchedule;
        if (hasConfigDocs) {
            promises.push(
                (async () => {
                    const batch = writeBatch(firestoreDB);
                    if (data.settings) {
                        batch.set(
                            doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'),
                            sanitizeForFirestore(data.settings),
                            { merge: true }
                        );
                    }
                    if (data.privateSettings && user.email === 'admin@gymnasium22.com') {
                        batch.set(
                            doc(firestoreDB, COLLECTIONS.CONFIG, 'secrets'),
                            sanitizeForFirestore(data.privateSettings),
                            { merge: true }
                        );
                    }
                    if (data.bellSchedule) {
                        batch.set(
                            doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'),
                            sanitizeForFirestore({ items: data.bellSchedule })
                        );
                    }
                    await batch.commit();
                })()
            );
        }

        await Promise.all(promises);
    },

    subscribe: (onNext: (data: Partial<AppData>) => void, onError: (error: Error) => void) => {
        if (!firestoreDB) {
            return () => {};
        }

        const localData: Partial<AppData> = {};
        let isInitialLoad = true;
        const collectionsToLoad = [
            'teachers',
            'subjects',
            'classes',
            'rooms',
            'schedule',
            'schedule2',
            'substitutions',
            'dutyZones',
            'dutySchedule',
            'nutritionRecords',
            'absenteeismRecords',
            'settings',
            'bellSchedule',
            'privateSettings'
        ];
        const loadedCollections = new Set<string>();

        let updateTimeout: ReturnType<typeof setTimeout> | undefined;
        const triggerUpdate = (collectionKey?: string) => {
            if (collectionKey) loadedCollections.add(collectionKey);

            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(
                async () => {
                    // Wait for all collections to load initially before the first update
                    if (isInitialLoad && loadedCollections.size < collectionsToLoad.length) {
                        return;
                    }

                    const data = { ...localData };

                    if (isInitialLoad) {
                        isInitialLoad = false;
                    }

                    onNext(data);
                },
                isInitialLoad ? 200 : 50
            );
        };

        const unsubs: (() => void)[] = [];
        const recentCutoff = getRecentCutoffDate();

        const subColl = (colName: string, key: keyof AppData, constraints: Parameters<typeof query>[1][] = []) => {
            const q = query(collection(firestoreDB, colName), ...constraints);
            return onSnapshot(
                q,
                (snapshot) => {
                    const items = snapshot.docs.map((d) => d.data());

                    // IMPORTANT: Populate the internal cache with data from Firestore
                    // This ensures that when syncCollection runs (e.g. on delete),
                    // it knows what currently exists in the DB to calculate deletions correctly.
                    const cachedItems = new Map<string, Record<string, unknown>>();
                    items.forEach((item: Record<string, unknown>) => {
                        if (item && item.id) {
                            cachedItems.set(item.id as string, item);
                        }
                    });
                    collectionCache.set(colName, cachedItems);

                    // Sort items based on 'order' property client-side
                    items.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
                        const orderA = typeof a.order === 'number' ? a.order : 999999;
                        const orderB = typeof b.order === 'number' ? b.order : 999999;
                        return orderA - orderB;
                    });
                    (localData as Record<string, unknown>)[key] = items;
                    triggerUpdate(key as string);
                },
                (err) => {
                    logger.warn(`Error reading ${colName}:`, err);
                    loadedCollections.add(key as string);
                    triggerUpdate();
                    onError?.(err);
                }
            );
        };

        unsubs.push(subColl(COLLECTIONS.TEACHERS, 'teachers'));
        unsubs.push(subColl(COLLECTIONS.SUBJECTS, 'subjects'));
        unsubs.push(subColl(COLLECTIONS.CLASSES, 'classes'));
        unsubs.push(subColl(COLLECTIONS.ROOMS, 'rooms'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_1, 'schedule'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_2, 'schedule2'));
        unsubs.push(
            subColl(COLLECTIONS.SUBSTITUTIONS, 'substitutions', [
                where('date', '>=', recentCutoff),
                orderBy('date', 'desc')
            ])
        );
        unsubs.push(subColl(COLLECTIONS.DUTY_ZONES, 'dutyZones'));
        unsubs.push(subColl(COLLECTIONS.DUTY_SCHEDULE, 'dutySchedule'));
        unsubs.push(
            subColl(COLLECTIONS.NUTRITION, 'nutritionRecords', [
                where('date', '>=', recentCutoff),
                orderBy('date', 'desc')
            ])
        );
        unsubs.push(
            subColl(COLLECTIONS.ABSENTEEISM, 'absenteeismRecords', [
                where('date', '>=', recentCutoff),
                orderBy('date', 'desc')
            ])
        );

        // Listen to settings (individual document — avoids permission issues with collection-wide queries)
        unsubs.push(
            onSnapshot(
                doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'),
                (snapshot) => {
                    if (snapshot.exists()) {
                        localData.settings = { ...INITIAL_DATA.settings, ...snapshot.data() };
                    } else {
                        localData.settings = INITIAL_DATA.settings;
                    }
                    loadedCollections.add('settings');
                    triggerUpdate();
                },
                (err) => {
                    logger.warn('Error reading settings:', err);
                    loadedCollections.add('settings');
                    triggerUpdate();
                }
            )
        );

        // Listen to bells
        unsubs.push(
            onSnapshot(
                doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'),
                (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();
                        localData.bellSchedule = data.items || INITIAL_DATA.bellSchedule;
                    } else {
                        localData.bellSchedule = INITIAL_DATA.bellSchedule;
                    }
                    loadedCollections.add('bellSchedule');
                    triggerUpdate();
                },
                (err) => {
                    logger.warn('Error reading bells:', err);
                    loadedCollections.add('bellSchedule');
                    triggerUpdate();
                }
            )
        );

        // Listen to secrets (ONLY if admin)
        const user = auth?.currentUser;
        if (user && user.email === 'admin@gymnasium22.com') {
            unsubs.push(
                onSnapshot(
                    doc(firestoreDB, COLLECTIONS.CONFIG, 'secrets'),
                    (snapshot) => {
                        if (snapshot.exists()) {
                            localData.privateSettings = snapshot.data();
                        } else {
                            localData.privateSettings = INITIAL_DATA.privateSettings;
                        }
                        loadedCollections.add('privateSettings');
                        triggerUpdate();
                    },
                    (err) => {
                        logger.warn('Error reading secrets:', err);
                        loadedCollections.add('privateSettings');
                        triggerUpdate();
                    }
                )
            );
        } else {
            localData.privateSettings = INITIAL_DATA.privateSettings;
            loadedCollections.add('privateSettings');
            triggerUpdate();
        }

        return () => {
            unsubs.forEach((unsub) => unsub());
            clearTimeout(updateTimeout);
        };
    },

    exportJson: (data: AppData) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gymnasium_backup_${formatDateISO()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    setPublicData: async (id: string, data: AppData) => {
        if (!firestoreDB) throw new Error('Database not initialized');
        const user = auth?.currentUser;
        if (!user || user.email !== 'admin@gymnasium22.com') throw new Error('Нет прав.');

        // Helper to pick only specific fields from an object (White-listing)
        const pick = <T extends object>(obj: T, fields: string[]) => {
            const result: Record<string, unknown> = {};
            const source = obj as Record<string, unknown>;
            fields.forEach((f) => {
                if (Object.prototype.hasOwnProperty.call(source, f) && source[f] !== undefined) {
                    result[f] = source[f];
                }
            });
            return result;
        };

        // Explicitly define public-safe versions of data structures using White-listing
        const publicDataSubset = {
            subjects: data.subjects.map((s) =>
                pick(s, ['id', 'name', 'color', 'difficulty', 'requiredRoomType', 'order'])
            ),
            teachers: data.teachers.map((t) => pick(t, ['id', 'name', 'subjectIds', 'shifts', 'order'])),
            classes: data.classes.map((c) => pick(c, ['id', 'name', 'shift', 'studentsCount', 'order'])),
            rooms: data.rooms.map((r) => pick(r, ['id', 'name', 'capacity', 'type', 'order'])),
            schedule: data.schedule.map((s) =>
                pick(s, ['id', 'classId', 'subjectId', 'teacherId', 'roomId', 'day', 'period', 'shift', 'direction'])
            ),
            schedule2: data.schedule2.map((s) =>
                pick(s, ['id', 'classId', 'subjectId', 'teacherId', 'roomId', 'day', 'period', 'shift', 'direction'])
            ),
            substitutions: data.substitutions.map((s) =>
                pick(s, [
                    'id',
                    'date',
                    'scheduleItemId',
                    'originalTeacherId',
                    'replacementTeacherId',
                    'replacementRoomId',
                    'isMerger',
                    'replacementClassId',
                    'replacementSubjectId',
                    'comment',
                    'dayComment'
                ])
            ),
            bellSchedule: data.bellSchedule.map((b) =>
                pick(b, ['shift', 'period', 'start', 'end', 'day', 'cancelled'])
            ),
            settings: pick(data.settings, [
                'publicScheduleId',
                'bellPresets',
                'semesterConfig',
                'schoolName',
                'currentYear'
            ]),
            dutyZones: data.dutyZones.map((dz) =>
                pick(dz, ['id', 'name', 'description', 'includedRooms', 'order', 'floor'])
            ),
            dutySchedule: data.dutySchedule.map((ds) => pick(ds, ['id', 'day', 'shift', 'zoneId', 'teacherId']))
        };

        const cleanData = sanitizeForFirestore(publicDataSubset);
        await setDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id), cleanData);
    },

    getPublicData: async (id: string): Promise<AppData | null> => {
        if (!firestoreDB) return null;
        try {
            const d = await getDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id));
            if (d.exists()) return d.data() as AppData;
            return null;
        } catch (error) {
            logger.error(error);
            return null;
        }
    },

    deletePublicData: async (id: string) => {
        if (!firestoreDB) return;
        await deleteDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id));
    }
};
