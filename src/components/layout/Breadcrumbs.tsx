'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useTabStore, useHydrated } from '@/stores/tab.store';
import { rutaDe } from './rutas';
import { cn } from '@/lib/utils';

/** Copia de Breadcrumbs de la app de alquileres: solo en las fichas, "Sección › ficha". */
export function Breadcrumbs() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const label = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.label);
  const ruta = rutaDe(pathname);
  const parent = ruta.padre;

  // No breadcrumb for top-level pages
  if (!parent) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 border-b border-border bg-background px-8 py-1.5 text-sm"
    >
      <Link
        href={parent.href}
        className={cn(
          'text-muted-foreground hover:text-primary hover:underline underline-offset-2',
          'transition-colors truncate max-w-[200px]'
        )}
      >
        {parent.label}
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <span className="font-medium text-foreground truncate max-w-[300px]">
        {(hydrated && label) || ruta.label}
      </span>
    </nav>
  );
}

/**
 * Una ficha le pone su nombre a la pestaña y a las migas de pan (en alquileres eso
 * lo hace el `label` de navigate). No dibuja nada.
 */
export function TituloDePestana({ label }: { label: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const setLabel = useTabStore((s) => s.setLabel);
  useEffect(() => {
    setLabel(query ? `${pathname}?${query}` : pathname, label);
  }, [pathname, query, label, setLabel]);
  return null;
}
