"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** App-wide toaster, theme-linked to next-themes. Import `toast` from here (single seam) so the
 * dashboard never imports `sonner` directly. */
function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      position="bottom-right"
      richColors
      closeButton
      {...props}
    />
  );
}

export { toast } from "sonner";
export { Toaster };
