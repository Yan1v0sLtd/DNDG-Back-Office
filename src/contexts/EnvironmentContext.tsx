import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { Environment } from '@/types/database';
import { useAuth } from './AuthContext';

interface EnvState {
  environments: Environment[];
  currentEnv: Environment | null;
  setCurrentEnv: (id: string) => void;
  loading: boolean;
}

const Ctx = createContext<EnvState | null>(null);
const STORAGE_KEY = 'crucible.currentEnvId';

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [currentEnvId, setCurrentEnvId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setEnvironments([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('environments')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        const envs = (data ?? []) as Environment[];
        setEnvironments(envs);
        // Default to dev if nothing stored or stored env is gone.
        if (!currentEnvId || !envs.some((e) => e.id === currentEnvId)) {
          const dev = envs.find((e) => e.name === 'dev') ?? envs[0] ?? null;
          if (dev) {
            setCurrentEnvId(dev.id);
            localStorage.setItem(STORAGE_KEY, dev.id);
          }
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const value = useMemo<EnvState>(
    () => ({
      environments,
      currentEnv: environments.find((e) => e.id === currentEnvId) ?? null,
      setCurrentEnv: (id: string) => {
        setCurrentEnvId(id);
        localStorage.setItem(STORAGE_KEY, id);
      },
      loading,
    }),
    [environments, currentEnvId, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEnvironment(): EnvState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEnvironment must be used within EnvironmentProvider');
  return v;
}
