'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useHydrated } from '@/stores/tab.store';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarUserMenu } from './SidebarUserMenu';
import { SECCIONES, rutaDe } from './rutas';
import { cn } from '@/lib/utils';

/**
 * Copia del Sidebar de la app de alquileres (verde, logo, colapsable, cuenta abajo).
 * Los ítems salen de SECCIONES; una ficha marca a su sección como activa.
 */
export function Sidebar() {
  const hydrated = useHydrated();
  const storedCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const collapsed = hydrated && storedCollapsed;
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const pathname = usePathname();
  const ruta = rutaDe(pathname);
  const activeHref = ruta.padre?.href ?? ruta.href;

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
          collapsed ? 'w-[60px]' : 'w-[250px]'
        )}
      >
        {/* Brand logo */}
        <div
          className={cn(
            'flex items-center',
            collapsed
              ? 'justify-center px-2 py-2.5'
              : 'mx-2 my-3 justify-center rounded-md bg-sidebar-accent px-3 py-2.5'
          )}
        >
          {collapsed ? (
            <Image
              src="/docs/images/logo/W.png"
              alt="West Desarrolladora"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <Image
              src="/docs/images/logo/Name.png"
              alt="West Desarrolladora"
              width={180}
              height={36}
              className="h-9 w-auto object-contain"
            />
          )}
        </div>

        {/* Navigation items */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {SECCIONES.map((item) => (
            <SidebarNavItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              isActive={activeHref === item.href}
              isCollapsed={collapsed}
            />
          ))}
        </nav>

        {/* User account menu — solo en el navegador: el id que le pone Radix no
            coincidía con el del server y React avisaba de la hidratación. */}
        <div className="min-h-[49px] border-t border-sidebar-border p-2">
          {hydrated && <SidebarUserMenu collapsed={collapsed} />}
        </div>

        {/* Toggle button at bottom */}
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed && 'justify-center px-2'
            )}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5" />
                <span>Colapsar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
