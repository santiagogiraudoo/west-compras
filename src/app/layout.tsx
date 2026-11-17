import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "West · Compras y pagos",
  description: "Facturas, remitos, cuenta corriente y pagos a proveedores - West",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
