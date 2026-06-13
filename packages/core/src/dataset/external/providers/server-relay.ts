import type { DataProvider, DataRequest, FetchResult } from "../types.js";

export class ServerRelayProvider implements DataProvider {
  constructor(private readonly endpoint: string) {}

  async fetch(request: DataRequest): Promise<FetchResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("json")) {
      const data: unknown = await response.json();
      return { data, contentType };
    }
    const data = await response.text();
    return contentType ? { data, contentType } : { data };
  }
}
