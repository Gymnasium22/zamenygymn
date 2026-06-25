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
            if (!profile || profile.isActive !== true) return false;
            // Администратор по умолчанию имеет доступ ко всем страницам,
            // даже если в allowedPages ещё не прописан новый раздел.
            if (profile.role === 'admin') return true;
            return profile.allowedPages.includes(pageId);
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
                        if (loadedProfile && loadedProfile.isActive) {
                            setProfile(loadedProfile);
                            setRole(loadedProfile.role);
                        } else {
                            setProfile(null);
                            setRole(null);
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
