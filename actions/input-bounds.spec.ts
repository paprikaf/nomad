import { describe, expect, it } from "vitest";
import type { z } from "zod";

import complianceStatus from "./compliance-status.js";
import deleteStay from "./delete-stay.js";
import hello from "./hello.js";
import listStays from "./list-stays.js";
import moveHere from "./move-here.js";
import navigate from "./navigate.js";
import updateProfile from "./update-profile.js";
import upsertRule from "./upsert-rule.js";
import upsertStay from "./upsert-stay.js";
import upsertVisa from "./upsert-visa.js";

type SchemaAction = { schema: z.ZodType };
type ApprovalAction = {
  needsApproval?: boolean;
  allowPersistentApproval?: boolean;
};

function accepts(action: unknown, input: unknown): boolean {
  return (action as SchemaAction).schema.safeParse(input).success;
}

describe("action input bounds", () => {
  it("bounds simple identifiers and navigation strings", () => {
    expect(accepts(deleteStay, { id: "stay_123-test" })).toBe(true);
    expect(accepts(deleteStay, { id: "x".repeat(129) })).toBe(false);
    expect(accepts(hello, { name: "x".repeat(100) })).toBe(true);
    expect(accepts(hello, { name: "x".repeat(101) })).toBe(false);
    expect(accepts(navigate, { path: "/countries/PT" })).toBe(true);
    expect(accepts(navigate, { path: "https://example.com" })).toBe(false);
    expect(accepts(navigate, { path: "//example.com" })).toBe(false);
    expect(accepts(navigate, { path: "/\\example.com" })).toBe(false);
    expect(accepts(navigate, { path: `/${"x".repeat(2_048)}` })).toBe(false);
  });

  it("requires ISO-shaped country codes and valid calendar dates", () => {
    expect(accepts(listStays, { countryCode: "pt" })).toBe(true);
    expect(accepts(listStays, { countryCode: "P1" })).toBe(false);
    expect(
      accepts(upsertStay, {
        countryCode: "PT",
        entryDate: "2026-08-31",
      }),
    ).toBe(true);
    expect(
      accepts(upsertStay, {
        countryCode: "PT",
        entryDate: "2026-02-30",
      }),
    ).toBe(false);
    expect(accepts(complianceStatus, { asOf: "2026-08-31" })).toBe(true);
    expect(accepts(complianceStatus, { asOf: "2026-8-31" })).toBe(false);
    expect(accepts(complianceStatus, { timeZone: "America/Toronto" })).toBe(
      true,
    );
    expect(accepts(complianceStatus, { timeZone: "Not/A_Time_Zone" })).toBe(
      false,
    );
    expect(accepts(moveHere, { countryCode: "CA" })).toBe(true);
    expect(
      accepts(moveHere, {
        countryCode: "CA",
        timeZone: "America/Toronto",
      }),
    ).toBe(true);
    expect(
      accepts(moveHere, { countryCode: "CA", timeZone: "Not/A_Time_Zone" }),
    ).toBe(false);
    expect(accepts(moveHere, { countryCode: "CA", date: "2026-02-30" })).toBe(
      false,
    );
  });

  it("bounds free text and day counts", () => {
    expect(
      accepts(upsertRule, {
        name: "Schengen 90/180",
        kind: "rolling-window",
        zone: "schengen",
        limitDays: 90,
        windowDays: 180,
      }),
    ).toBe(true);
    expect(accepts(upsertRule, { limitDays: 36_601 })).toBe(false);
    expect(accepts(upsertRule, { description: "x".repeat(4_001) })).toBe(false);
    expect(accepts(upsertStay, { city: "x".repeat(121) })).toBe(false);
    expect(accepts(upsertVisa, { notes: "x".repeat(4_001) })).toBe(false);
  });

  it("routes Mail candidates through staging before confirmation", () => {
    expect(
      accepts(upsertStay, {
        countryCode: "PT",
        entryDate: "2026-08-31",
        source: "inbox",
      }),
    ).toBe(false);
    expect(
      accepts(upsertStay, {
        countryCode: "PT",
        entryDate: "2026-08-31",
        status: "pending",
      }),
    ).toBe(false);
    expect(
      accepts(upsertStay, { id: "staged_mail_stay", status: "confirmed" }),
    ).toBe(true);
    expect(
      accepts(upsertStay, { id: "staged_mail_stay", source: "manual" }),
    ).toBe(false);
  });

  it("requires human approval for agent-originated ledger mutations", () => {
    for (const action of [upsertStay, moveHere, deleteStay]) {
      const approval = action as unknown as ApprovalAction;
      expect(approval.needsApproval).toBe(true);
      expect(approval.allowPersistentApproval).toBe(false);
    }
  });

  it("bounds profile list sizes and elements", () => {
    expect(
      accepts(updateProfile, {
        goals: ["schengen", "tax", "pr", "log"],
        trackedCountries: ["PT", "CA"],
      }),
    ).toBe(true);
    expect(
      accepts(updateProfile, { trackedCountries: Array(251).fill("PT") }),
    ).toBe(false);
    expect(accepts(updateProfile, { goals: ["x".repeat(33)] })).toBe(false);
    expect(accepts(updateProfile, { timeZone: "America/Toronto" })).toBe(true);
    expect(accepts(updateProfile, { timeZone: "Not/A_Time_Zone" })).toBe(false);
  });
});
