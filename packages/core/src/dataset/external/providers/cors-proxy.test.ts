import { describe, it, expect } from "vitest";
import { CorsProxyProvider } from "./cors-proxy.js";
import { HttpMethod } from "../types.js";
import type { DataProvider, DataRequest, FetchResult } from "../types.js";

function makeRequest(url: string): DataRequest {
  return {
    url,
    method: HttpMethod.GET,
    headers: {},
    query: {},
  };
}

class MockProvider implements DataProvider {
  lastRequest: DataRequest | undefined;

  async fetch(request: DataRequest): Promise<FetchResult> {
    this.lastRequest = request;
    return { data: "mock response", contentType: "text/plain" };
  }
}

describe("CorsProxyProvider", () => {
  it("prepends proxy URL to the request URL", async () => {
    const inner = new MockProvider();
    const proxy = new CorsProxyProvider(inner, "https://proxy.example.com/");

    await proxy.fetch(makeRequest("https://api.example.com/data"));

    expect(inner.lastRequest).toBeDefined();
    expect(inner.lastRequest!.url).toBe("https://proxy.example.com/https://api.example.com/data");
  });

  it("preserves all other request fields unchanged", async () => {
    const inner = new MockProvider();
    const proxy = new CorsProxyProvider(inner, "https://proxy.example.com/");
    const request: DataRequest = {
      url: "https://api.example.com/data",
      method: HttpMethod.POST,
      headers: { Authorization: "Bearer token" },
      query: { page: "2" },
      body: '{"key": "value"}',
    };

    await proxy.fetch(request);

    expect(inner.lastRequest!.method).toBe(HttpMethod.POST);
    expect(inner.lastRequest!.headers).toEqual({ Authorization: "Bearer token" });
    expect(inner.lastRequest!.query).toEqual({ page: "2" });
    expect(inner.lastRequest!.body).toBe('{"key": "value"}');
  });

  it("returns the inner provider's result unmodified", async () => {
    const inner = new MockProvider();
    const proxy = new CorsProxyProvider(inner, "https://proxy.example.com/");

    const result = await proxy.fetch(makeRequest("https://api.example.com/data"));

    expect(result.data).toBe("mock response");
    expect(result.contentType).toBe("text/plain");
  });

  it("works with an empty proxy URL (identity prefix)", async () => {
    const inner = new MockProvider();
    const proxy = new CorsProxyProvider(inner, "");

    await proxy.fetch(makeRequest("https://api.example.com/data"));

    expect(inner.lastRequest!.url).toBe("https://api.example.com/data");
  });
});
