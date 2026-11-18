'use client';

import { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { TabBar, TabRouteSync } from './TabBar';
import { Breadcrumbs } from './Breadcrumbs';

/** Copia del AppShell de la app de alquileres: menú verde, pestañas, migas y contenido. */
export function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:px-4 focus:py-2 focus:rounded focus:ring-2 focus:ring-primary"
      >
        Ir al contenido principal
      </a>

      {/* Dark branded sidebar */}
      <Sidebar />

      {/* Main content area: light background */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense fallback={null}>
          <TabRouteSync />
        </Suspense>
        <TabBar />
        <Suspense fallback={null}>
          <Breadcrumbs />
        </Suspense>
        <main id="main-content" className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
