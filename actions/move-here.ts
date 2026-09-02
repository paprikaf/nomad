import { createHash } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { stayOwnerLocks, stays } from "../server/db/schema.js";
import { requireOwner } from "../server/lib/owner.js";
import { getProfile } from "../server/lib/profile.js";
import {
  canonicalTimeZone,
  dayNumber,
  isValidISODate,
  isValidTimeZone,
  todayISO,
} from "../shared/compliance.js";
import {
  assertConfirmedStayIntegrity,
  confirmedStayCoversDate,
} from "../shared/stay-integrity.js";

const isoDate = z
  .string()
  .length(10)
  .refine(isValidISODate, "Expected a valid YYYY-MM-DD calendar date");

export default defineAction({
  description:
    "Record that the user is now in a country as one atomic, retry-safe ledger move. The action closes the applicable confirmed open stay on the move date and opens or reuses the target stay. Travel days count in both countries on the shared transition date. Omit date to use today in the profile's IANA time zone.",
  schema: z.object({
    countryCode: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "Expected an ISO 3166-1 alpha-2 country code")
      .describe("ISO 3166-1 alpha-2 country code, e.g. PT"),
    date: isoDate
      .optional()
      .describe("Move date, YYYY-MM-DD; defaults to profile-local today"),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine(isValidTimeZone, "Expected a valid IANA time-zone identifier")
      .optional()
      .describe("Optional browser IANA time zone used when date is omitted"),
    city: z.string().max(120).nullable().optional(),
  }),
  needsApproval: true,
  allowPersistentApproval: false,
  run: async (args) => {
    const owner = requireOwner();
    const profile = await getProfile();
    const timeZone = args.timeZone
      ? (canonicalTimeZone(args.timeZone) ?? profile.timeZone)
      : profile.timeZone;
    const moveDate = args.date ?? todayISO(new Date(), timeZone);
    const countryCode = args.countryCode.toUpperCase();
    const now = new Date().toISOString();
    const db = getDb();

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
      const moveDay = dayNumber(moveDate);
      const applicableOpen = ownerRows.filter(
        (row) =>
          row.status === "confirmed" &&
          row.exitDate === null &&
          dayNumber(row.entryDate) <= moveDay,
      );

      // A repeated request reuses the already-open target. A confirmed target
      // interval that already covers the move day is also reused; this handles
      // pre-recorded/imported trips and retries without creating an overlap.
      const target =
        applicableOpen.find((row) => row.countryCode === countryCode) ??
        ownerRows.find((row) =>
          confirmedStayCoversDate(row, countryCode, moveDate),
        );
      const targetId = target?.id ?? moveStayId(owner, countryCode, moveDate);
      const closedStayIds = applicableOpen
        .filter((row) => row.id !== targetId)
        .map((row) => row.id);

      const plannedRows = ownerRows.map((row) =>
        closedStayIds.includes(row.id)
          ? { ...row, exitDate: moveDate, updatedAt: now }
          : row.id === targetId
            ? {
                ...row,
                city: args.city === undefined ? row.city : args.city,
                exitDate: null,
                openGuard: owner,
                updatedAt: now,
              }
            : row,
      );
      const plannedTarget = target
        ? plannedRows.find((row) => row.id === targetId)!
        : {
            id: targetId,
            ownerEmail: owner,
            countryCode,
            city: args.city ?? null,
            entryDate: moveDate,
            exitDate: null,
            source: "manual" as const,
            status: "confirmed" as const,
            notes: null,
            openGuard: owner,
            createdAt: now,
            updatedAt: now,
          };
      assertConfirmedStayIntegrity(plannedTarget, plannedRows);

      for (const id of closedStayIds) {
        await tx
          .update(stays)
          .set({ exitDate: moveDate, openGuard: null, updatedAt: now })
          .where(and(eq(stays.id, id), eq(stays.ownerEmail, owner)));
      }

      if (target) {
        await tx
          .update(stays)
          .set({
            city: args.city === undefined ? target.city : args.city,
            exitDate: null,
            openGuard: owner,
            updatedAt: now,
          })
          .where(and(eq(stays.id, target.id), eq(stays.ownerEmail, owner)));
      } else {
        await tx.insert(stays).values(plannedTarget).onConflictDoNothing();
      }

      const [moved] = await tx
        .select()
        .from(stays)
        .where(and(eq(stays.id, targetId), eq(stays.ownerEmail, owner)));
      if (!moved) {
        throw new Error("The move could not be recorded safely; please retry.");
      }
      return {
        date: moveDate,
        stay: moved,
        closedStayIds,
        reused: Boolean(target),
      };
    });
  },
});

/** Stable, non-identifying key makes concurrent retries converge on one row. */
function moveStayId(owner: string, countryCode: string, date: string): string {
  const digest = createHash("sha256")
    .update(`${owner}\0${countryCode}\0${date}`)
    .digest("hex")
    .slice(0, 24);
  return `move_${digest}_${date.split("-").join("")}_${countryCode}`;
}
