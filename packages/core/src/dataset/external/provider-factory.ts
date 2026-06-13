import type { DataProvider, DataProviderConfig, ExternalDataSetDef } from "./types.js";
import { InlineProvider } from "./providers/inline.js";
import { CorsProxyProvider } from "./providers/cors-proxy.js";
import { BrowserFetchProvider } from "./providers/browser-fetch.js";
import { ServerRelayProvider } from "./providers/server-relay.js";

export interface DataProviderFactory {
  create(def: ExternalDataSetDef, config: DataProviderConfig): DataProvider | undefined;
}

export function createDataProviderFactory(): DataProviderFactory {
  return {
    create(def: ExternalDataSetDef, config: DataProviderConfig): DataProvider | undefined {
      if (def.content !== undefined) {
        return new InlineProvider(def.content);
      }

      if (def.join !== undefined) {
        return undefined;
      }

      // url-based
      let provider: DataProvider =
        config.defaultProvider === "server-relay" && config.serverRelay
          ? new ServerRelayProvider(config.serverRelay.endpoint)
          : new BrowserFetchProvider();

      if (config.corsProxy?.enabled && config.corsProxy.url) {
        provider = new CorsProxyProvider(provider, config.corsProxy.url);
      }

      return provider;
    },
  };
}
