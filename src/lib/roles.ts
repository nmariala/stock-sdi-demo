export const GUEST_USERNAME = process.env.NEXT_PUBLIC_GUEST_USERNAME || 'tamu';

const EXTRA_GUEST_ROLES = (process.env.NEXT_PUBLIC_GUEST_ROLES ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const GUEST_ROLES = new Set(['guest', 'tamu', ...EXTRA_GUEST_ROLES]);

export const isGuestRole = (role?: string | null): boolean =>
  typeof role === 'string' && GUEST_ROLES.has(role.trim().toLowerCase());

export const isGuestAllowedPath = (path: string): boolean =>
  path === '/' ||
  path === '/kalkulator-list-pengiriman' ||
  path.startsWith('/kalkulator-list-pengiriman/') ||
  path === '/mix-barang' ||
  path.startsWith('/mix-barang/');