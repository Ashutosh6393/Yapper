"use client";

import type { Label } from "@yapper/schemas";
import { Archive, PenLine, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardView } from "@/lib/dashboard-view";
import { LabelNav } from "./label-nav";

const NAV: { label: string; icon: typeof PenLine; view: DashboardView }[] = [
  { label: "My Notes", icon: PenLine, view: "my" },
  { label: "Shared with Me", icon: Users, view: "shared" },
  { label: "Archive", icon: Archive, view: "archive" },
  { label: "Trash", icon: Trash2, view: "trash" },
];

/**
 * Left sidebar: brand, working nav (the active tab comes from the URL-driven `activeView`; a label
 * view highlights none of the four), and the New Note action. Fixed from `md` up; an off-canvas
 * drawer below `md`.
 */
export function Sidebar({
  activeView = "my",
  labelActive = false,
  onSelectView,
  onNewNote,
  open = false,
  onClose,
  labels = [],
  activeLabelId = null,
  onSelectLabel,
  onDeleteLabel,
}: {
  activeView?: DashboardView;
  labelActive?: boolean;
  onSelectView?: (view: DashboardView) => void;
  onNewNote: () => void;
  open?: boolean;
  onClose?: () => void;
  labels?: Label[];
  activeLabelId?: string | null;
  onSelectLabel?: (id: string) => void;
  onDeleteLabel?: (id: string) => void;
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

        <div className="flex flex-1 flex-col overflow-y-auto">
          <nav className="flex flex-col gap-0.5 pr-3">
            {NAV.map(({ label, icon: Icon, view }) => {
              const active = !labelActive && activeView === view;
              return (
                <button
                  key={label}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelectView?.(view)}
                  className={`flex items-center gap-3 rounded-r-full py-2 pr-4 pl-5 text-left text-[13px] font-medium ${
                    active
                      ? "bg-white/[0.06] text-primary"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" />
                  {label}
                </button>
              );
            })}
          </nav>
          <LabelNav
            labels={labels}
            activeLabelId={activeLabelId}
            onSelectLabel={onSelectLabel}
            onDeleteLabel={onDeleteLabel}
          />
        </div>

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
