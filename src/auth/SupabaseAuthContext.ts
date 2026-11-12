import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AuthContextValue = {
  configured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useSupabaseAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider.');
  return auth;
}
