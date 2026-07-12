"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Quote,
  SquareCode,
  Strikethrough,
} from "lucide-react";
import { useEffect, useReducer } from "react";
import { cn } from "@/lib/utils";

/** Re-render on every editor transaction so the active-state highlights track the selection. */
function useEditorTick(editor: Editor) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on("transaction", tick);
    return () => {
      editor.off("transaction", tick);
    };
  }, [editor]);
}

interface Tool {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  run: () => void;
}

/**
 * Formatting toolbar for the note editor. Buttons map 1:1 to the shared schema's nodes/marks
 * (headings, marks, lists, todo, blocks) and drive the passed TipTap `editor`. Rendered only for
 * editors with edit permission; view-only surfaces show no toolbar.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  useEditorTick(editor);

  const groups: Tool[][] = [
    [
      {
        icon: Heading1,
        label: "Heading 1",
        isActive: editor.isActive("heading", { level: 1 }),
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        icon: Heading2,
        label: "Heading 2",
        isActive: editor.isActive("heading", { level: 2 }),
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        icon: Heading3,
        label: "Heading 3",
        isActive: editor.isActive("heading", { level: 3 }),
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        icon: Bold,
        label: "Bold",
        isActive: editor.isActive("bold"),
        run: () => editor.chain().focus().toggleBold().run(),
      },
      {
        icon: Italic,
        label: "Italic",
        isActive: editor.isActive("italic"),
        run: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        icon: Strikethrough,
        label: "Strikethrough",
        isActive: editor.isActive("strike"),
        run: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        icon: Code,
        label: "Inline code",
        isActive: editor.isActive("code"),
        run: () => editor.chain().focus().toggleCode().run(),
      },
    ],
    [
      {
        icon: List,
        label: "Bullet list",
        isActive: editor.isActive("bulletList"),
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        icon: ListOrdered,
        label: "Numbered list",
        isActive: editor.isActive("orderedList"),
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        icon: ListTodo,
        label: "To-do list",
        isActive: editor.isActive("taskList"),
        run: () => editor.chain().focus().toggleTaskList().run(),
      },
    ],
    [
      {
        icon: Quote,
        label: "Quote",
        isActive: editor.isActive("blockquote"),
        run: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        icon: SquareCode,
        label: "Code block",
        isActive: editor.isActive("codeBlock"),
        run: () => editor.chain().focus().toggleCodeBlock().run(),
      },
    ],
  ];

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      aria-orientation="horizontal"
      className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-0.5 rounded-lg border bg-card/80 p-1 backdrop-blur"
    >
      {groups.map((group, gi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static, never-reordered groups
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 ? <span aria-hidden className="mx-1 h-5 w-px bg-border" /> : null}
          {group.map(({ icon: Icon, label, isActive, run }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-pressed={isActive}
              title={label}
              // Keep the editor selection intact — don't let the button steal focus before the command runs.
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                isActive && "bg-accent text-primary",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
