"use client";

import { CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnline } from "../../lib/use-online";

/**
 * Shown in the dashboard header while offline (spec 24c). Purely informational: the mutation queue and
 * note content are already durable locally (Dexie + y-indexeddb), and the sync engine reconciles on
 * reconnect on its own. The badge exists because an *unlabelled* offline state reads as data loss.
 */
export function OfflineBadge() {
  const online = useOnline();
  if (online) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          role="status"
          variant="secondary"
          className="gap-1.5 font-normal text-muted-foreground"
        >
          <CloudOff className="size-3.5" />
          Offline
          {/* The tooltip only mounts on hover — unreachable by touch and by a screen reader — so the
              reassurance itself lives in the badge, visually hidden. */}
          <span className="sr-only">
            — changes are saved on this device and will sync when you reconnect.
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Changes are saved on this device and will sync when you reconnect.
      </TooltipContent>
    </Tooltip>
  );
}
