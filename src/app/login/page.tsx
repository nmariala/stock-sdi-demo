'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { GUEST_USERNAME } from '@/lib/roles';

const EMAIL_SUFFIX = '@durian.sdi';
const REMEMBER_USERNAME_KEY = 'sdi_remembered_username';

type LoginMode = 'staff' | 'tamu';

const tabClass = (active: boolean): string =>
  active
    ? 'rounded-md bg-white py-1.5 text-sm font-semibold text-slate-900 shadow-sm'
    : 'rounded-md py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700';

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberUsername, setRememberUsername] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_USERNAME_KEY);
      if (saved) {
        setUsername(saved);
        setRememberUsername(true);
      }
    } catch {
      // storage tidak tersedia: lanjut tanpa ingat nama pengguna
    }
  }, []);

  const resolveEmail = (): string => {
    if (mode === 'tamu') {
      const g = GUEST_USERNAME.trim().toLowerCase();
      return g.endsWith(EMAIL_SUFFIX) ? g : `${g}${EMAIL_SUFFIX}`;
    }
    const raw = username.trim().toLowerCase();
    return raw.endsWith(EMAIL_SUFFIX) ? raw : `${raw}${EMAIL_SUFFIX}`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'staff' && !username.trim()) {
      setError('Nama pengguna wajib diisi');
      return;
    }
    if (!password) {
      setError('Password wajib diisi');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signIn(resolveEmail(), password);
      if (result.error) {
        setError(result.error);
        return;
      }
      try {
        if (mode === 'staff' && rememberUsername && username.trim()) {
          window.localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim());
        } else if (mode === 'staff') {
          window.localStorage.removeItem(REMEMBER_USERNAME_KEY);
        }
      } catch {
        // storage tidak tersedia: login tetap berjalan normal
      }
      router.replace('/');
    } catch {
      setError('Terjadi kesalahan saat login. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SDI - Sidoarjo</h1>
          <p className="mt-1 text-sm text-slate-500">Sistem Manajemen Stok</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" onClick={() => setMode('staff')} className={tabClass(mode === 'staff')}>
            Staff / Admin
          </button>
          <button type="button" onClick={() => setMode('tamu')} className={tabClass(mode === 'tamu')}>
            Tamu
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'staff' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nama Pengguna
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan nama pengguna"
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
              />
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              Masuk sebagai Tamu. Akses terbatas untuk melihat stok dan kalkulator.
            </p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              autoFocus={mode === 'tamu'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>
          {mode === 'staff' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberUsername}
                onChange={(e) => setRememberUsername(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Ingat nama pengguna
            </label>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Masuk...' : mode === 'tamu' ? 'Masuk sebagai Tamu' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}