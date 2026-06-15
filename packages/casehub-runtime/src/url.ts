import type { DeepLink } from "@casehub/ui/dist/model/page-types.js";

export function serializeToUrl(link: DeepLink): string {
  let url = `#/page/${link.page}`;

  if (link.filters) {
    const entries = Object.entries(link.filters).filter(([, v]) => v.length > 0);
    if (entries.length > 0) {
      const filterStr = entries
        .map(([col, values]) => `${encodeURIComponent(col)}:${values.map(encodeURIComponent).join("|")}`)
        .join(",");
      url += `?filter=${filterStr}`;
    }
  }

  return url;
}

export function parseFromUrl(hash: string): DeepLink {
  if (!hash || !hash.startsWith("#/page/")) {
    return { page: "" };
  }

  const withoutPrefix = hash.substring("#/page/".length);
  const qIndex = withoutPrefix.indexOf("?");
  const page = qIndex === -1 ? withoutPrefix : withoutPrefix.substring(0, qIndex);

  let filters: Record<string, readonly string[]> | undefined;

  if (qIndex !== -1) {
    const queryStr = withoutPrefix.substring(qIndex + 1);
    const params = new URLSearchParams(queryStr);
    const filterStr = params.get("filter");
    if (filterStr) {
      filters = {};
      for (const entry of filterStr.split(",")) {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) continue;
        const col = decodeURIComponent(entry.substring(0, colonIdx));
        const values = entry.substring(colonIdx + 1).split("|").map(decodeURIComponent);
        filters[col] = values;
      }
    }
  }

  return { page, ...(filters ? { filters } : {}) };
}
