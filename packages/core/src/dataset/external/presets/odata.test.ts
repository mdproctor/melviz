import { describe, it, expect } from "vitest";
import { compile } from "../../../expression/jsonata-bridge.js";
import { odataPreset } from "./odata.js";

const input = {
  "@odata.context": "https://services.odata.org/V4/OData/$metadata#Products",
  "@odata.count": 100,
  value: [
    {
      ID: 1,
      Name: "Milk",
      Price: 2.5,
      ReleaseDate: "2024-01-15",
      "@odata.etag": 'W/"MjAyNC0wNi0xM1QxMDowMDowMFo="',
    },
    {
      ID: 2,
      Name: "Bread",
      Price: 3.0,
      ReleaseDate: "2024-02-20",
      "@odata.etag": 'W/"MjAyNC0wNi0xM1QxMDowMTowMFo="',
    },
  ],
  "@odata.nextLink": "https://services.odata.org/V4/OData/Products?$skip=2",
};

describe("odata preset", () => {
  it("has id 'odata'", () => {
    expect(odataPreset.id).toBe("odata");
  });

  it("extracts value[] and strips @odata.* annotations", async () => {
    const result = await compile(odataPreset.expression).evaluate(input);
    const rows = Array.isArray(result) ? result : [result];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      ID: 1,
      Name: "Milk",
      Price: 2.5,
      ReleaseDate: "2024-01-15",
    });
    expect(rows[1]).toEqual({
      ID: 2,
      Name: "Bread",
      Price: 3.0,
      ReleaseDate: "2024-02-20",
    });
  });

  it("handles empty value array", async () => {
    const empty = { "@odata.context": "...", value: [] };
    const result = await compile(odataPreset.expression).evaluate(empty);
    expect(result === undefined || (Array.isArray(result) && result.length === 0)).toBe(true);
  });
});
