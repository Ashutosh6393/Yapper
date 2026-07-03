"use client";

import { Archive, PenLine, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { label: "My Notes", icon: PenLine, active: true },
  { label: "Shared with Me", icon: Users, active: false },
  { label: "Archive", icon: Archive, active: false },
  { label: "Trash", icon: Trash2, active: false },
];

/** Fixed left sidebar: brand, nav (My Notes active; others static), and the New Note action. */
export function Sidebar({ onNewNote }: { onNewNote: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-background pt-4">
      <div className="flex items-center gap-2 px-5 pb-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PenLine className="size-4" />
        </div>
        <div>
          <div className="text-[17px] font-extrabold tracking-tight leading-none">Yapper</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            Notes
          </div>
        </div>
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
  );
}
