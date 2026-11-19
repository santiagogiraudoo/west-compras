'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTabStore, useHydrated } from '@/stores/tab.store';
import { rutaDe } from './rutas';
import { cn } from '@/lib/utils';

/**
 * La pestaña activa sigue a la URL: tocar un link o el menú navega dentro de la
 * pestaña, como en alquileres. Va aparte porque useSearchParams pide Suspense.
 */
export function TabRouteSync() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const followRoute = useTabStore((s) => s.followRoute);
  useEffect(() => {
    followRoute(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query, followRoute]);
  return null;
}

/** Copia de la TabBar de la app de alquileres; cada pestaña abre su URL. */
export function TabBar() {
  const router = useRouter();
  const hydrated = useHydrated();
  const storedTabs = useTabStore((s) => s.tabs);
  const tabs = hydrated ? storedTabs : [];
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const createTab = useTabStore((s) => s.createTab);
  const reorderTab = useTabStore((s) => s.reorderTab);

  const go = (href: string | null) => {
    if (href) router.push(href);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 0);
    setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkOverflow);
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      observer.disconnect();
    };
  }, [checkOverflow, tabs.length]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -200 : 200;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      reorderTab(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="relative flex items-center border-b border-border bg-background pl-2">
      {/* Left scroll arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 z-10 flex h-full items-center bg-background/90 backdrop-blur-sm px-1"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Tab list */}
      <div
        ref={scrollRef}
        className="flex flex-1 overflow-x-auto scrollbar-none"
        style={{ scrollBehavior: 'smooth' }}
      >
        {tabs.map((tab, index) => {
          const ruta = rutaDe(tab.href);
          const Icon = ruta.icon;
          const label = tab.label ?? ruta.label;

          return (
            <button
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => setDragOverIndex(null)}
              onClick={() => go(setActiveTab(tab.id))}
              title={label}
              className={cn(
                'group flex w-[180px] shrink-0 items-center gap-2 border-r border-border/30 px-4 py-2 text-sm transition-colors cursor-grab active:cursor-grabbing -mb-px',
                tab.id === activeTabId
                  ? 'bg-background text-foreground font-medium border-b-2 border-b-primary'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                dragIndex === index && 'opacity-50',
                dragOverIndex === index && dragIndex !== index && 'border-l-2 border-l-[#1B4332]'
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1 truncate text-left">{label}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  go(closeTab(tab.id));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    go(closeTab(tab.id));
                  }
                }}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-sm transition-colors',
                  'opacity-40 group-hover:opacity-100',
                  tab.id === activeTabId && 'opacity-60',
                  'hover:bg-destructive/20 hover:text-destructive'
                )}
                aria-label={`Cerrar ${label}`}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}

        {/* New tab button — inline after last tab */}
        <button
          onClick={() => go(createTab())}
          className="flex shrink-0 items-center px-2 py-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/30"
          aria-label="Nueva pestaña"
          title="Nueva pestaña"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Right scroll arrow */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-10 z-10 flex h-full items-center bg-background/90 backdrop-blur-sm px-1"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
