import type { DataProvider, DataRequest, FetchResult, MelvizDataMessage } from "../types.js";

export class PostMessageProvider implements DataProvider {
  constructor(
    private readonly dataSetId: string,
    private readonly timeoutMs: number = 30_000,
  ) {}

  async fetch(_request: DataRequest): Promise<FetchResult> {
    return new Promise<FetchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `PostMessage timeout: no data for dataset "${this.dataSetId}" within ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);

      const handler = (event: MessageEvent) => {
        const msg = event.data as MelvizDataMessage;
        if (msg && msg.type === "melviz-dataset" && msg.dataSetId === this.dataSetId) {
          cleanup();
          resolve(
            msg.contentType !== undefined
              ? { data: msg.data, contentType: msg.contentType }
              : { data: msg.data },
          );
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        globalThis.removeEventListener("message", handler);
      };

      globalThis.addEventListener("message", handler);
    });
  }
}
