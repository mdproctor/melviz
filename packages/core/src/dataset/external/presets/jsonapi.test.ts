import { describe, it, expect } from "vitest";
import { compile } from "../../../expression/jsonata-bridge.js";
import { jsonapiPreset } from "./jsonapi.js";

const input = {
  data: [
    {
      type: "articles",
      id: "1",
      attributes: {
        title: "JSON:API Paints My Bikeshed",
        body: "The shortest article ever.",
        created: "2024-05-20T10:00:00Z",
      },
    },
    {
      type: "articles",
      id: "2",
      attributes: {
        title: "Rails Is Omakase",
        body: "There are lots of choices.",
        created: "2024-05-21T12:00:00Z",
      },
    },
  ],
  links: {
    self: "https://example.com/articles?page[number]=1",
    next: "https://example.com/articles?page[number]=2",
  },
};

describe("jsonapi preset", () => {
  it("has id 'jsonapi'", () => {
    expect(jsonapiPreset.id).toBe("jsonapi");
  });

  it("flattens data[].attributes alongside id and type", async () => {
    const result = await compile(jsonapiPreset.expression).evaluate(input);
    const rows = Array.isArray(result) ? result : [result];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "1",
      type: "articles",
      title: "JSON:API Paints My Bikeshed",
      body: "The shortest article ever.",
      created: "2024-05-20T10:00:00Z",
    });
    expect(rows[1]).toEqual({
      id: "2",
      type: "articles",
      title: "Rails Is Omakase",
      body: "There are lots of choices.",
      created: "2024-05-21T12:00:00Z",
    });
  });

  it("handles empty data array", async () => {
    const empty = { data: [] };
    const result = await compile(jsonapiPreset.expression).evaluate(empty);
    expect(result === undefined || (Array.isArray(result) && result.length === 0)).toBe(true);
  });
});
