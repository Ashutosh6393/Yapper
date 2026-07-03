# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web/app/dashboard` to the imported Yapper Dashboard design — sidebar + top-bar shell, minimal note cards in My Notes / Shared sections, live search, and a note dialog that opens notes (new + existing) by reusing the existing `Editor` and `ShareDialog`.

**Architecture:** Two layers. (1) Backend: add `access` to owned note summaries and `ownerName` to shared summaries (`@yapper/schemas` + `apps/api` Drizzle queries). (2) Web: a composed dashboard page (session gate + data + search + dialog state) over small presentational components, plus two new shadcn primitives (`dialog`, `dropdown-menu`). The note dialog reuses `Editor` (content via Hocuspocus) and `ShareDialog` (owner sharing).

**Tech Stack:** Bun + Turbo monorepo; Next.js (strict TS) + Tailwind v4 + shadcn/ui (radix-ui) + TanStack Query + lucide-react; Express + Drizzle (Postgres) for api; Zod (`@yapper/schemas`). Tests: `bun:test` for `packages/*` and `apps/api`; Vitest + React Testing Library for `apps/web`.

## Global Constraints

- No `as any` type casting. Derive types with `z.infer`; never duplicate a contract shape per app.
- Zod at every trust boundary; schemas live in `@yapper/schemas`.
- Never select/expose `credential.key` or the CRDT blob (`note_doc.state`) in any query.
- Do NOT modify `globals.css` token values — the design palette is already the theme.
- Icons: `lucide-react` only (already installed). No react-icons.
- Do NOT modify the `/notes/[id]` route or generated files.
- Small, surgical diffs. TDD: failing test first. Frequent commits.
- Run tests from each app/package dir (Bun loads `.env` from cwd): `cd apps/api && bun test`, `cd packages/schemas && bun test`, `cd apps/web && bun run test`.
- Branch: `feat/dashboard-redesign` (already created).
- After each task, update `specs/11-dashboard-redesign/implementation.md`.

---

## Task 1: Add `access` (owned) and `ownerName` (shared) to note schemas

**Files:**
- Modify: `packages/schemas/src/note.ts`
- Test: `packages/schemas/src/note.test.ts`

**Interfaces:**
- Produces: `noteSummarySchema` now includes `access: NoteAccess`; `sharedNoteSummarySchema` now includes `access: NoteAccess` (inherited) + `ownerName: string`. Types `NoteSummary`, `SharedNoteSummary` re-inferred.

- [ ] **Step 1: Write the failing tests**

In `packages/schemas/src/note.test.ts`, update the shared `summary` fixture to include `access`, and extend the suites:

```ts
const summary = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Untitled",
  preview: "",
  access: "private" as const,
  updatedAt: "2026-06-29T00:00:00.000Z",
};

describe("noteSummarySchema", () => {
  it("accepts a metadata-only list row with access", () => {
    expect(noteSummarySchema.parse(summary)).toEqual(summary);
  });

  it("rejects a row missing access", () => {
    const { access, ...noAccess } = summary;
    expect(noteSummarySchema.safeParse(noAccess).success).toBe(false);
  });

  it("rejects a row missing required fields", () => {
    expect(noteSummarySchema.safeParse({ id: "x", title: "t" }).success).toBe(false);
  });
});

describe("sharedNoteSummarySchema", () => {
  it("adds the owner name to a summary", () => {
    const shared = { ...summary, access: "view" as const, ownerName: "Jess Park" };
    expect(sharedNoteSummarySchema.parse(shared)).toEqual(shared);
  });

  it("rejects a shared row missing ownerName", () => {
    expect(sharedNoteSummarySchema.safeParse({ ...summary, access: "view" }).success).toBe(false);
  });

  it("rejects an unknown access level", () => {
    expect(
      sharedNoteSummarySchema.safeParse({ ...summary, access: "none", ownerName: "x" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/schemas && bun test src/note.test.ts`
Expected: FAIL — `noteSummarySchema` currently has no `access` (parse of `summary` returns object without it / strips unknowns), and `sharedNoteSummarySchema` has no `ownerName`.

- [ ] **Step 3: Add the fields to the schemas**

In `packages/schemas/src/note.ts`:

```ts
/** A note row in a list — metadata only, never the CRDT blob. (`GET /api/notes`) */
export const noteSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  access: noteAccessSchema,
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** A "Shared with me" row — a summary plus the note-level access role and owner display name.
 * (`GET /api/notes/shared`) */
export const sharedNoteSummarySchema = noteSummarySchema.extend({
  ownerName: z.string(),
});
export type SharedNoteSummary = z.infer<typeof sharedNoteSummarySchema>;
```

(`noteAccessSchema` is already imported at the top of the file. `sharedNoteSummarySchema` previously added `access`; that now lives on the base, so it only adds `ownerName`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/schemas && bun test src/note.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/note.ts packages/schemas/src/note.test.ts
git commit -m "feat(schemas): add access to note summaries and ownerName to shared summaries"
```

---

## Task 2: Return `access` (owned list) and `ownerName` (shared list) from the API

**Files:**
- Modify: `apps/api/src/notes/router.ts` (GET `/` and GET `/shared` handlers)
- Test: `apps/api/src/notes/router.test.ts` (owned-list keys assertion), `apps/api/src/sharing.test.ts` (shared-list keys + ownerName)

**Interfaces:**
- Consumes: `noteSummarySchema` / `sharedNoteSummarySchema` shapes from Task 1.
- Produces: `GET /api/notes` rows `{ id, title, preview, access, updatedAt }`; `GET /api/notes/shared` rows `{ id, title, preview, access, updatedAt, ownerName }`.

- [ ] **Step 1: Update the failing tests**

In `apps/api/src/notes/router.test.ts`, update the owned-list key assertion (currently line ~71):

```ts
  // List returns metadata only (+access) — never the CRDT blob.
  expect(Object.keys(found).sort()).toEqual(["access", "id", "preview", "title", "updatedAt"]);
  expect(found.access).toBe("private");
  expect(found.state).toBeUndefined();
```

In `apps/api/src/sharing.test.ts`, update the shared-list assertion (currently line ~200) to expect `ownerName` and check its value. The owner user is seeded with `name: "Owner"` (confirm the local variable name in that file's `beforeAll`; the assertion below uses the literal the seed uses):

```ts
  const found = mine.body.find((n: { id: string }) => n.id === noteId);
  expect(Object.keys(found).sort()).toEqual([
    "access",
    "id",
    "ownerName",
    "preview",
    "title",
    "updatedAt",
  ]);
  expect(found.ownerName).toBe("Owner");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun test src/notes/router.test.ts src/sharing.test.ts`
Expected: FAIL — owned rows lack `access`; shared rows lack `ownerName`.

- [ ] **Step 3: Add `access` to the owned-list query**

In `apps/api/src/notes/router.ts`, GET `/` handler, add `access` to the projection:

```ts
      const rows = await db
        .select({
          id: note.id,
          title: note.title,
          preview: note.preview,
          access: note.access,
          updatedAt: note.updatedAt,
        })
        .from(note)
        .where(eq(note.ownerId, userId))
        .orderBy(desc(note.updatedAt));
```

- [ ] **Step 4: Add the owner join + `ownerName` to the shared-list query**

Add `user` to the db import at the top of the file:

```ts
import { db, note, noteCollaborator, user } from "@yapper/db";
```

In the GET `/shared` handler, join the owner and select their name (never other user columns):

```ts
      const rows = await db
        .select({
          id: note.id,
          title: note.title,
          preview: note.preview,
          access: note.access,
          updatedAt: note.updatedAt,
          ownerName: user.name,
        })
        .from(noteCollaborator)
        .innerJoin(note, eq(noteCollaborator.noteId, note.id))
        .innerJoin(user, eq(note.ownerId, user.id))
        .where(
          and(
            eq(noteCollaborator.userId, userId),
            eq(noteCollaborator.status, "active"),
            ne(note.access, "private"),
          ),
        )
        .orderBy(desc(note.updatedAt));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && bun test src/notes/router.test.ts src/sharing.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/notes/router.ts apps/api/src/notes/router.test.ts apps/api/src/sharing.test.ts
git commit -m "feat(api): return access on owned list and ownerName on shared list"
```

---

## Task 3: Add shadcn `Dialog` and `DropdownMenu` primitives

**Files:**
- Create: `apps/web/components/ui/dialog.tsx`
- Create: `apps/web/components/ui/dropdown-menu.tsx`

**Interfaces:**
- Produces: `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription` from `@/components/ui/dialog`; `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator` from `@/components/ui/dropdown-menu`.

These are presentational primitives (no branch logic); the verification is a type-check + a smoke render in the consuming tasks. Follow the existing `popover.tsx` convention: import primitives from the unified `radix-ui` package, `data-slot` attributes, `cn()` for classes.

- [ ] **Step 1: Create `dialog.tsx`**

```tsx
"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
```

- [ ] **Step 2: Create `dropdown-menu.tsx` (minimal subset actually used)**

```tsx
"use client";

import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-sm font-medium", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: PASS (no type errors from the new files).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/dialog.tsx apps/web/components/ui/dropdown-menu.tsx
git commit -m "feat(web): add shadcn dialog and dropdown-menu primitives"
```

---

## Task 4: `Sidebar` component

**Files:**
- Create: `apps/web/components/dashboard/sidebar.tsx`
- Test: `apps/web/components/dashboard/sidebar.test.tsx`

**Interfaces:**
- Produces: `export function Sidebar({ onNewNote }: { onNewNote: () => void }): JSX.Element`. Renders the logo, nav items (My Notes active; Shared with Me, Archive, Trash static), and a "New Note" button wired to `onNewNote`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

describe("Sidebar", () => {
  it("renders nav items and calls onNewNote when New Note is clicked", async () => {
    const onNewNote = vi.fn();
    render(<Sidebar onNewNote={onNewNote} />);

    expect(screen.getByText("My Notes")).toBeInTheDocument();
    expect(screen.getByText("Shared with Me")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));
    expect(onNewNote).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test components/dashboard/sidebar.test.tsx`
Expected: FAIL — module `./sidebar` not found.

- [ ] **Step 3: Implement `sidebar.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test components/dashboard/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/sidebar.tsx apps/web/components/dashboard/sidebar.test.tsx
git commit -m "feat(web): dashboard sidebar component"
```

---

## Task 5: `TopBar` component (search + refresh + avatar dropdown)

**Files:**
- Create: `apps/web/components/dashboard/top-bar.tsx`
- Test: `apps/web/components/dashboard/top-bar.test.tsx`

**Interfaces:**
- Produces: `export function TopBar(props: { search: string; onSearch: (v: string) => void; onRefresh: () => void; email: string; onSignOut: () => void }): JSX.Element`. Search is controlled; refresh button calls `onRefresh`; the avatar opens a dropdown showing `email`, the `ThemeToggle`, and a Sign out item calling `onSignOut`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

import { TopBar } from "./top-bar";

const base = {
  search: "",
  onSearch: vi.fn(),
  onRefresh: vi.fn(),
  email: "a@b.c",
  onSignOut: vi.fn(),
};

describe("TopBar", () => {
  it("types into search and triggers refresh", async () => {
    const onSearch = vi.fn();
    const onRefresh = vi.fn();
    render(<TopBar {...base} onSearch={onSearch} onRefresh={onRefresh} />);

    await userEvent.type(screen.getByPlaceholderText(/Search notes/i), "q");
    expect(onSearch).toHaveBeenCalledWith("q");

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("opens the avatar menu showing the email and sign out", async () => {
    const onSignOut = vi.fn();
    render(<TopBar {...base} onSignOut={onSignOut} />);

    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(await screen.findByText("a@b.c")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test components/dashboard/top-bar.test.tsx`
Expected: FAIL — module `./top-bar` not found.

- [ ] **Step 3: Implement `top-bar.tsx`**

```tsx
"use client";

import { LogOut, RefreshCw, Search } from "lucide-react";
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

export function TopBar({
  search,
  onSearch,
  onRefresh,
  email,
  onSignOut,
}: {
  search: string;
  onSearch: (v: string) => void;
  onRefresh: () => void;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/90 px-6 backdrop-blur">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search notes…"
          className="pl-9"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" aria-label="Refresh" onClick={onRefresh}>
          <RefreshCw className="size-5" />
        </Button>
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
            <DropdownMenuLabel className="truncate text-muted-foreground">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1 text-sm">
              Theme
              <ThemeToggle />
            </div>
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test components/dashboard/top-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/top-bar.tsx apps/web/components/dashboard/top-bar.test.tsx
git commit -m "feat(web): dashboard top bar with search, refresh, account menu"
```

---

## Task 6: `NoteCard` component (minimal card + ⋮ delete menu)

**Files:**
- Create: `apps/web/components/dashboard/note-card.tsx`
- Test: `apps/web/components/dashboard/note-card.test.tsx`

**Interfaces:**
- Consumes: `NoteSummary` + optional `SharedNoteSummary` fields from `@yapper/schemas`.
- Produces:
  `export function NoteCard(props: { note: NoteSummary; ownerName?: string; onOpen: () => void; onDelete: () => void }): JSX.Element`.
  Badge: `access === "private"` → "Private", else "Public" (owned) / for shared pass `ownerName` to show the "{owner}'s note" line and a View/Edit badge (`access === "edit"` → "Edit", else "View only"). Card body click → `onOpen`; ⋮ menu → Delete → `onDelete`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteCard } from "./note-card";

const note = {
  id: "n1",
  title: "Q3 Launch",
  preview: "Ship onboarding",
  access: "private" as const,
  updatedAt: "2026-06-29T00:00:00.000Z",
};

describe("NoteCard", () => {
  it("shows Private for a private owned note and opens on click", async () => {
    const onOpen = vi.fn();
    render(<NoteCard note={note} onOpen={onOpen} onDelete={vi.fn()} />);
    expect(screen.getByText("Private")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Q3 Launch"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows Public for a shared (view/edit) owned note", () => {
    render(<NoteCard note={{ ...note, access: "view" }} onOpen={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("shows the owner line and View/Edit badge for a shared note", () => {
    render(
      <NoteCard
        note={{ ...note, access: "edit" }}
        ownerName="Jess Park"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Jess Park's note/i)).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("calls onDelete from the overflow menu", async () => {
    const onDelete = vi.fn();
    render(<NoteCard note={note} onOpen={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /note actions/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test components/dashboard/note-card.test.tsx`
Expected: FAIL — module `./note-card` not found.

- [ ] **Step 3: Implement `note-card.tsx`**

```tsx
"use client";

import type { NoteSummary } from "@yapper/schemas";
import { Eye, Lock, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One note in a grid. Owned: Private/Public badge. Shared: owner line + View/Edit badge. */
export function NoteCard({
  note,
  ownerName,
  onOpen,
  onDelete,
}: {
  note: NoteSummary;
  ownerName?: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isShared = ownerName !== undefined;
  return (
    <div className="group rounded-xl border border-border bg-card p-[18px] transition-colors hover:border-primary/30">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {isShared ? (
            <div className="mb-1 truncate text-[10px] font-semibold text-muted-foreground">
              {ownerName}'s note
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="block truncate text-left text-sm font-bold tracking-tight hover:underline"
          >
            {note.title}
          </button>
          <div className="mt-1">
            <AccessBadge access={note.access} isShared={isShared} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Note actions"
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {note.preview ? (
        <button
          type="button"
          onClick={onOpen}
          className="mb-3 block w-full text-left text-[13px] leading-relaxed text-muted-foreground line-clamp-3"
        >
          {note.preview}
        </button>
      ) : null}

      <div className="text-[11px] text-muted-foreground/70">
        {new Date(note.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function AccessBadge({ access, isShared }: { access: NoteSummary["access"]; isShared: boolean }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold";
  if (isShared) {
    return access === "edit" ? (
      <span className={`${base} border-primary/25 bg-primary/10 text-primary`}>Edit</span>
    ) : (
      <span className={`${base} border-border bg-white/[0.05] text-muted-foreground`}>
        <Eye className="size-2.5" />
        View only
      </span>
    );
  }
  return access === "private" ? (
    <span className={`${base} border-border bg-white/[0.05] text-muted-foreground`}>
      <Lock className="size-2.5" />
      Private
    </span>
  ) : (
    <span className={`${base} border-primary/25 bg-primary/10 text-primary`}>Public</span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test components/dashboard/note-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/note-card.tsx apps/web/components/dashboard/note-card.test.tsx
git commit -m "feat(web): minimal note card with access badge and delete menu"
```

---

## Task 7: `NoteSection` component (header + grid + loading/empty)

**Files:**
- Create: `apps/web/components/dashboard/note-section.tsx`
- Test: `apps/web/components/dashboard/note-section.test.tsx`

**Interfaces:**
- Consumes: `NoteCard` (Task 6).
- Produces:
  `export function NoteSection(props: { label: string; loading: boolean; notes: NoteSummary[]; ownerNames?: Record<string, string>; emptyText: string; onOpen: (id: string) => void; onDelete: (id: string) => void }): JSX.Element`.
  Renders the section header (label · rule · count), a masonry-ish responsive grid of `NoteCard`s, skeletons while `loading`, and `emptyText` when empty.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteSection } from "./note-section";

const notes = [
  { id: "a", title: "Alpha", preview: "", access: "private" as const, updatedAt: "2026-06-29T00:00:00.000Z" },
  { id: "b", title: "Beta", preview: "", access: "view" as const, updatedAt: "2026-06-29T00:00:00.000Z" },
];

describe("NoteSection", () => {
  it("renders the label, count and a card per note", () => {
    render(
      <NoteSection
        label="My Notes"
        loading={false}
        notes={notes}
        emptyText="No notes"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("My Notes")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders the empty text when there are no notes", () => {
    render(
      <NoteSection
        label="Shared with Me"
        loading={false}
        notes={[]}
        emptyText="Nothing shared"
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Nothing shared")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test components/dashboard/note-section.test.tsx`
Expected: FAIL — module `./note-section` not found.

- [ ] **Step 3: Implement `note-section.tsx`**

```tsx
"use client";

import type { NoteSummary } from "@yapper/schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteCard } from "./note-card";

export function NoteSection({
  label,
  loading,
  notes,
  ownerNames,
  emptyText,
  onOpen,
  onDelete,
}: {
  label: string;
  loading: boolean;
  notes: NoteSummary[];
  ownerNames?: Record<string, string>;
  emptyText: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mb-9">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground/70">{notes.length} notes</span>
      </div>

      {loading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              ownerName={ownerNames?.[note.id]}
              onOpen={() => onOpen(note.id)}
              onDelete={() => onDelete(note.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test components/dashboard/note-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/note-section.tsx apps/web/components/dashboard/note-section.test.tsx
git commit -m "feat(web): dashboard note section with grid, loading and empty states"
```

---

## Task 8: `NoteDialog` component (reuses `Editor` + `ShareDialog`)

**Files:**
- Create: `apps/web/components/dashboard/note-dialog.tsx`
- Test: `apps/web/components/dashboard/note-dialog.test.tsx`

**Interfaces:**
- Consumes: `useNote` from `lib/queries/notes`; `Editor` from `app/notes/[id]/Editor`; `ShareDialog` from `app/notes/[id]/ShareDialog`; `Dialog*` from `@/components/ui/dialog`.
- Produces:
  `export function NoteDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }): JSX.Element`.
  Open when `noteId !== null`. Fetches the note via `useNote(noteId ?? "")`; shows title, the owner-only `ShareDialog` (settings), and the reused `Editor` (content). Body keyed by `noteId` so the Hocuspocus provider is recreated/destroyed per note.

- [ ] **Step 1: Write the failing test**

`Editor` opens a WebSocket, so mock it and `ShareDialog`; mock `useNote` to return owner metadata.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/notes/[id]/Editor", () => ({
  Editor: ({ noteId }: { noteId: string }) => <div data-testid="editor">editor:{noteId}</div>,
}));
vi.mock("../../app/notes/[id]/ShareDialog", () => ({
  ShareDialog: () => <div data-testid="share">share</div>,
}));

const useNoteMock = vi.fn();
vi.mock("../../lib/queries/notes", () => ({ useNote: (id: string) => useNoteMock(id) }));

import { NoteDialog } from "./note-dialog";

describe("NoteDialog", () => {
  it("renders nothing interactive when noteId is null", () => {
    useNoteMock.mockReturnValue({ data: undefined });
    render(<NoteDialog noteId={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
  });

  it("renders the editor and owner settings for an owned note", async () => {
    useNoteMock.mockReturnValue({
      data: { id: "n1", title: "Q3 Launch", access: "private", isOwner: true },
    });
    render(<NoteDialog noteId="n1" onClose={vi.fn()} />);
    expect(await screen.findByTestId("editor")).toHaveTextContent("editor:n1");
    expect(screen.getByTestId("share")).toBeInTheDocument();
    expect(screen.getByText("Q3 Launch")).toBeInTheDocument();
  });

  it("hides owner settings for a non-owned note", async () => {
    useNoteMock.mockReturnValue({
      data: { id: "n2", title: "Roadmap", access: "view", isOwner: false },
    });
    render(<NoteDialog noteId="n2" onClose={vi.fn()} />);
    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    expect(screen.queryByTestId("share")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test components/dashboard/note-dialog.test.tsx`
Expected: FAIL — module `./note-dialog` not found.

- [ ] **Step 3: Implement `note-dialog.tsx`**

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Editor } from "../../app/notes/[id]/Editor";
import { ShareDialog } from "../../app/notes/[id]/ShareDialog";
import { useNote } from "../../lib/queries/notes";

/** Opens a note (new or existing) in a modal: title + owner settings (ShareDialog) + content (Editor).
 * `Editor` owns a Hocuspocus WebSocket — keying the body by noteId recreates/destroys it per note. */
export function NoteDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const note = useNote(noteId ?? "").data;

  return (
    <Dialog open={noteId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <DialogTitle>{note?.title ?? "Note"}</DialogTitle>
          {noteId && note?.isOwner ? (
            <ShareDialog noteId={noteId} initialAccess={note.access} />
          ) : null}
        </DialogHeader>
        {noteId ? (
          <Editor key={noteId} noteId={noteId} onMadePrivate={note?.isOwner ? undefined : onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test components/dashboard/note-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/note-dialog.tsx apps/web/components/dashboard/note-dialog.test.tsx
git commit -m "feat(web): note dialog reusing editor and share controls"
```

---

## Task 9: Assemble the dashboard page (shell + data + search + dialog) with goal-state test

**Files:**
- Modify (replace): `apps/web/app/dashboard/page.tsx`
- Test: `apps/web/app/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `Sidebar`, `TopBar`, `NoteSection`, `NoteDialog` (Tasks 4–8); `useNotes`, `useSharedNotes`, `useCreateNote`, `useDeleteNote` (`lib/queries/notes`); `useSession`, `signOut` (`lib/auth-client`); `useQueryClient` + `noteKeys` for refresh.
- Produces: the composed `/dashboard` page. New Note / Start-a-note → `useCreateNote` → open dialog on new id. Card → open dialog. Search filters both sections by title+preview. Refresh invalidates `noteKeys.all`.

- [ ] **Step 1: Write the failing goal-state test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/auth-client", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: { user: { email: "me@x.co" } }, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

// Editor/ShareDialog reach the network — stub them out of the page tree.
vi.mock("../notes/[id]/Editor", () => ({ Editor: () => <div>editor</div> }));
vi.mock("../notes/[id]/ShareDialog", () => ({ ShareDialog: () => <div>share</div> }));

const createMock = vi.fn(async () => ({ id: "new-1", title: "Untitled", access: "private", updatedAt: "" }));
const deleteMock = vi.fn();
const invalidateMock = vi.fn();
vi.mock("../../lib/queries/notes", () => ({
  noteKeys: { all: ["notes"] },
  useNotes: () => ({
    isPending: false,
    data: [
      { id: "a", title: "Alpha", preview: "first", access: "private", updatedAt: "2026-06-29T00:00:00.000Z" },
      { id: "b", title: "Beta", preview: "second", access: "view", updatedAt: "2026-06-29T00:00:00.000Z" },
    ],
  }),
  useSharedNotes: () => ({
    isPending: false,
    data: [
      { id: "s", title: "Gamma", preview: "shared", access: "edit", ownerName: "Jess", updatedAt: "2026-06-29T00:00:00.000Z" },
    ],
  }),
  useCreateNote: () => ({ mutateAsync: createMock, isPending: false }),
  useDeleteNote: () => ({ mutate: deleteMock }),
  useNote: () => ({ data: { id: "new-1", title: "Untitled", access: "private", isOwner: true } }),
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidateMock }),
}));

import DashboardPage from "./page";

describe("DashboardPage (spec 11 goal state)", () => {
  beforeEach(() => {
    createMock.mockClear();
    deleteMock.mockClear();
    invalidateMock.mockClear();
  });

  it("renders My Notes and Shared with Me from query data", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText(/Jess's note/i)).toBeInTheDocument();
  });

  it("filters both sections by the search query", async () => {
    render(<DashboardPage />);
    await userEvent.type(screen.getByPlaceholderText(/Search notes/i), "alpha");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
  });

  it("refresh invalidates the notes queries", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ["notes"] });
  });

  it("New Note creates a note and opens the dialog", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /New Note/i }));
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test app/dashboard/page.test.tsx`
Expected: FAIL — page still renders the old markup (no sidebar/search/sections wired as above).

- [ ] **Step 3: Replace `app/dashboard/page.tsx`**

```tsx
"use client";

import type { NoteSummary, SharedNoteSummary } from "@yapper/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NoteDialog } from "@/components/dashboard/note-dialog";
import { NoteSection } from "@/components/dashboard/note-section";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { Input } from "@/components/ui/input";
import { signOut, useSession } from "../../lib/auth-client";
import {
  noteKeys,
  useCreateNote,
  useDeleteNote,
  useNotes,
  useSharedNotes,
} from "../../lib/queries/notes";

function matches(note: NoteSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return note.title.toLowerCase().includes(needle) || note.preview.toLowerCase().includes(needle);
}

/** Redesigned dashboard: sidebar + top bar shell, My Notes / Shared sections, live search, and a
 * note dialog (new + existing). Session-gated client-side; logged-out visitors go to /login. */
export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const notesQuery = useNotes();
  const sharedQuery = useSharedNotes();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  const [search, setSearch] = useState("");
  const [dialogNoteId, setDialogNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const owned = useMemo(
    () => (notesQuery.data ?? []).filter((n) => matches(n, search)),
    [notesQuery.data, search],
  );
  const shared = useMemo(
    () => (sharedQuery.data ?? []).filter((n) => matches(n, search)),
    [sharedQuery.data, search],
  );
  const ownerNames = useMemo(
    () => Object.fromEntries((sharedQuery.data ?? []).map((n: SharedNoteSummary) => [n.id, n.ownerName])),
    [sharedQuery.data],
  );

  if (isPending) {
    return <main className="p-12 text-muted-foreground">Loading…</main>;
  }
  if (!session) return null;

  async function createAndOpen() {
    try {
      const note = await createNote.mutateAsync();
      setDialogNoteId(note.id);
    } catch {
      // mutation state re-enables the trigger; nothing else to surface here
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onNewNote={createAndOpen} />
      <div className="ml-60 flex flex-1 flex-col overflow-hidden">
        <TopBar
          search={search}
          onSearch={setSearch}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: noteKeys.all })}
          email={session.user.email}
          onSignOut={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
        <main className="flex-1 overflow-y-auto px-7 pt-7 pb-24">
          <div className="mx-auto mb-9 max-w-xl">
            <Input
              readOnly
              onClick={createAndOpen}
              placeholder="Start a new note…"
              className="cursor-pointer"
            />
          </div>

          <NoteSection
            label="My Notes"
            loading={notesQuery.isPending}
            notes={owned}
            emptyText="No notes yet. Create your first one."
            onOpen={setDialogNoteId}
            onDelete={(id) => deleteNote.mutate(id)}
          />
          <NoteSection
            label="Shared with Me"
            loading={sharedQuery.isPending}
            notes={shared}
            ownerNames={ownerNames}
            emptyText="No notes shared with you yet."
            onOpen={setDialogNoteId}
            onDelete={(id) => deleteNote.mutate(id)}
          />
        </main>
      </div>

      <NoteDialog noteId={dialogNoteId} onClose={() => setDialogNoteId(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun run test app/dashboard/page.test.tsx`
Expected: PASS (all four cases).

- [ ] **Step 5: Full checks — type-check, lint, whole web suite**

Run: `cd apps/web && bunx tsc --noEmit && bun run test`
Run (repo root): `bunx biome check apps/web/app/dashboard apps/web/components/dashboard apps/web/components/ui/dialog.tsx apps/web/components/ui/dropdown-menu.tsx`
Expected: no type errors; all web tests pass; Biome clean on the new/changed files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/page.tsx apps/web/app/dashboard/page.test.tsx
git commit -m "feat(web): assemble redesigned dashboard with search and note dialog"
```

---

## Task 10: Update spec status + manual verification

**Files:**
- Modify: `specs/11-dashboard-redesign/implementation.md`

- [ ] **Step 1: Mark tasks complete**

Set `## Status: complete`, move Tasks 1–9 into `## Completed`, and add a session note dated 2026-07-03 summarising what shipped.

- [ ] **Step 2: Manual smoke (from repo root, both apps running)**

Run: `bun run dev` (or the project's usual `turbo dev`), then in the browser:
- Sign in → `/dashboard` shows sidebar + top bar + My Notes / Shared sections.
- Click "New Note" (sidebar) and "Start a new note…" → dialog opens with the editor; for an owned note the Share control is present.
- Open an existing card → dialog shows that note's content.
- Search filters both sections; Refresh refetches; avatar menu shows email + theme toggle + sign out.
- ⋮ → Delete removes the card.

Expected: all behave as above; no console errors.

- [ ] **Step 3: Commit**

```bash
git add specs/11-dashboard-redesign/implementation.md
git commit -m "docs(specs): mark slice 11 dashboard redesign complete"
```

---

## Self-Review (completed while writing)

- **Spec coverage:** Goal-state items 1–8 map to tasks — shell/sidebar/top bar (T4/T5/T9), sections + cards + states (T6/T7/T9), badges from real `access` (T1/T2/T6), owner label from `ownerName` (T1/T2/T6), search (T9), refresh + avatar dropdown (T5/T9), New Note + card-click → dialog (T8/T9), dialog settings + content via reuse (T8). Backend fields (T1/T2). shadcn primitives (T3).
- **Placeholder scan:** none — every code/test step has full content.
- **Type consistency:** `NoteSummary` now carries `access` (T1) and is consumed unchanged in T6/T7/T9; `SharedNoteSummary` adds `ownerName`, surfaced via `ownerNames` map (T9) → `NoteCard.ownerName` (T6). `NoteDialog` props `{ noteId, onClose }` match the page usage (T9). `noteKeys.all` used for refresh matches `lib/queries/notes.ts`.
- **Breaking existing tests handled:** `router.test.ts` owned-keys assertion and `sharing.test.ts` shared-keys assertion are updated in T2 alongside the query change.
- **Deferred (future-work.md):** presence/avatars/live badges, Archive/Trash logic, floating dock, revoked shared card, server-side search — intentionally not tasked.
