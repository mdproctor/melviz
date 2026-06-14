import { describe, it, expect } from "vitest";
import type { ColumnSettings, ColumnId } from "./types.js";

describe("ColumnSettings", () => {
  it("has renamed fields", () => {
    const settings: ColumnSettings = {
      id: "revenue" as ColumnId,
      name: "Revenue",
      expression: "value * 100",
      pattern: "#,###",
      empty: "N/A",
    };
    expect(settings.id).toBe("revenue");
    expect(settings.name).toBe("Revenue");
    expect(settings.expression).toBe("value * 100");
    expect(settings.pattern).toBe("#,###");
    expect(settings.empty).toBe("N/A");
  });

  it("name is optional", () => {
    const settings: ColumnSettings = {
      id: "revenue" as ColumnId,
    };
    expect(settings.name).toBeUndefined();
  });
});
