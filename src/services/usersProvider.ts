import { isSupabase } from './dbProvider';
import { usersService as firebaseUsersService } from './users';
import { supabaseUsersService } from './supabase/users';

export const usersService = isSupabase ? supabaseUsersService : firebaseUsersService;
export { getRoleDefaults } from './users';
