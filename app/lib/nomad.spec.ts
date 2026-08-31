import { describe, expect, it } from "vitest";

import { escapeCsvCell } from "./nomad";

describe("escapeCsvCell", () => {
  it("quotes ordinary values and doubles embedded quotes", () => {
    expect(escapeCsvCell('Montréal, "QC"')).toBe('"Montréal, ""QC"""');
  });

  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "  =NOW()"])(
    "neutralizes spreadsheet formula input %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("keeps empty cells empty", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });
});
