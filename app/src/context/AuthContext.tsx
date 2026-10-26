import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  LoginPayload,
  RegisterPayload,
  loginApi,
  registerApi,
  getMeApi,
} from '../services/auth';
import {
  saveAuthToken,
  getAuthToken,
  removeAuthToken,
  saveUserData,
  getUserData,
  removeUserData,
} from '../services/storage';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore saved session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = await getAuthToken();
        const storedUser = await getUserData();

        if (storedToken) {
          setToken(storedToken);
          if (storedUser) {
            setUser(storedUser);
          }

          // Verify with server in background
          try {
            const meRes = await getMeApi(storedToken);
            if (meRes.status === 'ok' && meRes.user) {
              setUser(meRes.user);
              await saveUserData(meRes.user);
            }
          } catch (verifyErr: any) {
            // Only log out if server explicitly returned 401 Unauthorized or 403 Forbidden
            // If offline, timed out, or network error, keep user logged in with saved profile!
            const status = verifyErr.response?.status;
            if (status === 401 || status === 403) {
              console.log('Token expired or invalid, clearing session');
              await logout();
            } else {
              console.log('Server unreachable / offline. Keeping local user session active.');
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize auth state:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (payload: LoginPayload) => {
    const data = await loginApi(payload);
    setToken(data.token);
    setUser(data.user);
    await saveAuthToken(data.token);
    await saveUserData(data.user);
  };

  const register = async (payload: RegisterPayload) => {
    const data = await registerApi(payload);
    setToken(data.token);
    setUser(data.user);
    await saveAuthToken(data.token);
    await saveUserData(data.user);
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await removeAuthToken();
    await removeUserData();
  };

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

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
