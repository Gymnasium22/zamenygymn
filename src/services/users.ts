import {
    deleteUser,
    getAuth,
    updatePassword,
    User as FirebaseUser
} from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    Timestamp
} from 'firebase/firestore';
import { UserProfile, UserRole, Permission, PageId } from '../types';
import { ROLE_DEFINITIONS } from '../constants';
import { logger } from '../utils/logger';
import { firebaseConfig } from './firebase';

const COLLECTION_NAME = 'users';

const createAuthUser = async (email: string, password: string): Promise<string> => {
    const { initializeApp, getApps, deleteApp } = await import('firebase/app');
    const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
    const appName = 'user-creator';

    const existing = getApps().find((a) => a.name === appName);
    if (existing) {
        await deleteApp(existing).catch(() => {});
    }

    const creatorApp = initializeApp(firebaseConfig, appName);
    const creatorAuth = getAuth(creatorApp);

    try {
        const credential = await createUserWithEmailAndPassword(creatorAuth, email, password);
        return credential.user.uid;
    } finally {
        await deleteApp(creatorApp).catch(() => {});
    }
};

export const getRoleDefaults = (role: UserRole) => {
    return ROLE_DEFINITIONS.find((r) => r.id === role) || ROLE_DEFINITIONS[0];
};

export const usersService = {
    subscribe: (uid: string, onNext: (profile: UserProfile | null) => void, onError?: (error: Error) => void) => {
        const db = getFirestore();
        return onSnapshot(
            doc(db, COLLECTION_NAME, uid),
            (snapshot) => {
                if (!snapshot.exists()) {
                    onNext(null);
                    return;
                }
                const data = snapshot.data();
                onNext({
                    id: snapshot.id,
                    email: data.email || '',
                    displayName: data.displayName || '',
                    firstName: data.firstName || '',
                    role: data.role || 'teacher',
                    isActive: data.isActive !== false,
                    permissions: data.permissions || [],
                    allowedPages: data.allowedPages || [],
                    teacherId: data.teacherId || undefined,
                    organizationId: data.organizationId || undefined,
                    createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt,
                    createdBy: data.createdBy,
                    lastLoginAt: data.lastLoginAt?.toDate?.().toISOString() || data.lastLoginAt
                });
            },
            (err) => {
                logger.error('Error reading user profile:', err);
                onError?.(err);
            }
        );
    },

    getAll: async (_organizationId?: string | null): Promise<UserProfile[]> => {
        const db = getFirestore();
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        return snapshot.docs.map((d) => {
            const data = d.data();
            return {
                id: d.id,
                email: data.email || '',
                displayName: data.displayName || '',
                firstName: data.firstName || '',
                role: data.role || 'teacher',
                isActive: data.isActive !== false,
                permissions: data.permissions || [],
                allowedPages: data.allowedPages || [],
                teacherId: data.teacherId || undefined,
                organizationId: data.organizationId || undefined,
                createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt,
                createdBy: data.createdBy,
                lastLoginAt: data.lastLoginAt?.toDate?.().toISOString() || data.lastLoginAt
            };
        });
    },

    getById: async (uid: string): Promise<UserProfile | null> => {
        const db = getFirestore();
        const snapshot = await getDoc(doc(db, COLLECTION_NAME, uid));
        if (!snapshot.exists()) return null;
        const data = snapshot.data();
        return {
            id: snapshot.id,
            email: data.email || '',
            displayName: data.displayName || '',
            firstName: data.firstName || '',
            role: data.role || 'teacher',
            isActive: data.isActive !== false,
            permissions: data.permissions || [],
            allowedPages: data.allowedPages || [],
            teacherId: data.teacherId || undefined,
            organizationId: data.organizationId || undefined,
            createdAt: data.createdAt?.toDate?.().toISOString() || data.createdAt,
            createdBy: data.createdBy,
            lastLoginAt: data.lastLoginAt?.toDate?.().toISOString() || data.lastLoginAt
        };
    },

    create: async (params: {
        email: string;
        password: string;
        displayName: string;
        firstName?: string;
        role: UserRole;
        permissions?: Permission[];
        allowedPages?: PageId[];
        teacherId?: string | null;
        organizationId?: string | null;
        createdBy?: string;
    }): Promise<UserProfile> => {
        const db = getFirestore();

        const uid = await createAuthUser(params.email, params.password);

        const defaults = getRoleDefaults(params.role);
        const profile: Omit<UserProfile, 'id'> = {
            email: params.email,
            displayName: params.displayName,
            firstName: params.firstName || '',
            role: params.role,
            isActive: true,
            permissions: params.permissions ?? defaults.defaultPermissions,
            allowedPages: params.allowedPages ?? defaults.defaultPages,
            teacherId: params.teacherId,
            organizationId: params.organizationId,
            createdAt: new Date().toISOString(),
            createdBy: params.createdBy
        };

        await setDoc(doc(db, COLLECTION_NAME, uid), {
            ...profile,
            createdAt: Timestamp.now()
        });

        return { id: uid, ...profile };
    },

    update: async (
        uid: string,
        changes: Partial<Omit<UserProfile, 'id' | 'email'>> & { password?: string; firstName?: string; teacherId?: string | null }
    ): Promise<void> => {
        const auth = getAuth();
        const db = getFirestore();

        const { password, ...profileChanges } = changes;

        if (password) {
            // Если это текущий пользователь — можно сменить свой пароль
            const currentUser = auth.currentUser;
            if (currentUser && currentUser.uid === uid) {
                await updatePassword(currentUser, password);
            } else {
                // Для смены пароля другому пользователю нужен Admin SDK или Cloud Function.
                // Пока пропускаем, но можно добавить Cloud Function позже.
                logger.warn('Cannot change password for another user from client. Use Cloud Function or Admin SDK.');
            }
        }

        const sanitizedChanges = Object.fromEntries(
            Object.entries(profileChanges).filter(([, value]) => value !== undefined)
        );
        if (Object.keys(sanitizedChanges).length > 0) {
            await updateDoc(doc(db, COLLECTION_NAME, uid), sanitizedChanges);
        }
    },

    setActive: async (uid: string, isActive: boolean): Promise<void> => {
        const db = getFirestore();
        await updateDoc(doc(db, COLLECTION_NAME, uid), { isActive });
    },

    delete: async (uid: string, firebaseUser?: FirebaseUser | null): Promise<void> => {
        const db = getFirestore();
        await deleteDoc(doc(db, COLLECTION_NAME, uid));

        // Из клиента можно удалить только текущего пользователя.
        // Для удаления любого пользователя нужен Admin SDK / Cloud Function.
        if (firebaseUser && firebaseUser.uid === uid) {
            await deleteUser(firebaseUser);
        }
    },

    updateLastLogin: async (uid: string): Promise<void> => {
        const db = getFirestore();
        try {
            await updateDoc(doc(db, COLLECTION_NAME, uid), { lastLoginAt: Timestamp.now() });
        } catch (e) {
            logger.error('Failed to update last login:', e);
        }
    },

    dismissAppAnnouncement: async (uid: string, publishedAt: string): Promise<void> => {
        const db = getFirestore();
        try {
            await updateDoc(doc(db, COLLECTION_NAME, uid), { dismissedAppAnnouncementAt: publishedAt });
        } catch (e) {
            logger.error('Failed to dismiss app announcement:', e);
        }
    }
};
