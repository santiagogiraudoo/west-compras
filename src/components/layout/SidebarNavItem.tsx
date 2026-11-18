'use client';

import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  isActive: boolean;
  isCollapsed: boolean;
}

/** Copia de SidebarNavItem de la app de alquileres; allá navega por TabType, acá por URL. */
export function SidebarNavItem({
  icon: Icon,
  label,
  href,
  isActive,
  isCollapsed,
}: SidebarNavItemProps) {
  const button = (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive &&
          'bg-sidebar-accent text-sidebar-accent-foreground',
        isCollapsed && 'justify-center px-2'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
