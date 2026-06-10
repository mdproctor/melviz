# 05 -- Data Service and Backend

**Parent:** [00-overview.md](00-overview.md)
**Status:** Draft -- Rev 2

---

## 1. DataService Interface

The `DataService` interface is the single abstraction through which the entire application accesses datasets and dashboards. Three implementations exist: `LocalDataService` (browser-only, the default), `RemoteDataService` (delegates to the Quarkus backend), and `HybridDataService` (tries remote, falls back to local). The application resolves which implementation to use at startup based on configuration, and all consumers interact only with the interface.

This replaces the current GWT architecture where `ExternalDataSetClientProvider` handles URL fetching, `ClientDataSetManager` manages dataset registration and lookup, and `DataSetClientServicesImpl` bridges the two -- all wired together via Errai CDI injection.

```typescript
export interface DataService {
  // Dataset operations
  fetchDataSet(ref: DataSetRef): Promise<TypedDataSet>;
  queryDataSet(ref: DataSetRef, ops: readonly DataSetOp[]): Promise<TypedDataSet>;

  // Dashboard CRUD
  saveDashboard(dashboard: Dashboard): Promise<DashboardId>;
  loadDashboard(id: DashboardId): Promise<Dashboard>;
  listDashboards(): Promise<readonly DashboardSummary[]>;
  deleteDashboard(id: DashboardId): Promise<void>;

  // Plugin registry
  listAvailablePlugins(): Promise<readonly PluginManifest[]>;

  // Capability introspection
  capabilities(): ServiceCapabilities;
}
```

### ServiceCapabilities

Capabilities tell the UI what this service instance can do. Components inspect this to conditionally render features -- a SQL data source selector does not appear when the service has no `sqlDataSources` capability.

```typescript
export interface ServiceCapabilities {
  readonly serverSideQuery: boolean;     // ops can be pushed to server
  readonly serverSideCache: boolean;     // server maintains a cache
  readonly persistence: boolean;         // dashboards survive page refresh
  readonly sqlDataSources: boolean;      // JNDI SQL data sources available
  readonly dataProxy: boolean;           // server fetches on client's behalf (CORS bypass)
  readonly pluginRegistry: boolean;      // server hosts a plugin registry
  readonly dataProviders: readonly string[];  // available provider types
}
```

`LocalDataService` reports `persistence: true` (IndexedDB), `serverSideQuery: false`, `serverSideCache: false`, `sqlDataSources: false`, `dataProxy: false`, `pluginRegistry: false`, and `dataProviders: ['url', 'inline', 'csv-file']`.

`RemoteDataService` reports all capabilities as `true` and includes the full provider list from the server's `/api/capabilities` endpoint.

---

## 2. LocalDataService (Default, No Backend)

The local service runs entirely in the browser. It is the default -- Melviz works without any backend server.

### Dataset Fetching

Datasets defined by URL are fetched via the browser's `fetch()` API, subject to CORS. This mirrors what `ExternalDataSetClientProvider.fetch()` does today via GWT's `DomGlobal.fetch`, but without the Errai CDI wiring and callback coordination layer.

```typescript
export class LocalDataService implements DataService {
  constructor(
    private readonly providers: DataProviderRegistry,
    private readonly cache: DataSetCache,
    private readonly manager: DataSetManager,
  ) {}

  async fetchDataSet(ref: DataSetRef): Promise<TypedDataSet> {
    return this.manager.resolve(ref);
  }

  async queryDataSet(
    ref: DataSetRef,
    ops: readonly DataSetOp[],
  ): Promise<TypedDataSet> {
    const dataset = await this.manager.resolve(ref);
    return applyOps(dataset, ops);
  }

  // ...dashboard methods use IndexedDB (see section 8)
}
```

### In-Memory Operations

All filter, group, and sort operations run as pure TypeScript functions (`applyOps`). This replaces the `DataSetOpEngine.execute()` call chain and the `ClientDataSetManager.lookupDataSet()` method that currently delegates to the engine after dataset registration.

### IndexedDB for Dashboard Persistence

Dashboards are stored in IndexedDB so they survive page refresh without a server. The `dashboards` store holds serialised YAML and metadata.

### IndexedDB + In-Memory Cache with TTL

Dataset results are cached in two tiers:

1. **In-memory** -- a `Map<string, CacheEntry>` with configurable TTL per dataset (from the dataset definition's `refreshTimeAmount`, replacing the current `DomGlobal.setTimeout`-based invalidation in `ExternalDataSetClientProvider.handleCache()`).
2. **IndexedDB** -- the `datasetCache` store persists cache entries across page refreshes.

On fetch, the in-memory cache is checked first. On miss, IndexedDB is checked. On miss there, the provider fetches fresh data and populates both tiers.

### Stale-While-Offline

When `navigator.onLine` is `false` (or a fetch fails with a network error), the cache serves stale data rather than throwing. The returned `TypedDataSet` carries a `stale: true` flag so the UI can indicate the data may be outdated.

### Data Providers

The local service supports three built-in providers:

| Provider | Source | Notes |
|----------|--------|-------|
| `url` | HTTP endpoint (JSON, CSV, Prometheus metrics) | Browser `fetch()`, subject to CORS. Replaces `ExternalDataSetClientProvider.fetch()` |
| `inline` | Embedded in the YAML dashboard definition | Replaces `ExternalDataSetDef.content` handling |
| `csv-file` | File input from the user's filesystem | Papa Parse streaming parse |

---

## 3. RemoteDataService (Delegates to Quarkus)

When a backend URL is configured, the remote service delegates all operations to the server.

```typescript
export class RemoteDataService implements DataService {
  private cachedCapabilities: ServiceCapabilities | null = null;

  constructor(private readonly baseUrl: string) {}

  async fetchDataSet(ref: DataSetRef): Promise<TypedDataSet> {
    const response = await fetch(`${this.baseUrl}/api/dataset/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ref),
    });
    if (!response.ok) throw new DataSetError(/* ... */);
    return parseTypedDataSet(await response.json());
  }

  async queryDataSet(
    ref: DataSetRef,
    ops: readonly DataSetOp[],
  ): Promise<TypedDataSet> {
    const response = await fetch(`${this.baseUrl}/api/dataset/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, ops }),
    });
    if (!response.ok) throw new DataSetError(/* ... */);
    return parseTypedDataSet(await response.json());
  }

  capabilities(): ServiceCapabilities {
    // Populated from /api/capabilities on first call, cached thereafter
    if (!this.cachedCapabilities) {
      throw new Error('Call init() before capabilities()');
    }
    return this.cachedCapabilities;
  }

  async init(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/capabilities`);
    this.cachedCapabilities = await response.json();
  }

  // ...dashboard and plugin methods delegate similarly
}
```

### Server Proxy (CORS Bypass, Auth Injection)

The server fetches datasets on behalf of the client. This eliminates CORS issues for datasets hosted on third-party domains and allows the server to inject authentication headers (API keys, bearer tokens) that should not be exposed to the browser. This is the `dataProxy` capability.

### Server-Side Operations

When `serverSideQuery` is `true`, filter/group/sort operations are sent to the server, which pushes them down to the underlying data source (e.g., SQL `WHERE`/`GROUP BY`/`ORDER BY` clauses). The client does not receive the full dataset and filter locally -- it receives only the result.

### Server-Side Caching

The server maintains a Caffeine cache with configurable TTL per dataset. The client does not maintain its own cache when using the remote service (the `HybridDataService` handles the fallback case).

### Data Providers

The remote service exposes all local providers plus server-side providers:

| Provider | Source | Notes |
|----------|--------|-------|
| `url` | HTTP endpoint via server proxy | CORS bypass, auth injection |
| `inline` | Embedded in dashboard YAML | Parsed server-side |
| `csv-file` | User file upload to server | Server-side Papa Parse |
| `sql` | JNDI SQL data source | Filter/group/sort pushed to SQL |
| `prometheus` | Prometheus HTTP API | PromQL query construction |
| `kafka` | Kafka topic | Windowed consumption, multi-format |
| `elasticsearch` | Elasticsearch cluster | Query DSL generation |
| `json-proxy` | JSON endpoint via server | CORS bypass variant |
| `csv-proxy` | CSV endpoint via server | CORS bypass variant |

---

## 4. HybridDataService (Tries Remote, Falls Back to Local)

The hybrid service is the production workhorse. It saves locally first for instant feedback, then syncs to the server in the background. If the server is unreachable, the local service handles everything.

```typescript
export class HybridDataService implements DataService {
  constructor(
    private readonly local: LocalDataService,
    private readonly remote: RemoteDataService,
  ) {}

  async fetchDataSet(ref: DataSetRef): Promise<TypedDataSet> {
    try {
      return await this.remote.fetchDataSet(ref);
    } catch {
      return this.local.fetchDataSet(ref);
    }
  }

  async saveDashboard(dashboard: Dashboard): Promise<DashboardId> {
    // Save locally first -- instant, never fails
    const id = await this.local.saveDashboard(dashboard);

    // Queue sync to server
    this.enqueueSyncOp({
      type: 'save-dashboard',
      dashboardId: id,
      payload: dashboard,
      updatedAt: Date.now(),
    });

    return id;
  }

  capabilities(): ServiceCapabilities {
    try {
      return this.remote.capabilities();
    } catch {
      return this.local.capabilities();
    }
  }

  // ...
}
```

### Conflict Resolution

The hybrid service uses last-write-wins with server timestamps. Multi-user concurrent editing is explicitly out of scope -- this is a single-user system, possibly with multiple tabs.

**Save flow:**

1. Dashboard is saved to IndexedDB immediately (local-first).
2. A sync operation is enqueued in the `syncQueue` IndexedDB store.
3. The sync worker attempts `PUT /api/dashboard/:id` with an `If-Unmodified-Since` header set to the local `updatedAt` timestamp.
4. If the server returns **200 OK**, the sync operation is removed from the queue.
5. If the server returns **409 Conflict** (the server's version is newer than the client's `updatedAt`), the client discards the local edit, reloads the dashboard from the server, stores the server version in IndexedDB, and notifies the user that their local changes were overwritten.
6. If the request fails (network error, 5xx), the operation stays in the queue for retry.

**Retry strategy:**

- Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped).
- After 5 failed retries, the operation is moved to a dead-letter queue in IndexedDB and the user is notified. Dead-lettered operations are not retried automatically -- the user must trigger a manual retry or discard.

```typescript
interface SyncOp {
  readonly id: string;
  readonly type: 'save-dashboard' | 'delete-dashboard';
  readonly dashboardId: DashboardId;
  readonly payload: Dashboard | null;
  readonly updatedAt: number;       // client timestamp at save time
  readonly retryCount: number;
  readonly nextRetryAt: number;     // epoch millis
}
```

### Cross-Tab Coordination

Multiple browser tabs running the same Melviz instance could issue conflicting saves. The `BroadcastChannel` API deduplicates this:

```typescript
const channel = new BroadcastChannel('melviz-sync');

// Before enqueueing a sync op, broadcast intent
channel.postMessage({ type: 'sync-claim', dashboardId, tabId });

// Other tabs receive and yield if they have the same pending op
channel.onmessage = (event) => {
  if (event.data.type === 'sync-claim'
      && event.data.dashboardId === pendingId
      && event.data.tabId !== thisTabId) {
    // Another tab claimed this sync -- remove from our queue
    removePendingSyncOp(event.data.dashboardId);
  }
};
```

Only one tab processes a given sync operation. After a successful sync (or conflict resolution), the winning tab broadcasts the result so other tabs can update their local state.

### UI Adaptation

The hybrid service's `capabilities()` method returns the remote service's capabilities when the server is reachable, and falls back to local capabilities when it is not. UI components call `capabilities()` to decide what to render -- for example, a SQL data source configuration panel only appears when `sqlDataSources` is `true`.

---

## 5. Service Resolution

Service resolution happens once at application startup, driven by configuration.

```typescript
function resolveDataService(config: MelvizConfig): DataService {
  const providers = new DataProviderRegistry([
    new UrlProvider(),
    new InlineProvider(),
    new CsvFileProvider(),
  ]);
  const cache = new DataSetCache();
  const manager = new DataSetManager(providers, cache);
  const local = new LocalDataService(providers, cache, manager);

  if (!config.backendUrl) {
    return local;
  }

  const remote = new RemoteDataService(config.backendUrl);
  return new HybridDataService(local, remote);
}
```

The resolved `DataService` is provided via `MelvizProvider` (React context) and consumed through the `useDataService()` hook. No component ever instantiates a service directly.

---

## 6. DataProvider Interface (Client-Side)

Data providers are the client-side mechanism for fetching raw data from different sources. This replaces the `DataSetProvider` SPI on the Java side and the `ExternalDataSetClientProvider`/`ExternalDataSetDef` pattern on the GWT client.

```typescript
export interface DataProvider {
  /** Unique provider type identifier, e.g. 'url', 'inline', 'csv-file'. */
  readonly type: string;

  /** Whether this provider can handle the given dataset reference. */
  canHandle(ref: DataSetRef): boolean;

  /** Fetch raw data. No operations applied. */
  fetch(ref: DataSetRef): Promise<RawDataSet>;

  /**
   * Optionally fetch and apply operations in one step.
   * Providers that can push ops to the source (e.g. SQL) override this.
   * Default: fetch + client-side applyOps.
   */
  query?(ref: DataSetRef, ops: readonly DataSetOp[]): Promise<TypedDataSet>;
}
```

### DataSetRef

The dataset reference carries everything a provider needs to fetch data. It replaces the `ExternalDataSetDef` fields (url, content, expression, headers, method, etc.) in a more structured form.

```typescript
export interface DataSetRef {
  readonly id: DataSetId;
  readonly type: string;              // provider type: 'url', 'inline', 'sql', etc.
  readonly url?: string;
  readonly content?: string;          // inline data
  readonly expression?: string;       // JSONata transform
  readonly headers?: Record<string, string>;
  readonly method?: 'GET' | 'POST';
  readonly query?: Record<string, string>;
  readonly form?: Record<string, string>;
  readonly path?: string;
  readonly cacheEnabled?: boolean;
  readonly refreshInterval?: number;  // millis
  readonly accumulate?: boolean;
}
```

### Built-in Providers

- **`UrlProvider`** -- fetches from HTTP endpoints using `fetch()`. Handles JSON, CSV, and Prometheus metrics responses based on content-type or URL extension. Replaces the `DomGlobal.fetch` call in `ExternalDataSetClientProvider.fetch()`.
- **`InlineProvider`** -- parses data embedded in the YAML dashboard definition. Replaces the `ExternalDataSetDef.content` path in `fetchAndRegisterDefinition()`.
- **`CsvFileProvider`** -- accepts a `File` object (from `<input type="file">`) and parses it with Papa Parse.

### Server-Contributed Providers

When a backend is present, its `/api/capabilities` endpoint returns the list of available provider types. The `RemoteDataService` registers proxy providers for each server-contributed type (sql, prometheus, kafka, elasticsearch, etc.) that delegate `fetch()` and `query()` to server endpoints.

### Third-Party Providers

Third-party providers are npm packages or Module Federation plugins that export a `DataProvider` implementation. They register with the `DataProviderRegistry` at startup.

```typescript
// Third-party provider example
import { DataProvider, DataSetRef, RawDataSet } from '@melviz/core';

export const graphqlProvider: DataProvider = {
  type: 'graphql',
  canHandle: (ref) => ref.type === 'graphql',
  async fetch(ref: DataSetRef): Promise<RawDataSet> {
    const response = await fetch(ref.url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ref.content }),
    });
    const json = await response.json();
    return parseGraphQLResponse(json);
  },
};
```

---

## 7. DataSetManager

The `DataSetManager` orchestrates provider resolution, caching, and request coordination. It replaces `ClientDataSetManager` and `ExternalDataCallbackCoordinator` from the current GWT code.

```typescript
export class DataSetManager {
  private readonly inflight = new Map<string, Promise<TypedDataSet>>();
  private readonly subscriptions = new Map<DataSetId, Set<() => void>>();

  constructor(
    private readonly providers: DataProviderRegistry,
    private readonly cache: DataSetCache,
  ) {}

  async resolve(ref: DataSetRef): Promise<TypedDataSet> {
    const cacheKey = computeCacheKey(ref);

    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached && !cached.expired) return cached.dataset;

    // Request deduplication: if another caller is already fetching
    // the same ref, return the same promise
    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = this.doResolve(ref, cacheKey);
    this.inflight.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  private async doResolve(
    ref: DataSetRef,
    cacheKey: string,
  ): Promise<TypedDataSet> {
    const provider = this.providers.resolve(ref);
    const raw = await provider.fetch(ref);
    const typed = parseAndType(raw, ref);

    await this.cache.put(cacheKey, typed, ref.refreshInterval);

    // Notify subscribers
    this.subscriptions.get(ref.id)?.forEach((cb) => cb());

    return typed;
  }

  /** Subscribe to refresh events for a dataset. Returns unsubscribe function. */
  subscribe(id: DataSetId, callback: () => void): () => void {
    if (!this.subscriptions.has(id)) {
      this.subscriptions.set(id, new Set());
    }
    this.subscriptions.get(id)!.add(callback);
    return () => this.subscriptions.get(id)?.delete(callback);
  }
}
```

### Request Deduplication

When two charts on the same page reference the same dataset, the first chart's fetch is in-flight when the second chart requests the same data. The `inflight` map ensures only one HTTP request is made -- both callers await the same promise.

### Subscription Model

Components subscribe to dataset refresh events. When a dataset is refetched (due to cache expiry, filter change, or manual refresh), subscribers are notified and re-render with the new data.

### Structured Errors

```typescript
export class DataSetError extends Error {
  constructor(
    message: string,
    readonly code: DataSetErrorCode,
    readonly recoverable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export type DataSetErrorCode =
  | 'NETWORK_ERROR'      // fetch failed, may be offline
  | 'CORS_ERROR'         // blocked by CORS policy
  | 'PARSE_ERROR'        // response could not be parsed
  | 'PROVIDER_NOT_FOUND' // no provider for this ref type
  | 'TRANSFORM_ERROR'    // JSONata expression failed
  | 'SERVER_ERROR'       // backend returned 5xx
  | 'NOT_FOUND'          // dataset or dashboard not found
  | 'CONFLICT';          // server version newer than local (409)
```

`recoverable: true` means the UI should offer a retry button. Network errors and server errors are recoverable. Parse errors and provider-not-found errors are not.

---

## 8. IndexedDB Schema

Three object stores in a single `melviz` database.

```typescript
// Database name: 'melviz'
// Version: 1

interface MelvizDBSchema {
  dashboards: {
    key: string;          // DashboardId
    value: {
      id: string;
      title: string;
      yamlContent: string;
      createdAt: number;  // epoch millis
      updatedAt: number;  // epoch millis
      syncedAt: number | null;  // null = never synced to server
    };
    indexes: {
      'by-updated': number;
    };
  };

  datasetCache: {
    key: string;          // cache key (derived from DataSetRef)
    value: {
      key: string;
      dataset: TypedDataSet;
      fetchedAt: number;  // epoch millis
      expiresAt: number;  // epoch millis
    };
    indexes: {
      'by-expires': number;
    };
  };

  syncQueue: {
    key: string;          // SyncOp id
    value: SyncOp;
    indexes: {
      'by-next-retry': number;
      'by-dashboard': string;
    };
  };
}
```

The `by-expires` index on `datasetCache` supports periodic cleanup of expired entries. The `by-next-retry` index on `syncQueue` supports the retry worker finding the next operation to process.

---

## 9. useDataSet Hook

The `useDataSet` hook is the primary React API for consuming datasets. It handles loading states, error handling, refresh, and filter application.

```typescript
export function useDataSet(
  ref: DataSetRef,
  ops?: readonly DataSetOp[],
): UseDataSetResult {
  const service = useDataService();
  const [state, setState] = useState<DataSetState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        const dataset = ops && service.capabilities().serverSideQuery
          ? await service.queryDataSet(ref, ops)
          : await service.queryDataSet(ref, ops ?? []);
        if (!cancelled) {
          setState({ status: 'ready', dataset });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof DataSetError
              ? error
              : new DataSetError(String(error), 'NETWORK_ERROR', true),
          });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ref, ops, service]);

  const refresh = useCallback(() => {
    // Re-trigger the effect by bumping a version counter
    // (implementation detail omitted for brevity)
  }, []);

  return { ...state, refresh };
}

type UseDataSetResult =
  | { status: 'loading'; refresh: () => void }
  | { status: 'ready'; dataset: TypedDataSet; refresh: () => void }
  | { status: 'error'; error: DataSetError; refresh: () => void };
```

### Capability-Aware Query Delegation

When the service reports `serverSideQuery: true`, the hook sends operations to `queryDataSet()` and the server pushes filter/group/sort to the data source (e.g., SQL `WHERE` clauses). When `serverSideQuery` is `false`, operations are applied client-side after fetching the full dataset.

This distinction is invisible to components -- they pass `ops` to the hook and receive the result regardless of where the operations were executed.

---

## 10. Quarkus Backend

The optional Quarkus backend is a separate Maven module at `server/`. It provides server-side data providers, caching, dashboard persistence, and a plugin registry. It is not required -- Melviz works fully without it.

### 10.1 Module Structure

```
server/
├── src/main/java/org/melviz/server/
│   ├── api/                           # JAX-RS REST endpoints
│   │   ├── CapabilitiesResource.java
│   │   ├── DataSetResource.java
│   │   ├── DashboardResource.java
│   │   └── PluginResource.java
│   ├── dataset/                       # DataProvider SPI + implementations
│   │   ├── DataProvider.java          # SPI interface
│   │   ├── SqlDataProvider.java
│   │   ├── PrometheusDataProvider.java
│   │   ├── KafkaDataProvider.java
│   │   ├── ElasticsearchDataProvider.java
│   │   ├── JsonProxyProvider.java
│   │   └── CsvProxyProvider.java
│   ├── cache/
│   │   └── DataSetCacheService.java
│   ├── dashboard/
│   │   ├── DashboardEntity.java
│   │   └── DashboardRepository.java
│   └── plugin/
│       └── PluginRegistryService.java
├── src/main/resources/
│   ├── application.properties
│   └── db/migration/
│       └── V1__init.sql
└── pom.xml
```

### 10.2 Data Provider SPI (Java)

Server-side data providers implement a CDI-discovered SPI. The pattern mirrors the client-side `DataProvider` interface but uses Java types.

```java
public interface DataProvider {

    /** Unique type identifier, e.g. "sql", "prometheus". */
    String type();

    /** Whether this provider can handle the given ref. */
    boolean canHandle(DataSetRef ref);

    /** Fetch raw data without applying operations. */
    RawDataSet fetch(DataSetRef ref);

    /**
     * Fetch and apply operations in one step.
     * Providers that can push ops to the source override this.
     * Default: fetch + in-memory applyOps.
     */
    default TypedDataSet query(DataSetRef ref, List<DataSetOp> ops) {
        RawDataSet raw = fetch(ref);
        TypedDataSet typed = parseAndType(raw, ref);
        return DataSetOps.apply(typed, ops);
    }
}
```

CDI discovers all `@ApplicationScoped` beans implementing `DataProvider`. The `CapabilitiesResource` enumerates them to build the capabilities response.

### 10.3 SQL Data Provider

Connects to JNDI-configured data sources via Agroal.

```java
@ApplicationScoped
public class SqlDataProvider implements DataProvider {

    @Override
    public String type() { return "sql"; }

    @Override
    public TypedDataSet query(DataSetRef ref, List<DataSetOp> ops) {
        DataSource ds = lookupDataSource(ref.getDataSourceJndi());
        String sql = SqlQueryBuilder.build(ref.getContent(), ops);
        // ref.getContent() is the user's base query, wrapped as a subquery
        // ops are translated to WHERE, GROUP BY, ORDER BY, LIMIT clauses
        try (Connection conn = ds.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            SqlQueryBuilder.bindParameters(stmt, ops);
            ResultSet rs = stmt.executeQuery();
            return ResultSetMapper.toTypedDataSet(rs);
        }
    }
}
```

**SQL push-down:** The `SqlQueryBuilder` wraps the user's base query as a subquery and applies filter/group/sort operations as SQL clauses on the outer query. This means the database does the heavy lifting for large datasets rather than shipping all rows to the server.

**Injection safety:** All filter values are bound as prepared statement parameters. The user's base query is wrapped, not concatenated. Column references in `GROUP BY` and `ORDER BY` are validated against the result set metadata before inclusion.

### 10.4 Prometheus Data Provider

```java
@ApplicationScoped
public class PrometheusDataProvider implements DataProvider {

    @Override
    public String type() { return "prometheus"; }

    @Override
    public TypedDataSet query(DataSetRef ref, List<DataSetOp> ops) {
        String promql = ref.getContent();  // user-provided PromQL
        TimeRange range = extractTimeRange(ops);
        String url = String.format("%s/api/v1/query_range?query=%s&start=%s&end=%s&step=%s",
            ref.getUrl(),
            URLEncoder.encode(promql, UTF_8),
            range.start(), range.end(), range.step());
        // Fetch and parse Prometheus JSON response
        // Apply any remaining ops (aggregation, sort) client-side
    }
}
```

Time-range filters from `DataSetOp` are translated to Prometheus `start`/`end` query parameters. Other operations (aggregation, sort) that cannot be expressed in PromQL are applied in-memory after fetching.

### 10.5 Kafka Data Provider

```java
@ApplicationScoped
public class KafkaDataProvider implements DataProvider {

    @Override
    public String type() { return "kafka"; }

    @Override
    public RawDataSet fetch(DataSetRef ref) {
        // Consume messages within the configured time window
        // Parse values based on format: JSON, CSV, or Avro (schema registry)
        try (KafkaConsumer<String, String> consumer = createConsumer(ref)) {
            consumer.subscribe(List.of(ref.getTopic()));
            // Seek to offset based on time window
            // Poll and collect records
            // Parse each record's value
        }
    }
}
```

The provider creates a short-lived consumer, seeks to the offset corresponding to the configured time window start, consumes until the window end (or a configurable max record count), and parses each record's value. Supported value formats: JSON, CSV, and Avro (via Confluent Schema Registry integration).

### 10.6 Elasticsearch Data Provider

```java
@ApplicationScoped
public class ElasticsearchDataProvider implements DataProvider {

    @Override
    public String type() { return "elasticsearch"; }

    @Override
    public TypedDataSet query(DataSetRef ref, List<DataSetOp> ops) {
        // Build Elasticsearch query DSL from DataSetOp list:
        // - Filter ops -> bool query with must/filter clauses
        // - Group ops -> aggregations
        // - Sort ops -> sort array
        JsonObject queryDsl = ElasticsearchQueryBuilder.build(ops);
        // POST to /{index}/_search
    }
}
```

Filter operations are translated to Elasticsearch `bool` query clauses. Group operations become aggregations. Sort operations map to the `sort` array. The translation pushes as much work as possible to Elasticsearch.

### 10.7 Proxy Providers (CSV, JSON)

```java
@ApplicationScoped
public class JsonProxyProvider implements DataProvider {
    @Override
    public String type() { return "json-proxy"; }

    @Override
    public RawDataSet fetch(DataSetRef ref) {
        // Server fetches the URL on behalf of the client
        // Injects auth headers from server-side configuration
        // No CORS restrictions apply server-to-server
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(ref.getUrl()))
            .headers(resolveAuthHeaders(ref))
            .build();
        HttpResponse<String> response = httpClient.send(request,
            HttpResponse.BodyHandlers.ofString());
        return parseJsonDataSet(response.body());
    }
}
```

The proxy providers exist specifically for the `dataProxy` capability. The client sends a dataset reference to the server, and the server fetches the actual data. This solves two problems:
1. **CORS** -- the server is not subject to browser CORS restrictions.
2. **Auth injection** -- API keys and bearer tokens are stored server-side and never exposed to the browser.

### 10.8 Caching

Server-side caching uses Quarkus Cache backed by Caffeine.

```java
@ApplicationScoped
public class DataSetCacheService {

    @CacheResult(cacheName = "dataset-cache")
    public TypedDataSet cachedFetch(
            @CacheKey String cacheKey,
            DataProvider provider,
            DataSetRef ref) {
        return provider.query(ref, List.of());
    }

    @CacheInvalidate(cacheName = "dataset-cache")
    public void invalidate(@CacheKey String cacheKey) {}
}
```

TTL is configurable per dataset via `application.properties`:

```properties
quarkus.cache.caffeine."dataset-cache".expire-after-write=5m
quarkus.cache.caffeine."dataset-cache".maximum-size=1000
```

Individual datasets can override the global TTL via their dataset definition's `refreshInterval` property.

### 10.9 Dashboard Persistence

```java
@Entity
@Table(name = "dashboard")
public class DashboardEntity extends PanacheEntity {

    @Column(nullable = false)
    public String title;

    @Column(columnDefinition = "JSONB")
    public String modelJson;       // parsed RuntimeModel as JSON

    @Column(columnDefinition = "TEXT")
    public String yamlContent;     // original YAML source

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
```

Flyway migration:

```sql
-- V1__init.sql
CREATE TABLE dashboard (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    model_json  JSONB,
    yaml_content TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboard_updated_at ON dashboard (updated_at);
```

The `updatedAt` column is used by the conflict resolution protocol (section 4). The `PUT /api/dashboard/:id` endpoint checks `If-Unmodified-Since` against `updatedAt` and returns 409 if the server version is newer.

### 10.10 REST API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/capabilities` | `GET` | Report capabilities and available provider types |
| `/api/dataset/fetch` | `POST` | Fetch a dataset through the server proxy |
| `/api/dataset/query` | `POST` | Fetch a dataset and apply operations server-side |
| `/api/dashboard` | `GET` | List all dashboards (returns `DashboardSummary[]`) |
| `/api/dashboard/:id` | `GET` | Load a single dashboard |
| `/api/dashboard/:id` | `PUT` | Update a dashboard (supports `If-Unmodified-Since`) |
| `/api/dashboard/:id` | `DELETE` | Delete a dashboard |
| `/api/dashboard` | `POST` | Create a new dashboard |
| `/api/plugins` | `GET` | List available plugins from the server registry |

All endpoints return JSON. Error responses use a standard envelope:

```json
{
  "error": "CONFLICT",
  "message": "Dashboard has been modified since your last read",
  "serverUpdatedAt": "2026-06-09T14:30:00Z"
}
```

### 10.11 Configuration (application.properties)

```properties
# Database
quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/melviz
quarkus.datasource.username=melviz
quarkus.datasource.password=melviz
quarkus.hibernate-orm.database.generation=none
quarkus.flyway.migrate-at-start=true

# Cache
quarkus.cache.caffeine."dataset-cache".expire-after-write=5m
quarkus.cache.caffeine."dataset-cache".maximum-size=1000

# CORS (for local development)
quarkus.http.cors=true
quarkus.http.cors.origins=http://localhost:5173

# Data source JNDI (example SQL provider config)
quarkus.datasource."sales-db".db-kind=postgresql
quarkus.datasource."sales-db".jdbc.url=jdbc:postgresql://localhost:5432/sales

# Prometheus
melviz.prometheus.default-url=http://localhost:9090

# Kafka
kafka.bootstrap.servers=localhost:9092

# Elasticsearch
melviz.elasticsearch.default-url=http://localhost:9200
```

### 10.12 Dependencies (pom.xml)

```xml
<dependencies>
    <!-- Core Quarkus -->
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-rest-jackson</artifactId>
    </dependency>
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-hibernate-orm-panache</artifactId>
    </dependency>
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-jdbc-postgresql</artifactId>
    </dependency>
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-flyway</artifactId>
    </dependency>
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-cache</artifactId>
    </dependency>

    <!-- Data providers -->
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-agroal</artifactId>
    </dependency>
    <dependency>
        <groupId>org.apache.kafka</groupId>
        <artifactId>kafka-clients</artifactId>
    </dependency>
    <dependency>
        <groupId>org.elasticsearch.client</groupId>
        <artifactId>elasticsearch-rest-high-level-client</artifactId>
    </dependency>

    <!-- Testing -->
    <dependency>
        <groupId>io.quarkus</groupId>
        <artifactId>quarkus-junit5</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>io.rest-assured</groupId>
        <artifactId>rest-assured</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>postgresql</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>kafka</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>elasticsearch</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.wiremock</groupId>
        <artifactId>wiremock</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

---

## Cross-References

- **Core engine types** (`TypedDataSet`, `DataSetOp`, `DataSetRef`, branded IDs): [01-core-engine.md](01-core-engine.md)
- **Zod schemas** for `DataSetRef`, `Dashboard`, REST API payloads: [03-schema-system.md](03-schema-system.md)
- **Plugin system** (`PluginManifest`, `listAvailablePlugins`): [04-displayer-plugin-system.md](04-displayer-plugin-system.md)
- **MelvizProvider** and React context (where `DataService` is provided): [05-application-shell.md](05-application-shell.md)
- **Testing strategy** for data services (msw mocking, fake-indexeddb, Testcontainers): [07-testing-migration.md](07-testing-migration.md)
