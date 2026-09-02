import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { stayOwnerLocks, stays } from "../server/db/schema.js";
import { requireOwner } from "../server/lib/owner.js";
import { dayNumber, isValidISODate } from "../shared/compliance.js";
import { assertConfirmedStayIntegrity } from "../shared/stay-integrity.js";

const isoDate = z
  .string()
  .length(10)
  .refine(isValidISODate, "Expected a valid YYYY-MM-DD calendar date");

export default defineAction({
  description:
    "Create or update a manual/imported stay in the presence ledger. Pass `id` to patch an existing stay (only provided fields change — e.g. set status='confirmed' to confirm a pending Mail candidate, or set exitDate to close an open stay). Omit `id` to log a new confirmed stay; countryCode and entryDate are then required. Dates are inclusive YYYY-MM-DD; use exitDate=null (or omit) for an ongoing stay. Mail candidates must use stage-mail-stays instead.",
  schema: z
    .object({
      id: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/, "Expected a valid stay id")
        .optional()
        .describe("Existing stay id to update"),
      countryCode: z
        .string()
        .regex(/^[A-Za-z]{2}$/, "Expected an ISO 3166-1 alpha-2 country code")
        .optional()
        .describe("ISO 3166-1 alpha-2 country code, e.g. PT"),
      city: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .describe("City name (optional)"),
      entryDate: isoDate
        .optional()
        .describe("First day on the ground, YYYY-MM-DD"),
      exitDate: isoDate
        .nullable()
        .optional()
        .describe("Last day on the ground, YYYY-MM-DD; null = still there"),
      source: z.enum(["manual", "import"]).optional(),
      status: z
        .literal("confirmed")
        .optional()
        .describe("Confirm an existing staged Mail candidate"),
      notes: z.string().max(4_000).nullable().optional(),
    })
    .superRefine((args, context) => {
      if (args.id && args.source !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["source"],
          message: "A stay's source is immutable after creation",
        });
      }
    }),
  // Agent-originated ledger writes require a human click. Direct UI action
  // mutations are unaffected by framework approval gates.
  needsApproval: true,
  allowPersistentApproval: false,
  run: async (args) => {
    const owner = requireOwner();
    const db = getDb();
    const now = new Date().toISOString();
    const owned = (id: string) =>
      and(eq(stays.id, id), eq(stays.ownerEmail, owner));

    return db.transaction(async (tx) => {
      await tx
        .insert(stayOwnerLocks)
        .values({ ownerEmail: owner, updatedAt: now })
        .onConflictDoNothing();
      await tx
        .update(stayOwnerLocks)
        .set({ updatedAt: now })
        .where(eq(stayOwnerLocks.ownerEmail, owner));

      const ownerRows = await tx
        .select()
        .from(stays)
        .where(eq(stays.ownerEmail, owner));

      if (args.id) {
        const existing = ownerRows.find((row) => row.id === args.id);
        if (!existing) {
          throw new Error(`No stay found with id ${args.id}`);
        }
        const merged = { ...existing, ...stripUndefined(args) };
        validateDates(merged.entryDate, merged.exitDate);
        assertConfirmedStayIntegrity(merged, ownerRows);
        await tx
          .update(stays)
          .set({
            countryCode: merged.countryCode.toUpperCase(),
            city: merged.city,
            entryDate: merged.entryDate,
            exitDate: merged.exitDate,
            source: merged.source,
            status: merged.status,
            notes: merged.notes,
            openGuard:
              merged.status === "confirmed" && merged.exitDate === null
                ? owner
                : null,
            updatedAt: now,
          })
          .where(owned(args.id));
        const [updated] = await tx.select().from(stays).where(owned(args.id));
        return updated;
      }

      if (!args.countryCode || !args.entryDate) {
        throw new Error(
          "countryCode and entryDate are required when creating a stay",
        );
      }
      validateDates(args.entryDate, args.exitDate ?? null);
      const row = {
        id: nanoid(),
        ownerEmail: owner,
        countryCode: args.countryCode.toUpperCase(),
        city: args.city ?? null,
        entryDate: args.entryDate,
        exitDate: args.exitDate ?? null,
        source: args.source ?? "manual",
        status: args.status ?? "confirmed",
        notes: args.notes ?? null,
        openGuard:
          (args.status ?? "confirmed") === "confirmed" &&
          (args.exitDate ?? null) === null
            ? owner
            : null,
        createdAt: now,
        updatedAt: now,
      };
      assertConfirmedStayIntegrity(row, ownerRows);
      await tx.insert(stays).values(row);
      return row;
    });
  },
});

function validateDates(entryDate: string, exitDate: string | null): void {
  if (exitDate && dayNumber(exitDate) < dayNumber(entryDate)) {
    throw new Error("exitDate must be on or after entryDate");
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
