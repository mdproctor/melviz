# Dashboard Validation Matrix

Generated: 2026-06-17

## Results

| Dashboard | Status | Data Components | Content | Issues | Notes |
|-----------|--------|----------------|---------|--------|-------|
| Accumulate Flag | Full | 1 | 0 | 0 | |
| Ansible Metrics | Full | 16 | 4 | 0 | |
| Backstage Metrics | Full | 8 | 0 | 0 | |
| Column with rows | Full | 3 | 1 | 0 | |
| DarkMode | Full | 1 | 0 | 0 | |
| Decal Pattern | Full | 1 | 0 | 0 | |
| FIFA 2022 Goals | Full | 9 | 2 | 0 | |
| Filter | Full | 2 | 0 | 0 | |
| Filter With Table | Full | 2 | 0 | 0 | |
| GitHub Quarkus Repos | Full | 1 | 1 | 0 | |
| Github Repositories | Full | 2 | 2 | 0 | |
| Global Column settings | Full | 3 | 0 | 0 | |
| Global Lookup Operation | Full | 4 | 0 | 0 | |
| Google Spreadsheet | Full | 2 | 0 | 0 | |
| Histogram | Full | 2 | 0 | 0 | |
| InlineDataset | Full | 1 | 0 | 0 | |
| Jupyter Hub Metrics Histograms | Full | 3 | 1 | 0 | |
| Jupyter Metrics Summary | Full | 8 | 1 | 0 | |
| JVM Monitoring | Full | 4 | 3 | 0 | |
| Kitchensink | Partial | 12 | 4 | 3 | iframe-plugin (external component — expected), map (component bug) |
| ModelMeshMetrics | Full | 5 | 3 | 0 | |
| Most Spoken Languages | Full | 2 | 1 | 0 | |
| Podman Stats | Full | 2 | 1 | 0 | |
| Prometheus Basic | Fails | 2 | 1 | 2 | Prometheus API response format not supported (#35) |
| Prometheus HTTP Requests | Partial | 6 | 1 | 5 | Prometheus API response format not supported (#35) |
| Quarkus Monitoring | Full | 7 | 0 | 0 | |
| Real Time JVM Monitoring | Full | 5 | 0 | 0 | |
| Simple Chart | Full | 1 | 1 | 0 | |
| Table | Full | 2 | 0 | 0 | |
| TimeSeries | Full | 1 | 0 | 0 | |
| Triton Inference Server Model Metrics | Full | 11 | 2 | 0 | |

## Summary

- **Total:** 31 dashboards
- **Full:** 28 (90%)
- **Partial:** 2 (Kitchensink, Prometheus HTTP Requests)
- **Fails:** 1 (Prometheus Basic)

## Known Issues

- **Prometheus (#35):** API response format `{ status, data: { resultType, result } }` not supported by extraction layer
- **Kitchensink iframe-plugin:** External component placeholder — expected to be empty without the external component server
- **Kitchensink map:** `casehub-map` component has a rendering bug (`regions` property undefined)
