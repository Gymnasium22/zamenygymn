import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAdapter, UnifiedUser } from '../services/authAdapter';
import { UserProfile, UserRole, Permission, PageId } from '../types';

export type { UserRole };

interface AuthContextType {
    user: UnifiedUser | null;
    role: UserRole | null;
    profile: UserProfile | null;
    permissions: Permission[];
    allowedPages: PageId[];
    loading: boolean;
    isBlocked: boolean;
    logout: () => Promise<void>;
    hasPermission: (permission: Permission) => boolean;
    canViewPage: (pageId: PageId) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UnifiedUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [loading, setLoading] = useState(true);
    const [isBlocked, setIsBlocked] = useState(false);

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
        let unsubProfile: (() => void) | null = null;

        console.log('[AuthContext] Starting auth state subscription');

        const unsubscribe = authAdapter.onAuthStateChanged(async (currentUser) => {
            console.log('[AuthContext] Auth state changed:', currentUser ? { id: currentUser.id, email: currentUser.email } : null);
            setUser(currentUser);

            if (unsubProfile) {
                unsubProfile();
                unsubProfile = null;
            }

            if (currentUser) {
                const usersService = authAdapter.getUsersService();
                const uid = currentUser.id;
                console.log('[AuthContext] User found, subscribing to profile for uid:', uid);

                usersService.updateLastLogin(uid).catch(() => {});

                unsubProfile = usersService.subscribe(
                    uid,
                    async (loadedProfile) => {
                        console.log('[AuthContext] Profile loaded:', loadedProfile);
                        if (loadedProfile && loadedProfile.isActive) {
                            setProfile(loadedProfile);
                            setRole(loadedProfile.role);
                            setIsBlocked(false);
                        } else if (loadedProfile && !loadedProfile.isActive) {
                            setProfile(null);
                            setRole(null);
                            setIsBlocked(true);
                        } else {
                            setProfile(null);
                            setRole(null);
                            setIsBlocked(false);
                        }
                        setLoading(false);
                    },
                    (error) => {
                        console.error('[AuthContext] Profile subscription error:', error);
                        setProfile(null);
                        setRole(null);
                        setIsBlocked(false);
                        setLoading(false);
                    }
                );
            } else {
                console.log('[AuthContext] No user, setting loading false');
                setProfile(null);
                setRole(null);
                setIsBlocked(false);
                setLoading(false);
            }
        });

        return () => {
            unsubscribe();
            if (unsubProfile) unsubProfile();
        };
    }, []);

    const logout = async () => {
        await authAdapter.signOut();
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
                isBlocked,
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
