import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api/client';

export interface User {
  id: string;
  fullName: string;
  login: string | null;
  role: 'LEADER' | 'DEPUTY' | 'CURATOR' | 'EMPLOYEE';
  rank: string | null;
  division: string | null;
}

export const ROLE_LABELS: Record<User['role'], string> = {
  LEADER: 'Лидер',
  DEPUTY: 'Заместитель',
  CURATOR: 'Куратор',
  EMPLOYEE: 'Сотрудник',
};

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: User['role'][]) => boolean;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
  hasRole: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (login: string, password: string) => {
    const data = await api.post<{ user: User }>('/auth/login', { login, password });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const hasRole = useCallback(
    (...roles: User['role'][]) => (user ? roles.includes(user.role) : false),
    [user]
  );

  return <Ctx.Provider value={{ user, loading, login, logout, refresh, hasRole }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
