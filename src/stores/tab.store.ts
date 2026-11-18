import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Pestañas con el mismo aspecto y comportamiento que las de la app de alquileres
 * (src/stores/tab.store.ts allá), pero cada pestaña es una URL: las pantallas de
 * esta app son páginas de Next que cargan sus datos en el server, así que la
 * pestaña recuerda dónde estaba y el router la muestra.
 *
 * El rótulo y el icono salen de la URL (src/components/layout/rutas.ts); una ficha
 * puede poner su nombre con <TituloDePestana>. Al unir las apps, cada sección pasa
 * a ser un TabType de allá y este archivo se borra.
 */
export interface Tab {
  id: string;
  href: string;
  /** Lo pone la página (ej. el nombre del proveedor); si falta, sale de la ruta. */
  label?: string;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  /** La URL cambió (link, menú, atrás): la pestaña activa la sigue. */
  followRoute: (href: string) => void;
  /** La página abierta le pone nombre a su pestaña. */
  setLabel: (href: string, label: string) => void;
  /** Devuelve la URL a mostrar. */
  createTab: (href?: string) => string;
  /** Devuelve la URL a mostrar, o null si no existe. */
  setActiveTab: (id: string) => string | null;
  /** Devuelve la URL a mostrar si cambió la pestaña activa. */
  closeTab: (id: string) => string | null;
  reorderTab: (from: number, to: number) => void;
}

const INICIO = '/';
const newId = () => Math.random().toString(36).slice(2, 10);

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      followRoute: (href) => {
        const { tabs, activeTabId } = get();
        const active = tabs.find((t) => t.id === activeTabId);
        if (!active) {
          const tab = { id: newId(), href };
          set({ tabs: [...tabs, tab], activeTabId: tab.id });
          return;
        }
        if (active.href === href) return;
        set({ tabs: tabs.map((t) => (t.id === active.id ? { id: t.id, href } : t)) });
      },

      setLabel: (href, label) => {
        const { tabs, activeTabId } = get();
        set({ tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, href, label } : t)) });
      },

      createTab: (href = INICIO) => {
        const tab = { id: newId(), href };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
        return href;
      },

      setActiveTab: (id) => {
        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return null;
        set({ activeTabId: id });
        return tab.href;
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex((t) => t.id === id);
        if (index === -1) return null;
        const rest = tabs.filter((t) => t.id !== id);
        if (id !== activeTabId) {
          set({ tabs: rest });
          return null;
        }
        // Como en alquileres: se pasa a la de la derecha, o a la de la izquierda si era la última.
        const next = rest[Math.min(index, rest.length - 1)] ?? { id: newId(), href: INICIO };
        set({ tabs: rest.length ? rest : [next], activeTabId: next.id });
        return next.href;
      },

      reorderTab: (from, to) => {
        const tabs = [...get().tabs];
        const [moved] = tabs.splice(from, 1);
        if (!moved) return;
        tabs.splice(to, 0, moved);
        set({ tabs });
      },
    }),
    { name: 'west-compras-tabs' }
  )
);

const subscribeNoop = () => () => {};

/**
 * true recién en el navegador. Lo guardado en localStorage (pestañas, menú
 * colapsado) solo se usa después de hidratar, así el HTML del server coincide.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}
