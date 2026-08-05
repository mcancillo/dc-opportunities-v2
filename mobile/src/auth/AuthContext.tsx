// App-wide context: exposes the auth state/actions and a ready-to-use API
// client bound to the current access token.
import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './useAuth';
import { ApiClient } from '../api/client';

type AuthContextValue = ReturnType<typeof useAuth> & { api: ApiClient };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const api = useMemo(() => new ApiClient(auth.getAccessToken), [auth.getAccessToken]);
  const value = useMemo(() => ({ ...auth, api }), [auth, api]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAppAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAppAuth must be used within AuthProvider');
  return ctx;
}
