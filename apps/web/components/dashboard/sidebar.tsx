"use client";

import { Archive, PenLine, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { label: "My Notes", icon: PenLine, active: true },
  { label: "Shared with Me", icon: Users, active: false },
  { label: "Archive", icon: Archive, active: false },
  { label: "Trash", icon: Trash2, active: false },
];

/**
 * Left sidebar: brand, nav (My Notes active; others static), and the New Note action.
 * Fixed and always visible from `md` up. Below `md` it is an off-canvas drawer that slides in
 * from the left when `open`, over a tap-to-dismiss backdrop.
 */
export function Sidebar({
  onNewNote,
  open = false,
  onClose,
}: {
  onNewNote: () => void;
  open?: boolean;
  onClose?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-background pt-4 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center px-5 pb-5">
          <div className="text-2xl font-extrabold tracking-tight leading-none">Yapper</div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 pr-3">
          {NAV.map(({ label, icon: Icon, active }) => (
            <span
              key={label}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-r-full py-2 pr-4 pl-5 text-[13px] font-medium ${
                active
                  ? "bg-white/[0.06] text-primary"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className="size-[18px]" />
              {label}
            </span>
          ))}
        </nav>

        <div className="p-4">
          <Button type="button" className="w-full gap-2" onClick={onNewNote}>
            <Plus className="size-[18px]" />
            New Note
          </Button>
        </div>
      </aside>
    </>
  );
}
