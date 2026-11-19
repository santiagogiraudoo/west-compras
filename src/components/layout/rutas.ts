import {
  Bot, BookOpen, Building2, ChartColumn, FilePlus, FileText, Home, Inbox, PieChart, Receipt, Settings, Users, type LucideIcon,
} from 'lucide-react';

export interface Seccion {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Las secciones del menú, en orden. Al unir con la app de alquileres, cada una pasa
 * a ser un ítem de NAV_ITEMS y un TabType de allá.
 */
export const SECCIONES: Seccion[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: ChartColumn },
  { href: '/bandeja', label: 'Bandeja de facturas', icon: Inbox },
  { href: '/cuenta', label: 'Cuentas corrientes', icon: BookOpen },
  { href: '/op', label: 'Órdenes de pago', icon: FileText },
  { href: '/gastos', label: 'Gastos', icon: PieChart },
  { href: '/unidades', label: 'Unidades', icon: Building2 },
  { href: '/proveedores', label: 'Proveedores', icon: Users },
  { href: '/plomero', label: 'Plomero', icon: Bot },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

export interface Ruta extends Seccion {
  /** Las fichas tienen padre: es lo que muestran las migas de pan. */
  padre?: Seccion;
}

function seccionDe(pathname: string): Seccion | undefined {
  if (pathname === '/') return SECCIONES[0];
  return SECCIONES.find((s) => s.href !== '/' && (pathname === s.href || pathname.startsWith(`${s.href}/`)));
}

/** Rótulo, icono y padre de una URL (con o sin ?query). */
export function rutaDe(href: string): Ruta {
  const pathname = href.split('?')[0] || '/';
  const seccion = seccionDe(pathname);
  if (!seccion) return { href, label: 'Inicio', icon: Home };
  if (pathname === seccion.href) return seccion;

  const resto = pathname.slice(seccion.href.length + 1);
  const ficha = (label: string, icon: LucideIcon = seccion.icon): Ruta => ({ href, label, icon, padre: seccion });
  switch (seccion.href) {
    case '/bandeja':
      return resto === 'nueva' ? ficha('Añadir factura', Receipt) : ficha('Factura', Receipt);
    case '/cuenta':
      return ficha(decodeURIComponent(resto));
    case '/op':
      return resto === 'nueva' ? ficha('Nueva OP', FilePlus) : resto === 'extraordinaria' ? ficha('Operación extraordinaria', FilePlus) : ficha(decodeURIComponent(resto));
    case '/proveedores':
      return ficha(resto === 'nuevo' ? 'Nuevo proveedor' : decodeURIComponent(resto));
    default:
      return ficha(decodeURIComponent(resto));
  }
}
