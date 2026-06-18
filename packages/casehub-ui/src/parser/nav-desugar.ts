import type { Component } from "../model/types.js";

interface NavTreeGroup {
  readonly type: string;
  readonly id: string;
  readonly children?: readonly NavTreeChild[];
}

interface NavTreeChild {
  readonly page?: string;
  readonly type?: string;
  readonly id?: string;
  readonly children?: readonly NavTreeChild[];
}

interface NavTree {
  readonly root_items?: readonly NavTreeGroup[];
}

/**
 * Resolves navigation references and transient types into direct slot composition.
 *
 * Performs 6-step resolution:
 * 1. Find components with navGroupId property
 * 2. Look up navGroupId in navTree to find child page names
 * 3. For each child page name, find the corresponding page
 * 4. Map each child into a named slot on the navigation component
 * 5. Remove slot-target placeholder components
 * 6. Fall back to using all pages when navTree is missing or group not found
 *
 * Also resolves page-ref components to their referenced pages.
 */
export function resolveNavigation(
  components: Component[],
  pages: Component[],
  navTree: unknown | undefined,
): Component[] {
  const typedNavTree = navTree as NavTree | undefined;

  // Pass 1: Collect nav groups that specify a targetDivId.
  // Their page slots go to the matching slot-target, not into the nav component.
  const targetSlots = new Map<string, { type: string; slots: Record<string, Component[]> }>();

  const resolved = components
    .map((component) => {
      if (component.type === "page-ref") {
        return resolvePageRef(component, pages);
      }

      if (component.type === "panel" && component.props?.["name"]) {
        return resolvePanelRef(component, pages);
      }

      if (component.props?.["navGroupId"]) {
        const targetDivId = component.props["targetDivId"] as string | undefined;
        if (targetDivId) {
          const group = resolveNavGroup(component, pages, typedNavTree);
          if (group.slots) {
            targetSlots.set(targetDivId, {
              type: component.type,
              slots: group.slots as Record<string, Component[]>,
            });
          }
          // Strip slots from the nav component — they'll render at the target
          const { slots: _s, ...navOnly } = group;
          return navOnly as Component;
        }
        return resolveNavGroup(component, pages, typedNavTree);
      }

      return component;
    });

  // Pass 2: Replace slot-targets with their collected page content
  return resolved
    .map((component) => {
      if (component.type === "slot-target") {
        const divId = component.props?.["id"] as string | undefined;
        if (divId && targetSlots.has(divId)) {
          const { type, slots } = targetSlots.get(divId)!;
          return {
            type,
            props: {},
            slots,
          };
        }
      }
      return component;
    })
    .filter((component) => component.type !== "slot-target");
}

/**
 * Resolves a page-ref component to the actual page content.
 * Throws if the referenced page is not found.
 */
function resolvePageRef(pageRef: Component, pages: Component[]): Component {
  const pageName = pageRef.props?.["name"] as string | undefined;
  if (!pageName) {
    throw new Error("page-ref component missing 'name' property");
  }

  const matchingPage = pages.find((p) => p.props?.["name"] === pageName);
  if (!matchingPage) {
    throw new Error(`page-ref references non-existent page: ${pageName}`);
  }

  return matchingPage;
}

/**
 * Resolves a panel reference to the matching page's content, wrapped in a panel container.
 * If no matching page is found, returns the panel component unchanged (it may be a title panel).
 */
function resolvePanelRef(panel: Component, pages: Component[]): Component {
  const pageName = panel.props?.["name"] as string;
  const matchingPage = pages.find((p) => p.props?.["name"] === pageName);
  if (!matchingPage) {
    return panel;
  }

  return {
    ...panel,
    type: "panel",
    props: { ...panel.props, title: pageName },
    ...(matchingPage.items ? { items: matchingPage.items } : {}),
    ...(matchingPage.slots ? { slots: matchingPage.slots } : {}),
  };
}

/**
 * Resolves a navigation component with navGroupId into a component with slots.
 * Each slot contains the content of one page from the navTree group.
 */
function resolveNavGroup(
  navComponent: Component,
  pages: Component[],
  navTree: NavTree | undefined,
): Component {
  const groupId = navComponent.props?.["navGroupId"] as string;

  // Find matching group in navTree
  const group = navTree ? findGroup(navTree, groupId) : undefined;

  // Get page names from group, or fall back to all pages
  const pageNames: string[] = group
    ? extractPageNames(group)
    : pages
        .filter((p) => p.type === "page")
        .map((p) => p.props?.["name"] as string)
        .filter(Boolean);

  // Build slots: each page name → slot with that page's content
  const slots: Record<string, Component[]> = {};
  for (const pageName of pageNames) {
    const matchingPage = pages.find((p) => p.props?.["name"] === pageName);
    if (matchingPage) {
      slots[pageName] = [matchingPage];
    }
  }

  // Return nav component with slots, without navGroupId/targetDivId in props
  const { navGroupId, targetDivId, ...cleanProps } = navComponent.props as Record<
    string,
    unknown
  >;

  return {
    ...navComponent,
    props: cleanProps,
    slots,
  };
}

/**
 * Finds a group by ID in the navTree.
 * Searches recursively through nested groups.
 */
function findGroup(navTree: NavTree, groupId: string): NavTreeGroup | undefined {
  if (!navTree.root_items) {
    return undefined;
  }

  for (const item of navTree.root_items) {
    const found = findGroupRecursive(item, groupId);
    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * Recursively searches for a group by ID.
 */
function findGroupRecursive(
  item: NavTreeGroup | NavTreeChild,
  groupId: string,
): NavTreeGroup | undefined {
  if ("id" in item && item.id === groupId && item.type === "GROUP") {
    return item as NavTreeGroup;
  }

  if (item.children) {
    for (const child of item.children) {
      const found = findGroupRecursive(child, groupId);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/**
 * Extracts all page names from a navTree group.
 * Recursively processes nested groups.
 */
export function collectNavTreePageNames(navTree: unknown | undefined): Set<string> {
  const names = new Set<string>();
  const typed = navTree as NavTree | undefined;
  if (!typed?.root_items) return names;
  for (const group of typed.root_items) {
    for (const name of extractPageNames(group)) {
      names.add(name);
    }
  }
  return names;
}

function extractPageNames(group: NavTreeGroup): string[] {
  const names: string[] = [];

  if (!group.children) {
    return names;
  }

  for (const child of group.children) {
    if (child.page) {
      names.push(child.page);
    }
    if (child.type === "GROUP" && child.children) {
      // Recurse into nested groups
      names.push(...extractPageNames(child as NavTreeGroup));
    }
  }

  return names;
}

export function collectNavTreeGroupIds(navTree: unknown | undefined): Set<string> {
  const ids = new Set<string>();
  const typed = navTree as NavTree | undefined;
  if (!typed?.root_items) return ids;
  for (const group of typed.root_items) {
    if (group.id) ids.add(group.id);
  }
  return ids;
}
