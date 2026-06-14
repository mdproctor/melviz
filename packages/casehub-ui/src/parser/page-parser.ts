import type { Component, GridItem } from "../model/types.js";
import { substituteProperties } from "./property-substitution.js";
import { desugarComponent } from "./component-desugar.js";
import { resolveNavigation } from "./nav-desugar.js";

/**
 * Main entry point for parsing raw YAML dashboard objects into the Component model.
 *
 * Orchestrates:
 * 1. Property substitution (${name} → value)
 * 2. Component desugaring (YAML shorthands → typed components)
 * 3. Layout desugaring (components list / rows+columns → grid items)
 * 4. Navigation resolution (navGroupId + navTree → slots)
 * 5. Deterministic ID generation for grid items
 *
 * @param raw - A raw YAML object (output of yaml.load()). Does NOT import js-yaml itself.
 * @returns A frozen root Component of type "page" containing the full dashboard tree.
 */
export function parsePage(raw: unknown): Component {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid input: expected an object");
  }

  const input = raw as Record<string, unknown>;

  // 1. Extract properties for substitution
  const properties = (input["properties"] ?? {}) as Record<string, string>;

  // 2. Apply property substitution (skips metric template fields)
  const substituted = substituteProperties(input, properties) as Record<string, unknown>;

  // 3. Get pages array (accept both "pages" and "layoutTemplates")
  const pagesRaw = (substituted["pages"] ?? substituted["layoutTemplates"]) as
    | unknown[]
    | undefined;
  if (!pagesRaw || !Array.isArray(pagesRaw) || pagesRaw.length === 0) {
    throw new Error("At least one page is required (pages or layoutTemplates)");
  }

  // 4. Get datasets, global settings, navTree
  const datasets = substituted["datasets"] as unknown[] | undefined;
  const global = substituted["global"] as Record<string, unknown> | undefined;
  const navTree = substituted["navTree"] as unknown;

  // 5. Parse each page into a Component
  const childPages: Component[] = pagesRaw.map((pageRaw, pageIndex) => {
    const p = pageRaw as Record<string, unknown>;
    const pageName = (p["name"] as string) ?? `Page ${pageIndex + 1}`;

    // Extract page-level properties as style
    const pageProps = p["properties"] as Record<string, string> | undefined;
    const pageStyle =
      pageProps && typeof pageProps === "object" && Object.keys(pageProps).length > 0
        ? pageProps
        : undefined;

    // Parse content — either "components" shorthand or "rows" explicit layout
    const layout = parsePageContent(p, pageIndex);

    return {
      type: "page" as const,
      props: { name: pageName },
      ...(pageStyle ? { style: pageStyle } : {}),
      ...layout,
    };
  });

  // 6. Resolve navigation within each page's grid items
  const resolvedPages = childPages.map((page) => {
    if (page.items) {
      const resolvedItems: GridItem[] = [];
      for (const item of page.items) {
        const resolved = resolveNavigation([item.component], childPages, navTree);
        if (resolved.length > 0) {
          resolvedItems.push({ ...item, component: resolved[0]! });
        }
      }
      return { ...page, items: resolvedItems };
    }

    return page;
  });

  // 7. Build root page with settings and datasets
  const rootProps: Record<string, unknown> = { name: "root" };

  if (datasets) {
    rootProps["datasets"] = datasets;
  }

  if (global) {
    const settings: Record<string, unknown> = {};
    if (global["mode"]) settings["mode"] = (global["mode"] as string).toLowerCase();
    if (global["allowUrlProperties"] !== undefined) {
      settings["allowUrlProperties"] =
        String(global["allowUrlProperties"]).toLowerCase() === "true";
    }
    if (global["displayer"] || global["settings"]) {
      settings["dataComponentDefaults"] = global["displayer"] ?? global["settings"];
    }
    if (global["dataset"]) {
      settings["datasetDefaults"] = global["dataset"];
    }
    rootProps["settings"] = settings;
  }

  if (Object.keys(properties).length > 0) {
    rootProps["properties"] = properties;
  }

  return Object.freeze({
    type: "page",
    props: rootProps,
    slots: { content: resolvedPages },
  });
}

/**
 * Parses page content from one of two YAML formats into grid items.
 *
 * **1. `components` shorthand** — flat list; each component is placed full-width:
 * ```yaml
 * components:
 *   - html: "Hello"
 *   - displayer: { type: BARCHART }
 * ```
 * Each component becomes a grid item at (x:0, y:row, w:12, h:1).
 *
 * **2. `rows` explicit layout** — rows with columns and optional `span`:
 * ```yaml
 * rows:
 *   - columns:
 *       - span: 6
 *         components:
 *           - html: "left"
 *       - span: 6
 *         components:
 *           - html: "right"
 * ```
 * Items are placed left-to-right within rows, top-to-bottom across rows.
 */
function parsePageContent(
  pageRaw: Record<string, unknown>,
  pageIndex: number,
): { items?: readonly GridItem[] } | { slots?: Readonly<Record<string, readonly Component[]>> } {
  const componentsRaw = pageRaw["components"] as unknown[] | undefined;
  const rowsRaw = pageRaw["rows"] as unknown[] | undefined;

  if (componentsRaw) {
    const items: GridItem[] = componentsRaw.map((compRaw, i) => {
      const component = desugarComponent(compRaw as Record<string, unknown>);
      return {
        placement: { x: 0, y: i, w: 12, h: 1 },
        component: assignIdIfMissing(component, `grid_${pageIndex}_0_${i}`),
      };
    });
    return { items };
  }

  if (rowsRaw) {
    const items: GridItem[] = [];
    let y = 0;
    for (const rowRaw of rowsRaw) {
      const row = rowRaw as Record<string, unknown>;
      const columnsRaw = (row["columns"] ?? row["layoutColumns"]) as unknown[] | undefined;
      if (!columnsRaw) {
        y++;
        continue;
      }

      let x = 0;
      for (const colRaw of columnsRaw) {
        const col = colRaw as Record<string, unknown>;
        const span = Number(col["span"] ?? 12);
        const colComponents = (col["components"] ?? col["layoutComponents"]) as
          | unknown[]
          | undefined;
        const colRows = col["rows"] as unknown[] | undefined;

        if (colComponents) {
          for (let ci = 0; ci < colComponents.length; ci++) {
            const component = desugarComponent(colComponents[ci] as Record<string, unknown>);
            const placed: GridItem = {
              placement: { x, y: y + ci, w: span, h: 1 },
              component: assignIdIfMissing(component, `grid_${pageIndex}_${x}_${y + ci}`),
            };

            // Attach column-level properties as style on the component
            const colProps = col["properties"] as Record<string, string> | undefined;
            if (colProps && typeof colProps === "object" && Object.keys(colProps).length > 0) {
              items.push({
                ...placed,
                component: {
                  ...placed.component,
                  style: { ...placed.component.style, ...colProps },
                },
              });
            } else {
              items.push(placed);
            }
          }
        } else if (colRows) {
          // Nested rows inside a column — recurse by treating as a sub-page
          const subPage = { rows: colRows } as Record<string, unknown>;
          const subResult = parsePageContent(subPage, pageIndex);
          if ("items" in subResult && subResult.items) {
            for (const subItem of subResult.items) {
              // Offset the nested items into this column's position
              items.push({
                placement: {
                  x: x + subItem.placement.x,
                  y: y + subItem.placement.y,
                  w: Math.min(subItem.placement.w, span),
                  h: subItem.placement.h,
                },
                component: subItem.component,
              });
            }
          }
        }

        x += span;
      }
      y += 1;
    }
    return { items };
  }

  // No content — return empty items
  return { items: [] };
}

/**
 * Assigns a deterministic ID to a component if it doesn't already have one.
 */
function assignIdIfMissing(component: Component, defaultId: string): Component {
  if (component.id) return component;
  return { ...component, id: defaultId };
}
