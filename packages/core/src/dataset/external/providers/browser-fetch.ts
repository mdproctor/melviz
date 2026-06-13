import type { DataProvider, DataRequest, FetchResult } from "../types.js";

export class BrowserFetchProvider implements DataProvider {
  async fetch(request: DataRequest): Promise<FetchResult> {
    const url = new URL(request.url);
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

    const response = await fetch(url.toString(), init);

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
