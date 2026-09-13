'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import type { Profile } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PROFILE_FETCH_TIMEOUT_MS = 10000;
const LOGIN_TIMEOUT_MS = 15000;

const LOGIN_TIMEOUT_ERROR: { name: string; message: string; code: string; status: number } = {
  name: 'LoginTimeoutError',
  message: 'Waktu login habis. Periksa koneksi internet lalu coba lagi.',
  code: 'auth_timeout',
  status: 0,
};

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const result = await Promise.race([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        new Promise<{ data: null; error: { message: string } }>((resolve) => {
          setTimeout(() => resolve({ data: null, error: { message: 'Profil query timed out' } }), PROFILE_FETCH_TIMEOUT_MS);
        }),
      ]);
      const { data, error } = result;
      if (error || !data) return null;
      return data as Profile;
    } catch (e) {
      console.error('PROFILE FETCH ERROR:', e);
      return null;
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (initialSession) {
          setSession(initialSession);
          fetchProfile(initialSession.user.id).then(setProfile);
        }
      } catch (e) {
        console.error('INIT SESSION ERROR:', e);
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        fetchProfile(newSession.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error: authError } = await Promise.race([
      supabase.auth.signInWithPassword({ email, password }),
      new Promise<{ data: { user: null; session: null }; error: typeof LOGIN_TIMEOUT_ERROR }>((resolve) => {
        setTimeout(
          () => resolve({ data: { user: null, session: null }, error: LOGIN_TIMEOUT_ERROR }),
          LOGIN_TIMEOUT_MS
        );
      }),
    ]);
    if (authError) {
      console.error('LOGIN ERROR (website):', {
        name: authError.name,
        status: authError.status,
        code: authError.code,
        message: authError.message,
        email,
      });
      const msg = (authError.message || '').toLowerCase();
      if (authError.code === 'auth_timeout' || authError.name === 'LoginTimeoutError') {
        return { error: 'Waktu login habis. Periksa koneksi internet lalu coba lagi.' };
      }
      if (authError.code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
        return { error: 'Email belum dikonfirmasi. Periksa email Anda.' };
      }
      if (authError.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
        return { error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.' };
      }
      if (authError.code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
        return { error: 'Username atau password salah' };
      }
      return { error: `Login gagal: ${authError.message}` };
    }
    if (!data.session) return { error: 'Gagal mendapatkan sesi' };
    setSession(data.session);
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
