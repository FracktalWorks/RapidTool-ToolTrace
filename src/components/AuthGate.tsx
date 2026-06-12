/**
 * AuthGate — RapidTool cross-tool SSO entry guard.
 *
 * On mount it validates the shared .appliedadditive.com session cookie via
 * `fetchCurrentUser()`. While checking → splash. If no session → bounce to the
 * Portal login with a return URL (single sign-on point). When VITE_DISABLE_AUTH
 * is true (local dev) it's a transparent pass-through using a mock user.
 */
import { useEffect, type ReactNode } from 'react';
import { LoadingOverlay } from '@rapidtool/cad-ui';
import { useAuthStore } from '../stores/authStore';

const AUTH_DISABLED = import.meta.env.VITE_DISABLE_AUTH === 'true';
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://portal.appliedadditive.com';
const APP_URL = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');

function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-[hsl(var(--background))]">
      <LoadingOverlay isVisible message={message} positioning="absolute" type="import" />
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, fetchCurrentUser } = useAuthStore();

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  if (AUTH_DISABLED) return <>{children}</>;

  if (isLoading) return <FullScreenLoader message="Checking your session…" />;

  if (!isAuthenticated) {
    // Single sign-on: log in once at the Portal, return here afterwards.
    const returnTo = encodeURIComponent(APP_URL || window.location.href);
    window.location.href = `${PORTAL_URL}/login?redirect=${returnTo}`;
    return <FullScreenLoader message="Redirecting to sign in…" />;
  }

  return <>{children}</>;
}

export default AuthGate;
