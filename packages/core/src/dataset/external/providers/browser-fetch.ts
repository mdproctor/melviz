import type { DataProvider, DataRequest, FetchResult } from "../types.js";

export class BrowserFetchProvider implements DataProvider {
  private readonly _fetch: typeof globalThis.fetch;
  private readonly _baseUrl: string | undefined;

  constructor(fetchFn?: typeof globalThis.fetch, baseUrl?: string) {
    this._fetch = fetchFn ?? globalThis.fetch;
    this._baseUrl = baseUrl;
  }

  async fetch(request: DataRequest): Promise<FetchResult> {
    let base = this._baseUrl;
    if (!base && typeof location !== "undefined" && location.href && !location.href.startsWith("about:")) {
      base = location.href;
    }
    const url = new URL(request.url, base);
    for (const [k, v] of Object.entries(request.query)) {
      url.searchParams.set(k, v);
    }

    const headers = new Headers(request.headers);
    const init: RequestInit = { method: request.method, headers };

    if (request.body !== undefined) {
      init.body = request.body;
    } else if (request.form !== undefined) {
      const params = new URLSearchParams(request.form);
      init.body = params.toString();
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    }

    const response = await this._fetch(url.toString(), init);

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
