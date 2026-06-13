import { describe, it, expect } from "vitest";
import { compile } from "../../../expression/jsonata-bridge.js";
import { graphqlRelayPreset } from "./graphql-relay.js";

const input = {
  edges: [
    {
      cursor: "Y3Vyc29yOnYyOpHOABC",
      node: {
        title: "Fix login bug",
        state: "OPEN",
        createdAt: "2024-06-01T08:00:00Z",
        author: { login: "alice" },
      },
    },
    {
      cursor: "Y3Vyc29yOnYyOpHOABD",
      node: {
        title: "Add dark mode",
        state: "CLOSED",
        createdAt: "2024-06-02T14:30:00Z",
        author: { login: "bob" },
      },
    },
  ],
  pageInfo: {
    hasNextPage: true,
    endCursor: "Y3Vyc29yOnYyOpHOABD",
  },
};

describe("graphql-relay preset", () => {
  it("has id 'graphql-relay'", () => {
    expect(graphqlRelayPreset.id).toBe("graphql-relay");
  });

  it("unwraps edges[].node and flattens nested objects with dot keys", async () => {
    const result = await compile(graphqlRelayPreset.expression).evaluate(input);
    const rows = Array.isArray(result) ? result : [result];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      title: "Fix login bug",
      state: "OPEN",
      createdAt: "2024-06-01T08:00:00Z",
      "author.login": "alice",
    });
    expect(rows[1]).toEqual({
      title: "Add dark mode",
      state: "CLOSED",
      createdAt: "2024-06-02T14:30:00Z",
      "author.login": "bob",
    });
  });

  it("handles empty edges", async () => {
    const empty = { edges: [], pageInfo: { hasNextPage: false } };
    const result = await compile(graphqlRelayPreset.expression).evaluate(empty);
    expect(result === undefined || (Array.isArray(result) && result.length === 0)).toBe(true);
  });
});
