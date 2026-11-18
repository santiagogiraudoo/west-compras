import Link from "next/link";
import { Inbox, Home, Users, BookOpen, FileText, Banknote, ClipboardCheck, Settings } from "lucide-react";
import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { QueryProvider } from "@/app/providers";

// Shell mínimo de la fase 1. Cuando se una a la app de alquileres, estas pantallas
// pasan a ser ítems del Sidebar y pestañas de su sistema de tabs.
const MENU = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/bandeja", label: "Bandeja de facturas", icon: Inbox },
  { href: "/cuenta", label: "Cuentas corrientes", icon: BookOpen },
  { href: "/op", label: "Órdenes de pago", icon: FileText },
  { href: "/aprobar", label: "Para aprobar", icon: ClipboardCheck },
  { href: "/pagos", label: "Para pagar", icon: Banknote },
  { href: "/proveedores", label: "Proveedores", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <SessionProvider session={session}>
      <QueryProvider>
        <div className="flex h-screen overflow-hidden">
          <aside className="flex w-[230px] flex-col bg-sidebar text-sidebar-foreground">
            <div className="mx-2 my-3 rounded-md bg-sidebar-accent px-3 py-2.5 text-sm font-semibold">
              West · Compras y pagos
            </div>
            <nav className="flex flex-col gap-0.5 px-2">
              {MENU.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent">
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-4 py-3 text-xs opacity-70">{session?.user?.name}</div>
          </aside>
          <main id="main-content" className="flex-1 overflow-auto bg-background p-6">{children}</main>
        </div>
        <Toaster position="bottom-right" richColors />
      </QueryProvider>
    </SessionProvider>
  );
}
