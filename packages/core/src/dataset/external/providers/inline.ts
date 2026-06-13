import type { DataProvider, DataRequest, FetchResult } from "../types.js";

export class InlineProvider implements DataProvider {
  constructor(private readonly content: string) {}

  async fetch(_request: DataRequest): Promise<FetchResult> {
    return { data: this.content };
  }
}
