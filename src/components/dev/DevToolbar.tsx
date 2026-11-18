"use client";

import { useState } from "react";
import { useHydrated } from "@/stores/tab.store";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Crown, Zap } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { FAKE_DATE_COOKIE } from "@/lib/dev/fake-date";

const COLLAPSED_KEY = "dev:godmode:collapsed";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  // Path=/ so middleware sees it on every route; 7-day expiry is plenty for local dev.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 7}`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

// Solo se lee en el navegador; en el server la barra no se dibuja (ver `hydrated`).
const enNavegador = typeof document !== "undefined";
const cookieInicial = () => (enNavegador ? readCookie(FAKE_DATE_COOKIE) ?? "" : "");

export function DevToolbar() {
  const { data: session } = useSession();
  const hydrated = useHydrated();
  const [pendingDate, setPendingDate] = useState<string>(cookieInicial);
  const [activeDate] = useState<string>(cookieInicial);
  const [collapsed, setCollapsed] = useState(() => enNavegador && localStorage.getItem(COLLAPSED_KEY) === "1");

  // En alquileres la ve el usuario "dios"; acá, un admin y solo en desarrollo (npm run dev).
  if (process.env.NODE_ENV !== "development" || session?.user?.role !== "admin" || !hydrated) return null;

  const applyAndReload = (value: string) => {
    if (value) writeCookie(FAKE_DATE_COOKIE, value);
    else deleteCookie(FAKE_DATE_COOKIE);
    // Full reload: re-runs the inline <script> in root layout so window.Date
    // picks up the new offset. router.refresh() alone would NOT reinstall the
    // client-side Date Proxy.
    window.location.reload();
  };

  const persistCollapsed = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  };

  const dirty = pendingDate !== activeDate;
  const timeWarped = !!activeDate;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => persistCollapsed(false)}
        title="Modo Dios — invocar el panel de divinidad"
        className="fixed right-0 top-4 z-[9999] flex items-center gap-1 rounded-l-lg border border-r-0 border-[#B8960C] bg-[#1B4332] px-2.5 py-2 text-[#B8960C] shadow-[0_4px_20px_-4px_rgba(184,150,12,0.5)] transition-all hover:bg-[#15372a] hover:px-3"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        <Crown
          className={`h-4 w-4 ${timeWarped ? "animate-pulse text-amber-300" : ""}`}
          fill="currentColor"
        />
      </button>
    );
  }

  return (
    <div
      className="fixed right-4 top-4 z-[9999] flex items-center gap-1.5 rounded-lg border border-[#B8960C] bg-gradient-to-r from-[#1B4332] to-[#15372a] py-1.5 pl-2.5 pr-1.5 text-xs text-[#FFFEFC] shadow-[0_4px_24px_-4px_rgba(184,150,12,0.45)]"
      title="Manipular el continuo espacio-tiempo es un privilegio, no un derecho"
    >
      <div className="flex items-center gap-1.5 border-r border-[#B8960C]/30 pr-2">
        <Crown
          className="h-4 w-4 text-[#B8960C] drop-shadow-[0_0_4px_rgba(184,150,12,0.6)]"
          fill="currentColor"
        />
        <span className="font-bold uppercase tracking-[0.12em] text-[#B8960C]">
          Modo Dios
        </span>
        <Zap
          className={`h-3 w-3 text-[#B8960C] ${timeWarped ? "animate-pulse" : "opacity-60"}`}
          fill="currentColor"
        />
      </div>

      <label className="flex items-center gap-1">
        <span className="text-[#FFFEFC]/70">Fecha:</span>
        <DateInput
          value={pendingDate}
          min="1900-01-01"
          max="2100-12-31"
          onChange={(e) => setPendingDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyAndReload(pendingDate);
          }}
          className="w-[112px] [&_input]:h-7 [&_input]:rounded [&_input]:border [&_input]:border-[#B8960C]/40 [&_input]:bg-[#0f2a1f] [&_input]:px-2 [&_input]:pr-7 [&_input]:text-[12px] [&_input]:text-[#FFFEFC] [&_input]:placeholder:text-[#FFFEFC]/35 [&_input]:hover:border-[#B8960C]/70 [&_input]:focus-visible:border-[#B8960C] [&_input]:focus-visible:ring-1 [&_input]:focus-visible:ring-[#B8960C]/40 [&_button]:text-[#B8960C]/70 [&_button]:hover:bg-[#B8960C]/10 [&_button]:hover:text-[#B8960C]"
        />
      </label>

      <button
        type="button"
        disabled={!dirty}
        onClick={() => applyAndReload(pendingDate)}
        title="Doblegar el tiempo a tu voluntad"
        className="h-7 rounded border border-[#B8960C] bg-[#B8960C] px-2.5 font-semibold text-[#1B4332] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
      >
        Aplicar
      </button>

      {activeDate && (
        <button
          type="button"
          onClick={() => applyAndReload("")}
          title="Renunciar al poder divino y volver al presente"
          className="h-7 rounded border border-[#B8960C]/60 px-2 text-[#B8960C] hover:bg-[#B8960C]/10"
        >
          Reset
        </button>
      )}

      <button
        type="button"
        onClick={() => persistCollapsed(true)}
        title="Replegar"
        className="rounded p-1 text-[#B8960C]/70 hover:bg-white/5 hover:text-[#B8960C]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
