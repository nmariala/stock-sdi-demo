import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import ClientProviders from '@/lib/client-providers';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Stok SDI',
  description: 'Manajemen stok barang SDI',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <ClientProviders>
          <AppShell>{children}</AppShell>
        </ClientProviders>
      </body>
    </html>
  );
}
