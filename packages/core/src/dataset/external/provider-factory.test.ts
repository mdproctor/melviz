import { describe, it, expect } from "vitest";
import { createDataProviderFactory } from "./provider-factory.js";
import { InlineProvider } from "./providers/inline.js";
import { BrowserFetchProvider } from "./providers/browser-fetch.js";
import { CorsProxyProvider } from "./providers/cors-proxy.js";
import { ServerRelayProvider } from "./providers/server-relay.js";
import type { DataProviderConfig, ExternalDataSetDef } from "./types.js";
import type { DataSetId } from "../types.js";

function def(overrides: Partial<ExternalDataSetDef> = {}): ExternalDataSetDef {
  return { uuid: "test-ds" as DataSetId, ...overrides };
}

function config(overrides: Partial<DataProviderConfig> = {}): DataProviderConfig {
  return { ...overrides };
}

describe("createDataProviderFactory", () => {
  const factory = createDataProviderFactory();

  it("returns InlineProvider when def has content", () => {
    const provider = factory.create(def({ content: '{"key": "value"}' }), config());

    expect(provider).toBeInstanceOf(InlineProvider);
  });

  it("returns undefined when def has join (no provider needed)", () => {
    const provider = factory.create(
      def({ join: ["ds-a" as DataSetId, "ds-b" as DataSetId] }),
      config(),
    );

    expect(provider).toBeUndefined();
  });

  it("returns BrowserFetchProvider for url def by default", () => {
    const provider = factory.create(def({ url: "https://api.example.com/data" }), config());

    expect(provider).toBeInstanceOf(BrowserFetchProvider);
  });

  it("wraps with CorsProxyProvider when corsProxy is enabled", () => {
    const provider = factory.create(
      def({ url: "https://api.example.com/data" }),
      config({ corsProxy: { enabled: true, url: "https://proxy.example.com/" } }),
    );

    expect(provider).toBeInstanceOf(CorsProxyProvider);
  });

  it("returns ServerRelayProvider when defaultProvider is server-relay", () => {
    const provider = factory.create(
      def({ url: "https://api.example.com/data" }),
      config({
        defaultProvider: "server-relay",
        serverRelay: { endpoint: "https://relay.example.com/fetch" },
      }),
    );

    expect(provider).toBeInstanceOf(ServerRelayProvider);
  });

  it("wraps ServerRelayProvider with CorsProxyProvider when both are configured", () => {
    const provider = factory.create(
      def({ url: "https://api.example.com/data" }),
      config({
        defaultProvider: "server-relay",
        serverRelay: { endpoint: "https://relay.example.com/fetch" },
        corsProxy: { enabled: true, url: "https://proxy.example.com/" },
      }),
    );

    expect(provider).toBeInstanceOf(CorsProxyProvider);
  });

  it("does not wrap with CorsProxyProvider when corsProxy is disabled", () => {
    const provider = factory.create(
      def({ url: "https://api.example.com/data" }),
      config({ corsProxy: { enabled: false, url: "https://proxy.example.com/" } }),
    );

    expect(provider).toBeInstanceOf(BrowserFetchProvider);
    expect(provider).not.toBeInstanceOf(CorsProxyProvider);
  });

  it("falls back to BrowserFetchProvider when server-relay has no endpoint", () => {
    const provider = factory.create(
      def({ url: "https://api.example.com/data" }),
      config({ defaultProvider: "server-relay" }),
    );

    expect(provider).toBeInstanceOf(BrowserFetchProvider);
  });
});
