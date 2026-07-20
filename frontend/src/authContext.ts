import { createContext, useContext } from 'react';

export type AuthContextValue = { user?: string; isLoading: boolean; refresh: () => Promise<unknown> };
export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
};
