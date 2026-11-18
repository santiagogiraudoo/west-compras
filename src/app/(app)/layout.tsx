import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { QueryProvider } from "@/app/providers";
import { AppShell } from "@/components/layout/AppShell";

// El mismo shell que la app de alquileres (menú, pestañas, migas). Al unirlas, estas
// pantallas pasan a ser ítems de su Sidebar y TabTypes de su sistema de pestañas.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <SessionProvider session={session}>
      <QueryProvider>
        <AppShell>{children}</AppShell>
        <Toaster position="bottom-right" richColors />
      </QueryProvider>
    </SessionProvider>
  );
}
