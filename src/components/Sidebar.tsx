'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isGuestRole, isGuestAllowedPath } from '@/lib/roles';

const NAV_ITEMS = [
  { href: '/', label: 'Stok', icon: 'box', exact: true },
  { href: '/masuk', label: 'Barang Masuk', icon: 'masuk' },
  { href: '/keluar', label: 'Barang Keluar', icon: 'keluar' },
  { href: '/kelola-barang', label: 'Kelola Barang', icon: 'create' },
  { href: '/riwayat', label: 'Riwayat', icon: 'clock' },
  { href: '/kalkulator-list-pengiriman', label: 'Kalkulator List Pengiriman', icon: 'calc' },
  { href: '/mix-barang', label: 'Mix Barang', icon: 'cube' },
] as const;

const ICONS: Record<string, string> = {
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  masuk:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  keluar:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
  create:
    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  calc: 'M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V15.75zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V15.75zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15.75zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V15.75zM18.75 14.25H5.25v-6a2.25 2.25 0 012.25-2.25h9a2.25 2.25 0 012.25 2.25v6z',
  cube: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
};

function SidebarIcon({ name }: { name: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name] || ''} />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href);

  const navItems = isGuestRole(profile?.role)
    ? NAV_ITEMS.filter((item) => isGuestAllowedPath(item.href))
    : NAV_ITEMS;

  const nav = (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {navItems.map((item) => {
        const active = isActive(item.href, 'exact' in item && item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <SidebarIcon name={item.icon} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div
        className={`flex items-center border-b border-slate-200 px-4 py-4 ${collapsed ? 'justify-center' : ''}`}
      >
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900">Stok SDI</span>
            <span className="text-[11px] text-slate-400">Manajemen Stok</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="border-t border-slate-200 p-3">
        {!collapsed && profile && (
          <div className="mb-2 px-3 py-1">
            <p className="truncate text-xs font-medium text-slate-700">{profile.nama}</p>
            <p className="text-[11px] text-slate-400 capitalize">{profile.role}</p>
          </div>
        )}
        <button
          onClick={signOut}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
            />
          </svg>
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="ml-3 text-base font-bold tracking-tight text-slate-900">Stok SDI</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/30" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-0 left-0 h-full w-64 bg-white shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 hidden h-screen border-r border-slate-200 bg-white transition-all lg:block ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-4 right-[-12px] z-50 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
        >
          <svg className={`h-3 w-3 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        {sidebarContent}
      </aside>

      {/* Spacer */}
      <div className={`hidden lg:block ${collapsed ? 'w-16' : 'w-60'}`} />
    </>
  );
}