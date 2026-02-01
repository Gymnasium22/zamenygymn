
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

export type UserRole = 'admin' | 'teacher' | 'canteen' | 'guest' | null;

interface AuthContextType {
    user: User | null;
    role: UserRole;
    loading: boolean;
    logout: () => Promise<void>;
    setGuestRole: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAIL = 'admin@gymnasium22.com';
const TEACHER_EMAIL = 'teacher@gymnasium22.com';
const CANTEEN_EMAIL = 'canteen@gymnasium22.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            console.warn("Firebase Auth is not initialized.");
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                if (currentUser.email === ADMIN_EMAIL) {
                    setRole('admin');
                } else if (currentUser.email === 'canteen@gymnasium22.com') {
                    setRole('canteen');
                } else if (currentUser.email && currentUser.email.includes('@')) {
                    setRole('teacher');
                } else {
                    setRole('guest');
                }
            } else {
                setRole(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const logout = async () => {
        if (auth) {
            await signOut(auth);
        }
        setRole(null);
    };

    const setGuestRole = () => {
        setRole('guest');
        setLoading(false);
    };

    return (
        <AuthContext.Provider value={{ user, role, loading, logout, setGuestRole }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
