import { describe, expect, it } from "vitest";

import {
  assertConfirmedStayIntegrity,
  confirmedStayCoversDate,
  type StayInterval,
} from "./stay-integrity";

function interval(
  partial: Partial<StayInterval> & Pick<StayInterval, "id" | "countryCode">,
): StayInterval {
  return {
    entryDate: "2026-08-01",
    exitDate: "2026-08-10",
    status: "confirmed",
    ...partial,
  };
}

describe("confirmed stay integrity", () => {
  it("recognizes a pre-recorded target stay that covers the move date", () => {
    const plannedPortugal = interval({
      id: "planned-pt",
      countryCode: "PT",
      entryDate: "2026-08-05",
      exitDate: "2026-08-20",
    });
    expect(confirmedStayCoversDate(plannedPortugal, "pt", "2026-08-10")).toBe(
      true,
    );
    expect(confirmedStayCoversDate(plannedPortugal, "PT", "2026-08-21")).toBe(
      false,
    );
    expect(
      confirmedStayCoversDate(
        { ...plannedPortugal, status: "pending" },
        "PT",
        "2026-08-10",
      ),
    ).toBe(false);
  });

  it("allows non-overlapping stays and an explicit same-day country move", () => {
    const portugal = interval({ id: "pt", countryCode: "PT" });
    expect(() =>
      assertConfirmedStayIntegrity(
        interval({
          id: "ca",
          countryCode: "CA",
          entryDate: "2026-08-10",
          exitDate: null,
        }),
        [portugal],
      ),
    ).not.toThrow();
    expect(() =>
      assertConfirmedStayIntegrity(
        interval({
          id: "th",
          countryCode: "TH",
          entryDate: "2026-08-11",
        }),
        [portugal],
      ),
    ).not.toThrow();
  });

  it("rejects overlapping confirmed stays on create or date update", () => {
    const portugal = interval({ id: "pt", countryCode: "PT" });
    expect(() =>
      assertConfirmedStayIntegrity(
        interval({
          id: "ca",
          countryCode: "CA",
          entryDate: "2026-08-09",
        }),
        [portugal],
      ),
    ).toThrow(/cannot overlap/i);
    expect(() =>
      assertConfirmedStayIntegrity(
        interval({
          id: "ca",
          countryCode: "CA",
          entryDate: "2026-08-10",
          exitDate: "2026-08-10",
        }),
        [interval({ ...portugal, countryCode: "CA" })],
      ),
    ).toThrow(/cannot overlap/i);
  });

  it("rejects multiple confirmed open stays", () => {
    expect(() =>
      assertConfirmedStayIntegrity(
        interval({ id: "ca", countryCode: "CA", exitDate: null }),
        [interval({ id: "pt", countryCode: "PT", exitDate: null })],
      ),
    ).toThrow(/one confirmed ongoing stay/i);
  });

  it("allows pending evidence but validates it when confirmed", () => {
    const open = interval({ id: "pt", countryCode: "PT", exitDate: null });
    const detected = interval({
      id: "mail-ca",
      countryCode: "CA",
      entryDate: "2026-08-05",
      exitDate: null,
      status: "pending",
    });
    expect(() => assertConfirmedStayIntegrity(detected, [open])).not.toThrow();
    expect(() =>
      assertConfirmedStayIntegrity({ ...detected, status: "confirmed" }, [
        open,
      ]),
    ).toThrow(/one confirmed ongoing stay/i);
  });

  it("rejects three-country transition days", () => {
    const movingThroughFrance = interval({
      id: "fr",
      countryCode: "FR",
      entryDate: "2026-08-10",
      exitDate: "2026-08-10",
    });
    expect(() =>
      assertConfirmedStayIntegrity(movingThroughFrance, [
        interval({ id: "pt", countryCode: "PT", exitDate: "2026-08-10" }),
        interval({
          id: "ca",
          countryCode: "CA",
          entryDate: "2026-08-10",
          exitDate: null,
        }),
      ]),
    ).toThrow(/at most/i);
  });
});
