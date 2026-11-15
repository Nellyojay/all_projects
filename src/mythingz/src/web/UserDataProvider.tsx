import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSupabaseAuth } from '../../../auth/SupabaseAuthContext';
import { supabase } from '../../../lib/supabase';

export type UserData = {
  id: string;
  auth_id: string;
  first_name: string | null;
  second_name: string | null;
};

type UserDataContextValue = {
  userData: UserData | null;
  isLoading: boolean;
  error: string | null;
};

const UserDataContext = createContext<UserDataContextValue | null>(null);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user } = useSupabaseAuth();
  const userId = user?.id ?? null;
  const [result, setResult] = useState<{
    authId: string;
    userData: UserData | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;

    if (!userId) return () => { active = false; };

    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('profiles')
          .select('id, auth_id, first_name, second_name')
          .eq('auth_id', userId)
          .maybeSingle();
        if (queryError) throw queryError;
        if (active) setResult({ authId: userId, userData: data as UserData | null, error: null });
      } catch (loadError: unknown) {
        console.error('Unable to load user profile', loadError);
        if (active) {
          setResult({
            authId: userId,
            userData: null,
            error: loadError instanceof Error ? loadError.message : 'Could not load your profile.',
          });
        }
      }
    })();

    return () => { active = false; };
  }, [userId]);

  const currentResult = result?.authId === userId ? result : null;

  return (
    <UserDataContext.Provider value={{
      userData: currentResult?.userData ?? null,
      isLoading: Boolean(userId && !currentResult),
      error: currentResult?.error ?? null,
    }}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData() {
  const context = useContext(UserDataContext);
  if (!context) throw new Error('useUserData must be used within UserDataProvider.');
  return context;
}
