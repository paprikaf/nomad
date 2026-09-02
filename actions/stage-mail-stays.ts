import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { stayOwnerLocks, stays } from "../server/db/schema.js";
import { requireOwner } from "../server/lib/owner.js";
import { dayNumber, isValidISODate } from "../shared/compliance.js";
import { isKnownCountry } from "../shared/countries.js";

const MAX_CANDIDATES = 20;
const MIN_CONFIDENCE = 0.8;

const compactText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      `${label} must be one line without control characters`,
    );

const isoDate = z
  .string()
  .length(10)
  .refine(isValidISODate, "Expected a valid YYYY-MM-DD calendar date");

const countryCode = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase())
  .refine(isKnownCountry, "Expected a supported ISO 3166-1 alpha-2 code");

const mailCandidate = z
  .object({
    countryCode,
    city: compactText(120, "city").optional(),
    entryDate: isoDate,
    exitDate: isoDate.nullable().optional(),
    confidence: z.number().min(MIN_CONFIDENCE).max(1),
    accountEmail: z.string().trim().toLowerCase().email().max(254),
    messageId: compactText(255, "messageId"),
    threadId: compactText(255, "threadId").optional(),
    evidenceKind: z.enum(["flight", "rail", "accommodation", "entry"]),
    providerName: compactText(80, "providerName"),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.exitDate &&
      dayNumber(candidate.exitDate) < dayNumber(candidate.entryDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["exitDate"],
        message: "exitDate must be on or after entryDate",
      });
    }
  });

type MailCandidate = z.infer<typeof mailCandidate>;

export default defineAction({
  description:
    "Stage up to 20 high-confidence travel candidates returned by the connected Mail app. This action validates structured provenance, creates only pending inbox stays, and safely skips retries. It intentionally does not accept email bodies, subjects, booking codes, payment data, passport data, recipient lists, or a caller-provided source reference.",
  schema: z
    .object({
      candidates: z.array(mailCandidate).min(1).max(MAX_CANDIDATES),
    })
    .strict(),
  run: async ({ candidates }) => {
    const owner = requireOwner();
    const db = getDb();
    const staged: StagedSummary[] = [];
    const skipped: SkippedSummary[] = [];
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

      for (const candidate of candidates) {
        const sourceRef = await sourceReference(candidate);
        const row = {
          id: nanoid(),
          ownerEmail: owner,
          countryCode: candidate.countryCode,
          city: candidate.city ?? null,
          entryDate: candidate.entryDate,
          exitDate: candidate.exitDate ?? null,
          source: "inbox" as const,
          status: "pending" as const,
          notes: null,
          sourceRef,
          sourceAccount: candidate.accountEmail,
          sourceMessageId: candidate.messageId,
          sourceThreadId: candidate.threadId ?? null,
          evidenceKind: candidate.evidenceKind,
          evidenceProvider: candidate.providerName,
          evidenceConfidence: Math.round(candidate.confidence * 100),
          openGuard: null,
          createdAt: now,
          updatedAt: now,
        };

        const inserted = await tx
          .insert(stays)
          .values(row)
          .onConflictDoNothing({ target: [stays.ownerEmail, stays.sourceRef] })
          .returning({ id: stays.id });

        if (inserted.length === 0) {
          skipped.push({
            sourceRef,
            countryCode: candidate.countryCode,
            entryDate: candidate.entryDate,
            reason: "duplicate",
          });
          continue;
        }

        staged.push({
          id: row.id,
          sourceRef,
          countryCode: row.countryCode,
          city: row.city,
          entryDate: row.entryDate,
          exitDate: row.exitDate,
          evidenceKind: row.evidenceKind,
          evidenceProvider: row.evidenceProvider,
          evidenceConfidence: row.evidenceConfidence,
        });
      }

      return {
        staged,
        skipped,
        stagedCount: staged.length,
        skippedCount: skipped.length,
      };
    });
  },
});

interface StagedSummary {
  id: string;
  sourceRef: string;
  countryCode: string;
  city: string | null;
  entryDate: string;
  exitDate: string | null;
  evidenceKind: MailCandidate["evidenceKind"];
  evidenceProvider: string;
  evidenceConfidence: number;
}

interface SkippedSummary {
  sourceRef: string;
  countryCode: string;
  entryDate: string;
  reason: "duplicate";
}

/** Stable for exact retries, but opaque to the caller and scoped by the DB index. */
export async function sourceReference(
  candidate: MailCandidate,
): Promise<string> {
  const canonical = [
    "mail",
    candidate.accountEmail,
    candidate.messageId,
    candidate.countryCode,
    candidate.entryDate,
    candidate.exitDate ?? "open",
  ].join("\u0000");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `mail:${hex}`;
}
