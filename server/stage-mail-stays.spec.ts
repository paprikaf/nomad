import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const { getDbMock, requireOwnerMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  requireOwnerMock: vi.fn(),
}));

vi.mock("./db/index.js", () => ({ getDb: getDbMock }));
vi.mock("./lib/owner.js", () => ({ requireOwner: requireOwnerMock }));

import stageMailStays from "../actions/stage-mail-stays.js";

type StageAction = {
  schema: z.ZodType;
  run: (args: { candidates: Array<Record<string, unknown>> }) => Promise<{
    staged: Array<Record<string, unknown>>;
    skipped: Array<Record<string, unknown>>;
    stagedCount: number;
    skippedCount: number;
  }>;
};

const action = stageMailStays as unknown as StageAction;

const candidate = {
  countryCode: "pt",
  city: "Lisbon",
  entryDate: "2026-06-01",
  exitDate: "2026-06-07",
  confidence: 0.94,
  accountEmail: "Traveler@Example.com",
  messageId: "message-123",
  threadId: "thread-123",
  evidenceKind: "flight",
  providerName: "Example Air",
};

describe("stage-mail-stays", () => {
  let store: ReturnType<typeof createFakeStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createFakeStore();
    getDbMock.mockReturnValue(store.db);
    requireOwnerMock.mockReturnValue("owner-a@example.com");
  });

  it("accepts only bounded, structured evidence", () => {
    expect(action.schema.safeParse({ candidates: [candidate] }).success).toBe(
      true,
    );
    expect(
      action.schema.safeParse({
        candidates: [{ ...candidate, countryCode: "ZZ" }],
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        candidates: [{ ...candidate, entryDate: "2026-02-30" }],
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        candidates: [
          {
            ...candidate,
            entryDate: "2026-06-08",
            exitDate: "2026-06-07",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        candidates: [{ ...candidate, confidence: 0.79 }],
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({ candidates: Array(21).fill(candidate) })
        .success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        candidates: [{ ...candidate, evidenceKind: "visa" }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["body", "full email body"],
    ["subject", "Booking ABC123"],
    ["bookingCode", "ABC123"],
    ["paymentData", "card details"],
    ["passportNumber", "example-passport"],
    ["recipients", ["other@example.com"]],
    ["sourceRef", "caller-controlled"],
  ])("rejects the forbidden %s field", (field, value) => {
    expect(
      action.schema.safeParse({
        candidates: [{ ...candidate, [field]: value }],
      }).success,
    ).toBe(false);
  });

  it("forces pending inbox rows and returns a minimized summary", async () => {
    const result = await action.run({ candidates: [candidate] });
    const [row] = [...store.rows.values()];

    expect(row).toMatchObject({
      ownerEmail: "owner-a@example.com",
      countryCode: "PT",
      source: "inbox",
      status: "pending",
      notes: null,
      sourceAccount: "traveler@example.com",
      sourceMessageId: "message-123",
      sourceThreadId: "thread-123",
      evidenceKind: "flight",
      evidenceProvider: "Example Air",
      evidenceConfidence: 94,
    });
    expect(row.sourceRef).toMatch(/^mail:[a-f0-9]{64}$/);
    expect(result).toMatchObject({ stagedCount: 1, skippedCount: 0 });
    expect(result.staged[0]).not.toHaveProperty("ownerEmail");
    expect(result.staged[0]).not.toHaveProperty("sourceAccount");
    expect(result.staged[0]).not.toHaveProperty("sourceMessageId");
  });

  it("is idempotent for retries and concurrent calls", async () => {
    const [first, second] = await Promise.all([
      action.run({ candidates: [candidate] }),
      action.run({ candidates: [candidate] }),
    ]);

    expect(store.rows).toHaveLength(1);
    expect(first.stagedCount + second.stagedCount).toBe(1);
    expect(first.skippedCount + second.skippedCount).toBe(1);

    const retry = await action.run({ candidates: [candidate] });
    expect(retry).toMatchObject({ stagedCount: 0, skippedCount: 1 });
    expect(store.rows).toHaveLength(1);
  });

  it("scopes source-reference uniqueness to the owner", async () => {
    await action.run({ candidates: [candidate] });
    requireOwnerMock.mockReturnValue("owner-b@example.com");
    const secondOwner = await action.run({ candidates: [candidate] });

    expect(secondOwner).toMatchObject({ stagedCount: 1, skippedCount: 0 });
    expect(store.rows).toHaveLength(2);
  });
});

function createFakeStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const db = {
    transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(db)),
    insert: vi.fn(() => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const key = `${String(row.ownerEmail)}\u0000${String(row.sourceRef)}`;
            if (rows.has(key)) return [];
            rows.set(key, row);
            return [{ id: row.id }];
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    })),
  };
  return { db, rows };
}
