import type { ReactNode } from 'react';
import { AuthenticatedRouteGuard } from './AuthenticatedRouteGuard';

/** Route guard for (app) / (driver) / (auth) — AuthProvider lives in root `_layout` / `_layout.web`. */
export function AuthScope({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthenticatedRouteGuard />
      {children}
    </>
  );
}
