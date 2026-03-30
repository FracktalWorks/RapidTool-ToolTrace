import React, { useState } from 'react';
import { useAuthStore } from '../stores';
import { X, Mail, Lock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await login(email, password);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl overflow-hidden p-8"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight mb-2">Welcome Back</h2>
              <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
                Sign in to save your tool traces and designs.
              </p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[hsl(var(--primary))]" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))] transition-all"
                  required
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[hsl(var(--primary))]" />
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))] transition-all"
                  required
                />
              </div>
              
              {error && (
                <p className="text-[13px] text-red-500 font-medium text-center">{error}</p>
              )}
              
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100"
                style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-btn)' }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
            
            <div className="mt-8 pt-6 border-t border-[hsl(var(--border))] text-center">
              <p className="text-[13px] text-[hsl(var(--muted-foreground))]">
                Don't have an account? <span className="text-[hsl(var(--primary))] font-semibold cursor-pointer hover:underline">Sign up for free</span>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
