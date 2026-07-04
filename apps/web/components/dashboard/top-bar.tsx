"use client";

import { LogOut, Menu, RefreshCw, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TopBar({
  search,
  onSearch,
  onRefresh,
  refreshing = false,
  email,
  onSignOut,
  onMenuClick,
}: {
  search: string;
  onSearch: (v: string) => void;
  onRefresh: () => void;
  /** True while a manual refresh is in flight — spins the icon and disables the button. */
  refreshing?: boolean;
  email: string;
  onSignOut: () => void;
  onMenuClick?: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/90 px-6 backdrop-blur">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        onClick={onMenuClick}
        className="md:hidden"
      >
        <Menu className="size-5" />
      </Button>
      <div className="relative w-full max-w-[240px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search notes…"
          className="pl-9"
        />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              className="cursor-pointer"
              variant="link"
              size="icon"
              aria-label="Refresh notes"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw
                className={`size-4 text-zinc-500 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh notes</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="ml-1 flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
            >
              {email.charAt(0).toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
