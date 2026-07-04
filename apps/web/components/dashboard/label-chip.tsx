import type { LabelChip as LabelChipType, LabelColor } from "@yapper/schemas";

/**
 * Palette key → Tailwind classes. Literal strings (no interpolation) so Tailwind's scanner keeps
 * them. `dot` colors the swatch/dot; `chip` styles the pill (subtle tint + readable text in both
 * light and dark). Colocated with the chip so the palette lives in one place (ADR-003).
 */
export const LABEL_COLORS: Record<LabelColor, { dot: string; chip: string }> = {
  slate: { dot: "bg-slate-500", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  emerald: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  sky: { dot: "bg-sky-500", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
};

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];

/** A small colored dot for a label (used in the sidebar list + swatch picker). */
export function LabelDot({ color, className = "" }: { color: LabelColor; className?: string }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${LABEL_COLORS[color].dot} ${className}`}
    />
  );
}

/** Note-card label chips: up to 3 (dot + name), then a `+N` overflow chip. */
export function LabelChips({ labels }: { labels: LabelChipType[] }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, 3);
  const extra = labels.length - shown.length;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {shown.map((l) => (
        <span
          key={l.id}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${LABEL_COLORS[l.color].chip}`}
        >
          <LabelDot color={l.color} className="size-1.5" />
          {l.name}
        </span>
      ))}
      {extra > 0 ? (
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
