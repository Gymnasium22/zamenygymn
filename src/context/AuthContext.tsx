import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAdapter, UnifiedUser } from '../services/authAdapter';
import { UserProfile, UserRole, Permission, PageId, Organization } from '../types';
import { supabase } from '../services/supabase';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';

export type { UserRole };

const LAST_ORG_KEY = 'gym_last_organization_id';

const mapOrganization = (o: Record<string, unknown>): Organization => ({
    id: o.id as string,
    name: o.name as string,
    type: (o.type as string) || undefined,
    city: (o.city as string) || undefined,
    address: (o.address as string) || undefined,
    contactEmail: (o.contact_email as string) || undefined,
    logoUrl: (o.logo_url as string) || undefined,
    isActive: (o.is_active as boolean) !== false,
    createdAt: o.created_at as string,
    updatedAt: o.updated_at as string
});

interface AuthContextType {
    user: UnifiedUser | null;
    role: UserRole | null;
    profile: UserProfile | null;
    organizationId: string | null;
    organizations: Organization[];
    isSuperAdmin: boolean;
    permissions: Permission[];
    allowedPages: PageId[];
    loading: boolean;
    isBlocked: boolean;
    logout: () => Promise<void>;
    hasPermission: (permission: Permission) => boolean;
    canViewPage: (pageId: PageId) => boolean;
    switchOrganization: (id: string | null) => void;
    refreshOrganizations: () => Promise<Organization[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UnifiedUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isBlocked, setIsBlocked] = useState(false);

    const isSuperAdmin = role === 'superadmin';

    const loadOrganizations = useCallback(async () => {
        try {
            const { data, error } = await supabase.from('organizations').select('*').order('name');
            if (error) throw error;
            const list = (data || []).map(mapOrganization);
            setOrganizations(list);
            return list;
        } catch (e) {
            console.error('[AuthContext] Failed to load organizations:', e);
            return [];
        }
    }, []);

    const resolveOrganizationId = useCallback(
        async (loadedProfile: UserProfile | null) => {
            if (!loadedProfile) {
                setCurrentOrganizationId(null);
                return;
            }

            const profileOrgId = loadedProfile.organizationId || null;
            const lastOrgId = safeLocalStorageGet(LAST_ORG_KEY);

            if (loadedProfile.role === 'superadmin') {
                const list = await loadOrganizations();
                const fallbackId = profileOrgId || lastOrgId || list[0]?.id || null;
                // Ensure the chosen id still exists
                const exists = list.some((o) => o.id === fallbackId);
                const resolved = exists ? fallbackId : list[0]?.id || profileOrgId || null;
                setCurrentOrganizationId(resolved);
                if (resolved) safeLocalStorageSet(LAST_ORG_KEY, resolved);
            } else {
                setCurrentOrganizationId(profileOrgId);
                if (profileOrgId) safeLocalStorageSet(LAST_ORG_KEY, profileOrgId);
                // Load current org name for non-superadmin users
                if (profileOrgId) {
                    try {
                        const { data, error } = await supabase.from('organizations').select('*').eq('id', profileOrgId).single();
                        if (!error && data) {
                            setOrganizations([mapOrganization(data)]);
                        } else {
                            setOrganizations([]);
                        }
                    } catch (e) {
                        console.error('[AuthContext] Failed to load current organization:', e);
                        setOrganizations([]);
                    }
                } else {
                    setOrganizations([]);
                }
            }
        },
        [loadOrganizations]
    );

    const switchOrganization = useCallback(
        (id: string | null) => {
            setCurrentOrganizationId(id);
            if (id) safeLocalStorageSet(LAST_ORG_KEY, id);
        },
        []
    );

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
                            await resolveOrganizationId(loadedProfile);
                        } else if (loadedProfile && !loadedProfile.isActive) {
                            setProfile(null);
                            setRole(null);
                            setIsBlocked(true);
                            setCurrentOrganizationId(null);
                        } else {
                            setProfile(null);
                            setRole(null);
                            setIsBlocked(false);
                            setCurrentOrganizationId(null);
                        }
                        setLoading(false);
                    },
                    (error) => {
                        console.error('[AuthContext] Profile subscription error:', error);
                        setProfile(null);
                        setRole(null);
                        setIsBlocked(false);
                        setCurrentOrganizationId(null);
                        setLoading(false);
                    }
                );
            } else {
                console.log('[AuthContext] No user, setting loading false');
                setProfile(null);
                setRole(null);
                setIsBlocked(false);
                setCurrentOrganizationId(null);
                setOrganizations([]);
                setLoading(false);
            }
        });

        return () => {
            unsubscribe();
            if (unsubProfile) unsubProfile();
        };
    }, [resolveOrganizationId]);

    const logout = async () => {
        await authAdapter.signOut();
        setUser(null);
        setProfile(null);
        setRole(null);
        setCurrentOrganizationId(null);
        setOrganizations([]);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                role,
                profile,
                organizationId: currentOrganizationId,
                organizations,
                isSuperAdmin,
                permissions: profile?.permissions || [],
                allowedPages: profile?.allowedPages || [],
                loading,
                isBlocked,
                logout,
                hasPermission,
                canViewPage,
                switchOrganization,
                refreshOrganizations: loadOrganizations
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
