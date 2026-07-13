import { UserRole } from '../types';
import { ROLE_DEFINITIONS } from '../constants';

export const getRoleDefaults = (role: UserRole) => {
    return ROLE_DEFINITIONS.find((r) => r.id === role) || ROLE_DEFINITIONS[0];
};

// Supabase-backed user CRUD — re-export for convenience
export { supabaseUsersService as usersService } from './supabase/users';
