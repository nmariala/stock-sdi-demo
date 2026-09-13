'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '@/lib/api';
import type { Profile } from '@/types';

// ---------------------------------------------------------------------------
// Custom authentication (Stock SDI Demo API).
// Sesion dikelola SERVER via cookie HttpOnly (`hl_stock_demo_session`).
// Frontend tidak pernah menyimpan token di localStorage/sessionStorage/state —
// cookie ditangani otomatis oleh browser (fetch dengan credentials: "include").
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const LOGIN_TIMEOUT_MS = 15000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    return { ok: false, status: 0, data: null };
  }
  let data: T | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const profile = useMemo<Profile | null>(
    () => (user ? { id: String(user.id), nama: user.name, role: user.role } : null),
    [user]
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { ok, status, data } = await authFetch('/api/auth/me');
        if (cancelled) return;
        if (ok && status === 200) {
          const u = (data as { data?: { user?: AuthUser } } | null)?.data?.user;
          if (u) setUser(u);
        }
      } catch {
        // API tidak terjangkau: lanjut sebagai "belum masuk" (coba lagi by user).
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const res = await Promise.race([
        fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }),
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => {
            const e = new Error('Waktu login habis');
            e.name = 'AuthTimeoutError';
            reject(e);
          }, LOGIN_TIMEOUT_MS);
        }),
      ]);

      let data: { error?: { message?: string }; data?: { user: AuthUser } } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.status === 401) {
        return { error: data?.error?.message || 'Username atau password salah' };
      }
      if (res.status === 429) {
        return { error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.' };
      }
      if (res.status === 400) {
        return { error: data?.error?.message || 'Login gagal. Periksa input Anda.' };
      }
      if (!res.ok) {
        return { error: 'Login gagal. Silakan coba lagi.' };
      }

      const u = data?.data?.user;
      if (!u) return { error: 'Gagal mendapatkan sesi' };
      setUser(u);
      return {};
    } catch (err) {
      if (err instanceof Error && err.name === 'AuthTimeoutError') {
        return { error: 'Waktu login habis. Periksa koneksi internet lalu coba lagi.' };
      }
      return { error: 'Tidak dapat terhubung ke server aplikasi. Coba lagi.' };
    }
  };

  const signOut = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // logout tetap dijalankan di sisi client walau request gagal
    }
    setUser(null);
  };

  const value: AuthContextType = { user, profile, loading, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}