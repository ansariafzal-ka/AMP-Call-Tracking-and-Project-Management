import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, { TOKEN_STORAGE_KEY } from '../api/client';
import type {
  User,
  LoginPayload,
  RegisterPayload,
  AuthResponse,
  MeResponse,
} from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<{ autoLoggedIn: boolean }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)));

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    apiClient
      .get<MeResponse>('/api/auth/me')
      .then((res) => {
        if (!cancelled && res.data?.user) {
          setUser(res.data.user);
          setToken(storedToken);
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const res = await apiClient.post<AuthResponse>('/api/auth/login', payload);
    const { token: newToken, user: loggedInUser } = res.data;
    if (newToken && loggedInUser) {
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      setToken(newToken);
      setUser(loggedInUser);
    } else {
      throw new Error(res.data?.message || 'Login failed');
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await apiClient.post<AuthResponse>('/api/auth/register', payload);
    const { token: newToken, user: newUser } = res.data;
    if (newToken && newUser) {
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      setToken(newToken);
      setUser(newUser);
      return { autoLoggedIn: true };
    }
    return { autoLoggedIn: false };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
