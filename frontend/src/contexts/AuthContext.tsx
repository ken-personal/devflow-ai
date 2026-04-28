import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { apiClient, setAccessToken } from '../api/client';

interface User {
  user_id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'member';
  is_active: boolean;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (code: string, redirectUri: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);

  const login = useCallback(async (code: string, redirectUri: string) => {
    const res = await apiClient.post<{ access_token: string; user: User }>('/auth/login', {
      code,
      redirect_uri: redirectUri,
    });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
    window.location.href = '/login';
  }, []);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      // リフレッシュトークン（HttpOnly Cookie）で新トークン取得を試みる
      const refreshRes = await apiClient.post<{ access_token: string }>('/auth/refresh');
      setAccessToken(refreshRes.data.access_token);
      const meRes = await apiClient.get<User>('/auth/me');
      setUser(meRes.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth は AuthProvider の中で使ってください');
  return ctx;
}
