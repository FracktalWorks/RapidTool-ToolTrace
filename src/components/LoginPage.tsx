/**
 * LoginPage — ToolTrace standalone sign-in / register.
 *
 * Hits the shared RapidTool backend via the ported authStore, so a successful
 * login sets the same .appliedadditive.com cookie used across the family. Shown by
 * AuthGate when there's no session (and we weren't auto-authenticated by an existing
 * Portal/Fixture cookie). Also offers a one-click hop to the Portal for SSO.
 */
import { useState, type FormEvent } from 'react';
import { RapidToolLogo } from '@rapidtool/cad-ui';
import { Hammer } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://portal.appliedadditive.com';

const inputCls =
  'w-full h-10 px-3 text-[13px] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] ' +
  'focus:outline-none focus:border-[hsl(var(--primary))] transition-colors';

export function LoginPage() {
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (mode === 'register') {
        await register(email, password, name);
      }
      await login(email, password);
      // On success the store flips isAuthenticated → AuthGate renders the app.
      // If the Portal launched us with ?redirect=, honour it.
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      if (redirect) window.location.href = decodeURIComponent(redirect);
    } catch {
      /* error surfaced via the store */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--workspace-bg))] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 shadow-xl">
        <div className="flex flex-col items-center gap-2 mb-6">
          <RapidToolLogo productName="ToolTrace" icon={<Hammer size={18} />} />
          <p className="text-[12px] text-[hsl(var(--muted-foreground))]">
            {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'register' && (
            <input
              className={inputCls}
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          )}
          <input
            className={inputCls}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <p className="text-[12px] text-[hsl(var(--destructive))]">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-10 rounded-xl text-[13px] font-medium text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {isLoading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { clearError(); setMode(mode === 'login' ? 'register' : 'login'); }}
          className="mt-3 w-full text-center text-[12px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          {mode === 'login' ? "Need an account? Register" : 'Have an account? Sign in'}
        </button>

        <div className="mt-5 pt-4 border-t border-[hsl(var(--border))] text-center">
          <a
            href={`${PORTAL_URL}/login?redirect=${encodeURIComponent(window.location.href)}`}
            className="text-[12px] text-[hsl(var(--primary))] hover:underline"
          >
            Sign in via RapidTool Portal →
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
