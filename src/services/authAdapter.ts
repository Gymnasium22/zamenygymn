import { supabase } from './supabase';
import { supabaseUsersService } from './supabase/users';

export interface UnifiedUser {
    id: string;
    email?: string | null;
}

const AUTH_TIMEOUT_MS = 15000;

const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Превышено время ожидания авторизации')), AUTH_TIMEOUT_MS);
        promise.then(
            (value) => {
                window.clearTimeout(timeout);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timeout);
                reject(error);
            }
        );
    });

export interface AuthAdapter {
    getCurrentUser: () => Promise<UnifiedUser | null>;
    onAuthStateChanged: (callback: (user: UnifiedUser | null) => void, onError?: (error: Error) => void) => () => void;
    signIn: (email: string, password: string) => Promise<{ user: UnifiedUser | null; error: Error | null }>;
    signOut: () => Promise<void>;
    getUsersService: () => typeof supabaseUsersService;
}

export const authAdapter: AuthAdapter = {
    getCurrentUser: async () => {
        const { data } = await withTimeout(supabase.auth.getUser());
        return data.user ? { id: data.user.id, email: data.user.email || '' } : null;
    },
    onAuthStateChanged: (callback, onError) => {
        let currentUser: UnifiedUser | null = null;

        // Immediately check current user — onAuthStateChange only fires on changes, not initial state
        withTimeout(supabase.auth.getUser())
            .then(({ data: userData }) => {
                if (userData.user) {
                    const newUser = { id: userData.user.id, email: userData.user.email || '' };
                    currentUser = newUser;
                    callback(newUser);
                } else {
                    currentUser = null;
                    callback(null);
                }
            })
            .catch(onError);

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const newUser = { id: session.user.id, email: session.user.email || '' };
                if (!currentUser || currentUser.id !== newUser.id || currentUser.email !== newUser.email) {
                    currentUser = newUser;
                    callback(currentUser);
                }
            } else {
                if (currentUser !== null) {
                    currentUser = null;
                    callback(null);
                }
            }
        });
        return data.subscription.unsubscribe;
    },
    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { user: null, error };
        return { user: data.user ? { id: data.user.id, email: data.user.email || '' } : null, error: null };
    },
    signOut: async () => {
        await supabase.auth.signOut();
    },
    getUsersService: () => supabaseUsersService
};
