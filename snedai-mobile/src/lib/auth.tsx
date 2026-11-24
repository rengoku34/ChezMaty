import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from './api';
import * as storage from './storage';
import type { User } from './types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

const TOKEN_KEY = 'snedai.token';
const USER_KEY = 'snedai.user';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await storage.deleteItem(TOKEN_KEY);
    await storage.deleteItem(USER_KEY);
    setUser(null);
    setStatus('signedOut');
  }, []);

  // Jeton refusé par le serveur (expiré, compte supprimé…) : retour à la connexion.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Au démarrage : on reprend la session mémorisée, si elle est encore valable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await storage.getItem(TOKEN_KEY);
      if (!token) return void (!cancelled && setStatus('signedOut'));
      setAuthToken(token);
      try {
        const { user: fresh } = await api.me();
        if (cancelled) return;
        setUser(fresh);
        await storage.setItem(USER_KEY, JSON.stringify(fresh));
        setStatus('signedIn');
      } catch (error) {
        if (cancelled) return;
        const cached = error instanceof ApiError && error.status === 401 ? null : await storage.getItem(USER_KEY);
        if (cached) {
          // Pas de réseau : on garde la session pour que l'application s'ouvre quand même.
          setUser(JSON.parse(cached) as User);
          setStatus('signedIn');
        } else {
          await clearSession();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const signIn = useCallback(async (token: string, nextUser: User) => {
    setAuthToken(token);
    await storage.setItem(TOKEN_KEY, token);
    await storage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Hors connexion : la session locale est quand même effacée.
    }
    await clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return value;
}
