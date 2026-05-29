import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { AuthenticatedRouteGuard } from './AuthenticatedRouteGuard';

/** Wraps authenticated route groups so Supabase is not loaded on public marketing pages. */
export function AuthScope({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedRouteGuard />
      {children}
    </AuthProvider>
  );
}
