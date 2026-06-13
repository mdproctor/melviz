import { describe, it, expect } from "vitest";
import { InlineProvider } from "./inline.js";
import { HttpMethod } from "../types.js";
import type { DataRequest } from "../types.js";

function makeRequest(): DataRequest {
  return {
    url: "unused",
    method: HttpMethod.GET,
    headers: {},
    query: {},
  };
}

describe("InlineProvider", () => {
  it("returns the content string as data", async () => {
    const provider = new InlineProvider('{"key": "value"}');
    const result = await provider.fetch(makeRequest());

    expect(result.data).toBe('{"key": "value"}');
  });

  it("does not set contentType", async () => {
    const provider = new InlineProvider("some,csv,data");
    const result = await provider.fetch(makeRequest());

    expect(result.contentType).toBeUndefined();
  });

  it("returns empty string content unchanged", async () => {
    const provider = new InlineProvider("");
    const result = await provider.fetch(makeRequest());

    expect(result.data).toBe("");
  });

  it("ignores the request parameter entirely", async () => {
    const provider = new InlineProvider("inline content");
    const request: DataRequest = {
      url: "https://example.com/data",
      method: HttpMethod.POST,
      headers: { Authorization: "Bearer token" },
      query: { page: "1" },
      body: "request body",
    };

    const result = await provider.fetch(request);

    expect(result.data).toBe("inline content");
  });
});
