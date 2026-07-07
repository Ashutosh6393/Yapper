import { db, syncClient } from "@yapper/db";
import { loadNoteAudience, publishPokes } from "@yapper/permissions";
import {
  type Mutation,
  mutationSchema,
  type PushVerdict,
  pushRequestSchema,
} from "@yapper/schemas";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import type { Executor } from "../notes/service";
import {
  applyServerMutation,
  MutationRejected,
  type PostCommit,
  type PostCommitDeps,
} from "./mutators";

/**
 * `POST /api/sync/push` (spec 19, ADR-0007). Applies the client's queued mutations in ascending `seq`,
 * **one transaction each** that advances `sync_client.last_mutation_id` in lock-step with the effect, so
 * the de-dup pointer and the write commit atomically. A `seq <= last_mutation_id` is an idempotent
 * replay (skipped, verdict `applied`). A permanent failure ({@link MutationRejected}) advances the
 * pointer **without** applying and returns a `rejected` verdict; any other error throws → the whole
 * request 5xx's and the pointer is not advanced past the failure (the client re-pushes — spec 21).
 * After all commits, post-commit side effects run and a content-free poke is published (spec 17).
 */

/**
 * The note a mutation touches (for the poke audience). Note-scoped mutations carry the id directly;
 * label-scoped ones (`createLabel`/`renameLabel`/`deleteLabel`) touch the owner's own carrier notes,
 * whose only audience is the owner — always the pusher, already in the audience — so they return `null`.
 */
function touchedNoteId(m: Mutation): string | null {
  switch (m.name) {
    case "applyLabel":
    case "removeLabel":
      return m.args.noteId;
    case "createLabel":
    case "renameLabel":
    case "deleteLabel":
      return null;
    default:
      return m.args.id;
  }
}

/** Read the group's de-dup pointer + bound user. `null` when the group has never pushed. */
async function getSyncClient(
  dbx: Executor,
  clientGroupID: string,
): Promise<{ lastMutationId: number; userId: string } | null> {
  const [row] = await dbx
    .select({ lastMutationId: syncClient.lastMutationId, userId: syncClient.userId })
    .from(syncClient)
    .where(eq(syncClient.clientGroupId, clientGroupID))
    .limit(1);
  return row ?? null;
}

/** Upsert the group's pointer to `seq`, binding it to `userId` on first insert (decisions ADR-004). */
async function advanceLastMutationID(
  dbx: Executor,
  clientGroupID: string,
  userId: string,
  seq: number,
): Promise<void> {
  await dbx
    .insert(syncClient)
    .values({ clientGroupId: clientGroupID, userId, lastMutationId: seq })
    .onConflictDoUpdate({ target: syncClient.clientGroupId, set: { lastMutationId: seq } });
}

/** Build the `POST /api/sync/push` handler bound to the given post-commit deps (mockable in tests). */
export function handlePush(deps: PostCommitDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = pushRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid push", issues: parsed.error.issues });
      return;
    }
    const { clientGroupID, mutations } = parsed.data;

    // A client-group is bound to its first pushing user; another user pushing it is forbidden.
    const bound = await getSyncClient(db, clientGroupID);
    if (bound && bound.userId !== userId) {
      res.status(403).json({ error: "Client group bound to another user" });
      return;
    }

    const ordered = [...mutations].sort((a, b) => a.seq - b.seq);
    const verdicts: PushVerdict[] = [];
    const postCommits: PostCommit[] = [];
    // Notes freshly mutated in this push — their audiences get poked to reconcile (spec 17).
    const touchedNoteIds = new Set<string>();

    for (const m of ordered) {
      await db.transaction(async (tx) => {
        const client = await getSyncClient(tx, clientGroupID);
        const lastId = client?.lastMutationId ?? 0;
        if (m.seq <= lastId) {
          // Idempotent replay: already recorded, re-execute nothing (and no fresh change to poke).
          verdicts.push({ seq: m.seq, status: "applied" });
          return;
        }
        try {
          const member = mutationSchema.safeParse({ name: m.name, args: m.args });
          if (!member.success) throw new MutationRejected("invalid");
          const postCommit = await applyServerMutation({ userId, tx }, member.data);
          await advanceLastMutationID(tx, clientGroupID, userId, m.seq);
          verdicts.push({ seq: m.seq, status: "applied" });
          const noteId = touchedNoteId(member.data);
          if (noteId) touchedNoteIds.add(noteId);
          if (postCommit) postCommits.push(postCommit);
        } catch (err) {
          if (err instanceof MutationRejected) {
            // Permanent reject: advance the pointer WITHOUT applying (drops the poison mutation).
            await advanceLastMutationID(tx, clientGroupID, userId, m.seq);
            verdicts.push({ seq: m.seq, status: "rejected", reason: err.reason });
            return;
          }
          throw err; // unexpected → abort txn → propagate → 5xx (transient)
        }
      });
    }

    // Side effects strictly after their transactions commit (never inside them).
    for (const postCommit of postCommits) await postCommit(deps);

    const client = await getSyncClient(db, clientGroupID);
    const lastMutationID = client?.lastMutationId ?? 0;

    // Fan a content-free poke to every affected user so all their sessions pull the delta (spec 17):
    // each touched note's audience (owner + active collaborators) unioned with the pusher (their own
    // other tabs). Deduped + null-Redis-tolerant by publishPokes.
    const audience = new Set<string>([userId]);
    for (const noteId of touchedNoteIds) {
      for (const u of await loadNoteAudience(noteId)) audience.add(u);
    }
    await publishPokes(deps.publisher, audience);

    res.json({ lastMutationID, verdicts });
  };
}
