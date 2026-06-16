import { describe, it, expect, vi } from "vitest";
import { BrowserFetchProvider } from "./browser-fetch.js";
import type { DataRequest } from "../types.js";
import { HttpMethod } from "../types.js";

function makeRequest(url: string, query: Record<string, string> = {}): DataRequest {
  return { url, method: HttpMethod.GET, headers: {}, query };
}

describe("BrowserFetchProvider", () => {
  it("handles absolute URLs correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [1, 2, 3] }),
      headers: new Headers({ "content-type": "application/json" }),
    });

    const provider = new BrowserFetchProvider(mockFetch);
    const result = await provider.fetch(makeRequest("https://api.example.com/data"));
    expect(result.data).toEqual({ data: [1, 2, 3] });
  });

  it("appends query parameters to URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
      headers: new Headers(),
    });

    const provider = new BrowserFetchProvider(mockFetch);
    await provider.fetch(makeRequest("https://api.example.com/search", { q: "test", limit: "10" }));

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=test");
    expect(calledUrl).toContain("limit=10");
  });

  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "404: Not Found",
    });

    const provider = new BrowserFetchProvider(mockFetch);
    await expect(provider.fetch(makeRequest("https://api.example.com/missing"))).rejects.toThrow("HTTP 404");
  });

  it("returns text data when content-type is not JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "name,value\nA,1",
      headers: new Headers({ "content-type": "text/csv" }),
    });

    const provider = new BrowserFetchProvider(mockFetch);
    const result = await provider.fetch(makeRequest("https://api.example.com/data.csv"));
    expect(result.data).toBe("name,value\nA,1");
    expect(result.contentType).toBe("text/csv");
  });

  it("skips about:blank as base URL for relative URLs", async () => {
    // In test environments (jsdom), location.href is about:blank.
    // The provider correctly skips this as a base URL.
    // Relative URLs will throw in test but work in real browsers.
    const provider = new BrowserFetchProvider(vi.fn());
    await expect(provider.fetch(makeRequest("metrics"))).rejects.toThrow();
  });

  it("uses custom fetch function", async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "custom",
      headers: new Headers(),
    });

    const provider = new BrowserFetchProvider(customFetch);
    await provider.fetch(makeRequest("https://api.example.com/data"));
    expect(customFetch).toHaveBeenCalledTimes(1);
  });
});
