import type { Component, GridItem } from "../model/types.js";
import { substituteProperties } from "./property-substitution.js";
import { desugarComponent } from "./component-desugar.js";
import { resolveNavigation, collectNavTreePageNames } from "./nav-desugar.js";

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
    const displayerDefaults = (global?.["displayer"] ?? global?.["settings"]) as Record<string, unknown> | undefined;
    const layout = parsePageContent(p, pageIndex, displayerDefaults);

    return {
      type: "page" as const,
      props: { name: pageName },
      ...(pageStyle ? { style: pageStyle } : {}),
      ...layout,
    };
  });

  // 6. Resolve navigation within each page's grid items
  // Track pages embedded via page-ref so they can be excluded from top-level
  const embeddedPageNames = new Set<string>();
  const resolvedPages = childPages.map((page) => {
    if (page.items) {
      // Collect embedded page names
      for (const item of page.items) {
        if (item.component.type === "page-ref" || item.component.type === "panel") {
          const refName = item.component.props?.["name"] as string | undefined;
          if (refName) embeddedPageNames.add(refName);
        }
      }

      // Resolve all components together so targetDivId can find its slot-target
      const allComponents = page.items.map(item => item.component);
      const resolved = resolveNavigation(allComponents, childPages, navTree);

      // Map resolved components back to grid items using the original placement.
      // resolveNavigation can: transform (new object), remove (slot-target filter),
      // or replace (slot-target → tabs). Track using a consumed-index approach:
      // walk the original items and the resolved list together.
      const resolvedItems: GridItem[] = [];
      const originalTypes = page.items.map(item => item.component.type);
      const removedIndices = new Set<number>();

      // Identify which original items were removed (slot-targets that were either
      // filtered or replaced)
      const resolvedSet = new Set(resolved);
      for (let i = 0; i < page.items.length; i++) {
        const orig = page.items[i]!.component;
        if (orig.type === "slot-target" && !resolved.includes(orig)) {
          removedIndices.add(i);
        }
      }

      // Walk resolved list, assigning placements from non-removed originals
      let origIdx = 0;
      for (const comp of resolved) {
        // Skip removed originals to stay aligned
        while (origIdx < page.items.length && removedIndices.has(origIdx)) {
          origIdx++;
        }
        if (origIdx < page.items.length) {
          resolvedItems.push({ ...page.items[origIdx]!, component: comp });
          origIdx++;
        } else {
          resolvedItems.push({
            placement: { x: 0, y: resolvedItems.length, w: 12, h: 1 },
            component: comp,
          });
        }
      }

      return { ...page, items: resolvedItems };
    }

    return page;
  });

  // 6b. Replace unresolved page references in nav slots with resolved versions.
  // resolveNavGroup uses childPages (unresolved) when creating slot values.
  // Pages whose internal navigation was resolved in step 6 need their resolved
  // versions propagated into any slot that references them.
  const resolvedByName = new Map<string, Component>();
  for (const p of resolvedPages) {
    const name = p.props?.["name"] as string | undefined;
    if (name) resolvedByName.set(name, p);
  }
  const patchedPages = resolvedPages.map((page) => patchSlotReferences(page, resolvedByName));

  // 6c. Remove pages embedded via page-ref OR navTree from the top-level slot.
  // Pages in navTree groups are rendered as slots inside their navigation container —
  // including them at the top level creates duplicate DOM trees.
  const navTreePageNames = collectNavTreePageNames(navTree);
  for (const name of navTreePageNames) {
    embeddedPageNames.add(name);
  }
  const topLevelPages = embeddedPageNames.size > 0
    ? patchedPages.filter((p) => !embeddedPageNames.has(p.props?.["name"] as string))
    : patchedPages;

  // 7. Build root page with settings and datasets
  const rootProps: Record<string, unknown> = { name: "root" };

  // Merge global.dataset into the datasets array (DashBuilder allows defining
  // a single dataset in global.dataset as well as in the datasets[] array)
  const allDatasets = [...(datasets ?? [])];
  if (global?.["dataset"] && typeof global["dataset"] === "object") {
    allDatasets.push(global["dataset"]);
  }
  if (allDatasets.length > 0) {
    rootProps["datasets"] = allDatasets;
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
    slots: { content: topLevelPages },
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
  displayerDefaults?: Record<string, unknown>,
): { items?: readonly GridItem[] } | { slots?: Readonly<Record<string, readonly Component[]>> } {
  const componentsRaw = pageRaw["components"] as unknown[] | undefined;
  const rowsRaw = pageRaw["rows"] as unknown[] | undefined;

  if (componentsRaw) {
    const items: GridItem[] = componentsRaw.map((compRaw, i) => {
      const component = desugarComponent(compRaw as Record<string, unknown>, displayerDefaults);
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

      const rowProps = row["properties"] as Record<string, string> | undefined;
      const hasRowProps = rowProps && typeof rowProps === "object" && Object.keys(rowProps).length > 0;

      // Collect this row's items
      const rowItems: GridItem[] = [];
      let x = 0;
      let maxComponentsInColumn = 1;
      for (const colRaw of columnsRaw) {
        const col = colRaw as Record<string, unknown>;
        const span = Number(col["span"] ?? 12);
        const colComponents = (col["components"] ?? col["layoutComponents"]) as
          | unknown[]
          | undefined;
        const colRows = col["rows"] as unknown[] | undefined;

        if (colComponents) {
          if (colComponents.length > maxComponentsInColumn) {
            maxComponentsInColumn = colComponents.length;
          }
          for (let ci = 0; ci < colComponents.length; ci++) {
            const component = desugarComponent(colComponents[ci] as Record<string, unknown>, displayerDefaults);
            const placed: GridItem = {
              placement: hasRowProps
                ? { x, y: ci, w: span, h: 1 }
                : { x, y: y + ci, w: span, h: 1 },
              component: assignIdIfMissing(component, `grid_${pageIndex}_${x}_${y + ci}`),
            };

            const colProps = col["properties"] as Record<string, string> | undefined;
            if (colProps && typeof colProps === "object" && Object.keys(colProps).length > 0) {
              rowItems.push({
                ...placed,
                component: {
                  ...placed.component,
                  style: { ...placed.component.style, ...colProps },
                },
              });
            } else {
              rowItems.push(placed);
            }
          }
        } else if (colRows) {
          const subPageIndex = pageIndex * 100 + x * 10 + y;
          const subPage = { rows: colRows } as Record<string, unknown>;
          const subResult = parsePageContent(subPage, subPageIndex, displayerDefaults);
          if ("items" in subResult && subResult.items && subResult.items.length > 0) {
            const colProps = col["properties"] as Record<string, string> | undefined;
            const subContainer: Component = {
              type: "grid",
              id: `nested_${pageIndex}_${x}_${y}`,
              items: subResult.items,
              ...(colProps && typeof colProps === "object" && Object.keys(colProps).length > 0
                ? { style: colProps }
                : {}),
            };
            const placed: GridItem = {
              placement: hasRowProps
                ? { x, y: 0, w: span, h: 1 }
                : { x, y, w: span, h: 1 },
              component: subContainer,
            };
            rowItems.push(placed);
          }
        }

        x += span;
      }

      if (hasRowProps && rowItems.length > 0) {
        // Wrap row items in a grid container with the row's CSS properties
        const rowComponent: Component = {
          type: "grid",
          id: `row_${pageIndex}_${y}`,
          style: rowProps,
          items: rowItems,
        };
        items.push({
          placement: { x: 0, y, w: 12, h: 1 },
          component: rowComponent,
        });
      } else {
        for (const item of rowItems) {
          items.push(item);
        }
      }

      y += hasRowProps ? 1 : maxComponentsInColumn;
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

function patchSlotReferences(
  component: Component,
  resolved: Map<string, Component>,
): Component {
  let changed = false;
  let newItems = component.items;
  let newSlots = component.slots;

  if (component.items) {
    const patched = component.items.map((item) => {
      const patchedChild = patchSlotReferences(item.component, resolved);
      if (patchedChild !== item.component) {
        changed = true;
        return { ...item, component: patchedChild };
      }
      return item;
    });
    if (changed) newItems = patched;
  }

  if (component.slots) {
    const patchedSlots: Record<string, Component[]> = {};
    for (const [name, children] of Object.entries(component.slots)) {
      patchedSlots[name] = children.map((child) => {
        if (child.type === "page" && child.props?.["name"]) {
          const resolvedVersion = resolved.get(child.props["name"] as string);
          if (resolvedVersion && resolvedVersion !== child) {
            changed = true;
            return patchSlotReferences(resolvedVersion, resolved);
          }
        }
        return patchSlotReferences(child, resolved);
      });
    }
    if (changed) newSlots = patchedSlots;
  }

  if (!changed) return component;
  return { ...component, ...(newItems !== component.items ? { items: newItems } : {}), ...(newSlots !== component.slots ? { slots: newSlots } : {}) };
}
