import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { AuthContext, type AuthContextValue } from './SupabaseAuthContext';

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let active = true;
    const client = getSupabaseClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setIsLoading(false);
    }).catch((sessionError: unknown) => {
      if (!active) return;
      setError(sessionError instanceof Error ? sessionError.message : 'Could not load your sign-in session.');
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    isLoading,
    session,
    user: session?.user ?? null,
    error,
    clearError: () => setError(null),
    signIn: async (email, password) => {
      setError(null);
      const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        throw signInError;
      }
    },
    signUp: async (email, password) => {
      setError(null);
      const { data, error: signUpError } = await getSupabaseClient().auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        throw signUpError;
      }
      return Boolean(data.session);
    },
    signOut: async () => {
      setError(null);
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        throw signOutError;
      }
    },
  }), [error, isLoading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
