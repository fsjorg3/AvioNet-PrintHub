import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router';
import { adminApi } from './api/admin';
import { AuthContext, useAuth } from './authContext';


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useQuery({ queryKey: ['admin-session'], queryFn: adminApi.session, retry: false });
  const value = useMemo(() => ({ user: session.data?.user, isLoading: session.isLoading, refresh: session.refetch }), [session.data?.user, session.isLoading, session.refetch]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
