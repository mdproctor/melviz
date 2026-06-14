import type { Component } from "../model/types.js";
import { desugarDisplayer } from "./displayer-desugar.js";

/**
 * Maps navigation component types to lowercase strings.
 */
const NAV_TYPE_MAP: Record<string, string> = {
  TABS: "tabs",
  PILLS: "pills",
  TREE: "tree",
  MENU: "menu",
  CAROUSEL: "carousel",
  TILES: "tiles",
};

/**
 * Converts a raw YAML component object to a typed Component.
 *
 * Handles:
 * - Content shorthands (html, markdown, title)
 * - Navigation references (screen → page-ref, panel, div → slot-target)
 * - Displayer components (delegates to displayer-desugar)
 * - Navigation components (TABS, TREE, MENU, etc.)
 * - External components (EXTERNAL → iframe-plugin)
 * - CSS properties (properties → style for content/displayer components)
 *
 * Some component types are transient (page-ref, slot-target) and will be
 * resolved by nav-desugar in a later step.
 */
export function desugarComponent(raw: Record<string, unknown>): Component {
  // Content shorthands (check first, before type key)
  if ("html" in raw) {
    const style = extractStyle(raw.properties);
    return {
      type: "html",
      props: { content: raw.html },
      ...(style ? { style } : {}),
    };
  }

  if ("markdown" in raw) {
    const style = extractStyle(raw.properties);
    return {
      type: "markdown",
      props: { content: raw.markdown },
      ...(style ? { style } : {}),
    };
  }

  // Title shorthand (only if type is NOT present)
  if ("title" in raw && !("type" in raw)) {
    const style = extractStyle(raw.properties);
    return {
      type: "title",
      props: { text: raw.title },
      ...(style ? { style } : {}),
    };
  }

  // Navigation references (transient)
  if ("screen" in raw) {
    return {
      type: "page-ref",
      props: { name: raw.screen },
    };
  }

  // Panel reference (string value, not object)
  if ("panel" in raw && typeof raw.panel === "string") {
    return {
      type: "panel",
      props: { name: raw.panel },
    };
  }

  // Slot target (transient)
  if ("div" in raw) {
    return {
      type: "slot-target",
      props: { id: raw.div },
    };
  }

  // Displayer component
  if ("displayer" in raw && typeof raw.displayer === "object" && raw.displayer !== null) {
    const component = desugarDisplayer(raw.displayer as Record<string, unknown>);
    // Attach style from outer properties
    const style = extractStyle(raw.properties);
    return {
      ...component,
      ...(style ? { style } : {}),
    };
  }

  // Type-based dispatch (navigation, external, or displayer type)
  if ("type" in raw && typeof raw.type === "string") {
    const rawType = raw.type;

    // Navigation components
    if (rawType in NAV_TYPE_MAP) {
      const props = raw.properties as Record<string, unknown> | undefined;
      return {
        type: NAV_TYPE_MAP[rawType]!,
        ...(props ? { props } : {}),
      };
    }

    // External component → iframe-plugin
    if (rawType === "EXTERNAL") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      const componentId = properties.componentId as string | undefined;

      // Collect settings for the component (all properties except known layout ones)
      const settings: Record<string, unknown> = {};
      const knownLayoutProps = new Set(["componentId", "height", "width"]);
      for (const [key, value] of Object.entries(properties)) {
        if (!knownLayoutProps.has(key)) {
          settings[key] = value;
        }
      }

      return {
        type: "iframe-plugin",
        props: {
          componentId,
          ...(Object.keys(settings).length > 0 ? { settings } : {}),
        },
      };
    }

    // Legacy HTML component (type: "HTML" with properties.HTML_CODE)
    if (rawType === "HTML" || rawType === "html") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      const htmlCode = properties["HTML_CODE"] as string | undefined;
      // Extract CSS-related properties (everything except HTML_CODE)
      const style: Record<string, string> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (key !== "HTML_CODE") {
          style[key] = String(value);
        }
      }
      return {
        type: "html",
        props: { content: htmlCode ?? "" },
        ...(Object.keys(style).length > 0 ? { style } : {}),
      };
    }

    // Displayer type (type: "Displayer" or type: "displayer")
    if (rawType === "Displayer" || rawType === "displayer") {
      return desugarDisplayer(raw);
    }
  }

  // Unknown component — wrap as generic
  return {
    type: "unknown",
    props: raw as Record<string, unknown>,
  };
}

/**
 * Extracts CSS properties from a raw properties object.
 * Returns undefined if no properties exist.
 */
function extractStyle(
  properties: unknown,
): Record<string, string> | undefined {
  if (!properties || typeof properties !== "object") {
    return undefined;
  }

  const props = properties as Record<string, unknown>;
  const style: Record<string, string> = {};

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") {
      style[key] = value;
    } else if (value !== undefined && value !== null) {
      // Convert non-string values to strings for CSS
      style[key] = String(value);
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}
