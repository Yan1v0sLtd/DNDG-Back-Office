import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserRoleName } from '@/types/database';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRoleName | null;
  loading: boolean;
  signOut: () => Promise<void>;
  canWriteContent: () => boolean;
  canWriteConfig: () => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRoleName | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setRole(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setRole((data?.role as UserRoleName) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      // The CLIENT-SIDE check is for UI gating only. RLS in Postgres is what
      // actually enforces these — never trust this alone.
      canWriteContent: () => role === 'admin' || role === 'designer',
      canWriteConfig: () => role === 'admin',
    }),
    [session, role, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
