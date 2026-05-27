import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import api from '../../src/lib/api';
import { clearAdminSession, hasStoredAdminSession } from '../../src/lib/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>(() =>
    hasStoredAdminSession() ? 'checking' : 'denied'
  );

  useEffect(() => {
    if (!hasStoredAdminSession()) return;

    let cancelled = false;

    async function validateSession() {
      try {
        await api.get('/auth/session');
        if (!cancelled) {
          setStatus('allowed');
        }
      } catch {
        clearAdminSession();
        if (!cancelled) {
          setStatus('denied');
        }
      }
    }

    validateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-cyan-300 font-mono uppercase tracking-[0.2em]">
        Verificando acceso…
      </div>
    );
  }

  if (status === 'denied') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}