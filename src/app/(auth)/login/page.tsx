import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Iniciar Sesión - West Desarrolladora",
};

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      {/* Unified branded card */}
      <div className="w-[360px] overflow-hidden rounded-md border border-border/60 shadow-[0_10px_28px_rgba(27,67,50,0.12)]">
        {/* Brand band */}
        <div className="flex items-center justify-center bg-primary px-6 py-5">
          <Image
            src="/docs/images/logo/Name.png"
            alt="West Desarrolladora"
            width={220}
            height={44}
            priority
            className="h-10 w-auto object-contain"
          />
        </div>

        {/* Gold structural divider */}
        <div className="h-[3px] bg-[#B8960C]" />

        {/* Form body */}
        <div className="bg-card px-6 pt-5 pb-6">
          <div className="mb-5 text-center">
            <h1 className="text-base font-semibold text-primary">
              Iniciar Sesión
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ingrese sus credenciales para continuar
            </p>
          </div>

          <LoginForm />
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        West Desarrolladora &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
