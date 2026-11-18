'use client';

import { ChevronUp, LogOut } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  operador: 'Operador',
  consulta: 'Consulta',
};

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || first.toUpperCase();
  }
  if (email && email.length > 0) {
    return email[0].toUpperCase();
  }
  return '?';
}

export function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  const { data: session, status } = useSession();

  if (status !== 'authenticated' || !session?.user) return null;

  const { name, email, role } = session.user;
  const initials = getInitials(name, email);
  const roleLabel = ROLE_LABEL[role] ?? role;
  const displayName = name?.trim() || email || 'Usuario';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            collapsed && 'justify-center px-1'
          )}
          aria-label={`Cuenta: ${displayName}`}
        >
          <Avatar size="sm" className="shrink-0">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-[11px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate" title={email ?? undefined}>
                {email ?? displayName}
              </span>
              <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-60"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="truncate text-sm font-medium leading-none">
              {displayName}
            </span>
            {name && email && (
              <span
                className="truncate text-xs text-muted-foreground"
                title={email}
              >
                {email}
              </span>
            )}
            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {roleLabel}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut({ callbackUrl: '/login' });
          }}
        >
          <LogOut className="h-4 w-4" />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
