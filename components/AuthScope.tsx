import type { ReactNode } from 'react';
import { AuthenticatedRouteGuard } from './AuthenticatedRouteGuard';

/** Route guard for (app) / (driver) — uses root `AuthProvider` from app/_layout.tsx. */
export function AuthScope({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthenticatedRouteGuard />
      {children}
    </>
  );
}
