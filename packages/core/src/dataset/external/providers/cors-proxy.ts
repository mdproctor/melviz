import type { DataProvider, DataRequest, FetchResult } from "../types.js";

export class CorsProxyProvider implements DataProvider {
  constructor(
    private readonly inner: DataProvider,
    private readonly proxyUrl: string,
  ) {}

  async fetch(request: DataRequest): Promise<FetchResult> {
    return this.inner.fetch({ ...request, url: this.proxyUrl + request.url });
  }
}
