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
import { LoginPage } from './LoginPage';

const AUTH_DISABLED = import.meta.env.VITE_DISABLE_AUTH === 'true';

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

  // No shared session → show our own sign-in (which also offers the Portal hop).
  // If the user is already logged into Portal/Fixture, fetchCurrentUser above will
  // have authenticated them via the shared cookie and we never reach here.
  if (!isAuthenticated) return <LoginPage />;

  return <>{children}</>;
}

export default AuthGate;
