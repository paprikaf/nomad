import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { stayOwnerLocks, stays } from "../server/db/schema.js";
import { requireOwner } from "../server/lib/owner.js";

export default defineAction({
  description:
    "Delete a stay from the presence ledger by id (e.g. dismiss a wrongly detected inbox booking). This permanently removes the row and recomputes all rule counters.",
  schema: z.object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/, "Expected a valid stay id")
      .describe("Stay id to delete"),
  }),
  needsApproval: true,
  allowPersistentApproval: false,
  run: async (args) => {
    const owner = requireOwner();
    const db = getDb();
    const owned = and(eq(stays.id, args.id), eq(stays.ownerEmail, owner));
    const now = new Date().toISOString();
    return db.transaction(async (tx) => {
      await tx
        .insert(stayOwnerLocks)
        .values({ ownerEmail: owner, updatedAt: now })
        .onConflictDoNothing();
      await tx
        .update(stayOwnerLocks)
        .set({ updatedAt: now })
        .where(eq(stayOwnerLocks.ownerEmail, owner));

      const existing = await tx.select().from(stays).where(owned);
      if (existing.length === 0) {
        throw new Error(`No stay found with id ${args.id}`);
      }
      await tx.delete(stays).where(owned);
      return { deleted: true, stay: existing[0] };
    });
  },
});
