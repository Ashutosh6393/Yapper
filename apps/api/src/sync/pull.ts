import { db, syncClient } from "@yapper/db";
import { type PullResponse, pullRequestSchema } from "@yapper/schemas";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  authorizedNotes,
  diffView,
  nextCookie,
  pruneOldCookies,
  readCvr,
  snapshotOf,
  writeCvr,
} from "./cvr";
import { getSyncClient } from "./push";

/**
 * `POST /api/sync/pull` (spec 16, ADR-0004). Returns the metadata delta since the caller's last cookie
 * using a Client View Record: it diffs the caller's current authorized view against the snapshot stored
 * at the incoming cookie, so `puts` (new/changed) and `dels` (notes that left the view — make-private,
 * revoke, hard-delete) both fall out with no tombstone table. Everything runs in one transaction that
 * reads the view + prior CVR, issues a fresh monotonic cookie, and stores the new snapshot; the pull is
 * read-mostly and has no post-commit side effects. `reset: true` when the prior CVR was empty (first
 * pull / unknown / pruned cookie) so the client reconciles orphaned local rows by missing-as-delete.
 */
export function handlePull() {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = pullRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid pull", issues: parsed.error.issues });
      return;
    }
    const { clientGroupID, cookie } = parsed.data;

    // The same binding push has always enforced (spec 26b, ADR-004). Without it a client group left over
    // from a previous user on this browser reads perfectly while every write 403s — a half-working app,
    // which is harder to debug than a broken one, and is exactly how this hid.
    const bound = await getSyncClient(db, clientGroupID);
    if (bound && bound.userId !== userId) {
      res.status(403).json({ error: "Client group bound to another user" });
      return;
    }

    const response = await db.transaction(async (tx) => {
      const view = await authorizedNotes(tx, userId);
      const { prev, matched } = await readCvr(tx, clientGroupID, cookie);
      const { puts, dels } = diffView(view, prev);

      const issued = await nextCookie(tx, clientGroupID);
      await writeCvr(tx, clientGroupID, issued, snapshotOf(view));
      await pruneOldCookies(tx, clientGroupID, issued);

      const [client] = await tx
        .select({ lastMutationId: syncClient.lastMutationId })
        .from(syncClient)
        .where(eq(syncClient.clientGroupId, clientGroupID))
        .limit(1);

      const body: PullResponse = {
        puts,
        dels,
        lastMutationID: client?.lastMutationId ?? 0,
        cookie: String(issued),
        reset: !matched,
      };
      return body;
    });

    res.json(response);
  };
}
