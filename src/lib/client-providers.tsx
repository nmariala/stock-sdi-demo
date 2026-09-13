'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isGuestRole, isGuestAllowedPath } from '@/lib/roles';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session && pathname !== '/login') {
      router.replace('/login');
    } else if (session && pathname === '/login') {
      router.replace('/');
    } else if (session && isGuestRole(profile?.role) && !isGuestAllowedPath(pathname)) {
      router.replace('/');
    } else {
      setReady(true);
    }
  }, [session, profile, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  if (!session && pathname !== '/login') return null;
  if (session && pathname === '/login') return null;
  if (!ready) return null;

  return <>{children}</>;
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
