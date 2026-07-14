import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Branded 404 (spec 25c). Only a typo'd URL reaches this: `/notes/:id` always redirects, a bad share
 * token is handled inside `/share/[token]`, and a *missing note* is a dialog state (25d), not a route.
 * It exists because a stock Next 404 is the framework leaking through the one artifact whose purpose is
 * to be looked at.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <p className="font-mono text-muted-foreground text-sm">404</p>
        <h1 className="font-semibold text-2xl tracking-tight">Page not found</h1>
        <p className="max-w-md text-muted-foreground text-sm">
          That link doesn&apos;t go anywhere in Yapper.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to your notes</Link>
      </Button>
    </main>
  );
}
