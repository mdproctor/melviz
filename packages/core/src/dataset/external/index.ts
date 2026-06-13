// Re-export types
export type {
  ExternalDataSetDef,
  ExternalColumnDef,
  DataRequest,
  FetchResult,
  DataProvider,
  DataProviderConfig,
  ExtractionPreset,
  PresetRegistry,
  ExtractionResult,
  ResolveResult,
  MelvizDataMessage,
} from "./types.js";

export { HttpMethod } from "./types.js";

// Schema
export { parseExternalDataSetDef } from "./schema.js";
export type { ParsedExternalDataSetDef } from "./schema.js";

// Parsers
export { parseCsv } from "./csv.js";
export type { CsvParseOptions, CsvParseResult } from "./csv.js";
export { parseMetrics } from "./metrics-parser.js";

// Presets
export { createPresetRegistry } from "./presets/registry.js";

// Extraction
export { extractDataSet } from "./extraction.js";

// Join
export { joinDataSets } from "./join.js";

// Resolver
export { resolveExternalDataSet } from "./resolver.js";
export type { ResolverContext } from "./resolver.js";

// Providers (public — useful for consumers)
export { InlineProvider } from "./providers/inline.js";
export { CorsProxyProvider } from "./providers/cors-proxy.js";
export { BrowserFetchProvider } from "./providers/browser-fetch.js";
export { ServerRelayProvider } from "./providers/server-relay.js";
export { PostMessageProvider } from "./providers/post-message.js";

// Factory
export { createDataProviderFactory } from "./provider-factory.js";
export type { DataProviderFactory } from "./provider-factory.js";
