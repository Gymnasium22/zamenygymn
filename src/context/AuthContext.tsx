import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signOut, getAuth } from 'firebase/auth';
import { auth } from '../services/firebase';
import { usersService } from '../services/users';
import { UserProfile, UserRole, Permission, PageId } from '../types';
import { logger } from '../utils/logger';

export type { UserRole };

interface AuthContextType {
    user: User | null;
    role: UserRole | null;
    profile: UserProfile | null;
    permissions: Permission[];
    allowedPages: PageId[];
    loading: boolean;
    logout: () => Promise<void>;
    hasPermission: (permission: Permission) => boolean;
    canViewPage: (pageId: PageId) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Временная миграция: если у пользователя ещё нет профиля, но он входит по старому email,
// создаём профиль на основе email.
const resolveLegacyRole = (email: string | null): UserRole => {
    if (!email) return 'teacher';
    if (email === 'admin@gymnasium22.com') return 'admin';
    if (email === 'teacher@gymnasium22.com') return 'teacher';
    if (email === 'canteen@gymnasium22.com') return 'canteen';
    return 'teacher';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);

    const hasPermission = useCallback(
        (permission: Permission) => {
            return profile?.isActive === true && profile.permissions.includes(permission);
        },
        [profile]
    );

    const canViewPage = useCallback(
        (pageId: PageId) => {
            return profile?.isActive === true && profile.allowedPages.includes(pageId);
        },
        [profile]
    );

    useEffect(() => {
        if (!auth) {
            logger.warn('Firebase Auth is not initialized.');
            setLoading(false);
            return;
        }

        let unsubProfile: (() => void) | null = null;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (unsubProfile) {
                unsubProfile();
                unsubProfile = null;
            }

            if (currentUser) {
                // Обновляем lastLoginAt асинхронно (не ждём)
                usersService.updateLastLogin(currentUser.uid).catch(() => {});

                unsubProfile = usersService.subscribe(
                    currentUser.uid,
                    async (loadedProfile) => {
                        if (!loadedProfile) {
                            // Профиль не найден — возможно, это старый пользователь.
                            // Создаём профиль на основе email.
                            const legacyRole = resolveLegacyRole(currentUser.email);
                            try {
                                const created = await usersService.create({
                                    email: currentUser.email || '',
                                    password: Math.random().toString(36).slice(-12), // Временный пароль, никому не показывается
                                    displayName: currentUser.displayName || currentUser.email || 'Пользователь',
                                    role: legacyRole,
                                    createdBy: 'system_legacy_migration'
                                });
                                setProfile(created);
                                setRole(created.role);
                            } catch (e) {
                                logger.error('Failed to migrate legacy user:', e);
                                setProfile(null);
                                setRole(null);
                            }
                        } else {
                            setProfile(loadedProfile);
                            setRole(loadedProfile.role);
                        }
                        setLoading(false);
                    },
                    () => {
                        setProfile(null);
                        setRole(null);
                        setLoading(false);
                    }
                );
            } else {
                setProfile(null);
                setRole(null);
                setLoading(false);
            }
        });

        return () => {
            unsubscribe();
            if (unsubProfile) unsubProfile();
        };
    }, []);

    const logout = async () => {
        const authInstance = getAuth();
        if (authInstance) await signOut(authInstance);
        setUser(null);
        setProfile(null);
        setRole(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                role,
                profile,
                permissions: profile?.permissions || [],
                allowedPages: profile?.allowedPages || [],
                loading,
                logout,
                hasPermission,
                canViewPage
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
