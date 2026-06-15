import type { Component, PermissionContext } from "../model/types.js";
import { ALLOW_ALL } from "../model/types.js";
import { generateId } from "./id.js";
import { checkAccess } from "./access.js";
import { applyGridPlacement } from "./grid.js";
import { getSlotNames, getSlotChildren } from "./slots.js";
import { isLayoutType, applyLayoutCSS } from "./layout.js";
import { wireInteractivity } from "./interactive.js";

export interface RenderOptions {
  readonly permissions?: PermissionContext;
  readonly document?: Document;
}

export function renderComponent(
  target: HTMLElement,
  component: Component,
  options?: RenderOptions,
): void {
  const doc = options?.document ?? globalThis.document;
  const permissions = options?.permissions ?? ALLOW_ALL;
  target.innerHTML = "";
  renderNode(target, component, undefined, undefined, undefined, permissions, doc);
}

function renderNode(
  parent: HTMLElement,
  component: Component,
  parentId: string | undefined,
  slotOrX: string | number | undefined,
  indexOrY: number | undefined,
  permissions: PermissionContext,
  doc: Document,
): void {
  // 1. Access control — skip if denied
  if (!checkAccess(component.access, permissions)) return;

  // 2. Create container with data attributes
  const el = doc.createElement("div");
  const id = component.id ?? generateId(parentId, slotOrX, indexOrY);
  el.dataset.componentType = component.type;
  el.dataset.componentId = id;
  if (component.props) {
    el.dataset.componentProps = JSON.stringify(component.props);
  }

  // 3. Apply layout CSS
  if (isLayoutType(component.type)) {
    applyLayoutCSS(el, component.type, component.props);
  }

  // 4. Apply Component.style — runs AFTER layout CSS so author overrides win
  if (component.style) {
    for (const [prop, value] of Object.entries(component.style)) {
      el.style.setProperty(prop, value);
    }
  }

  // 5. Panel title
  if (component.type === "panel" && component.props) {
    const title = (component.props as { title?: string }).title;
    if (title) {
      const titleEl = doc.createElement("div");
      titleEl.dataset.panelTitle = "";
      titleEl.textContent = title;
      el.appendChild(titleEl);
    }
  }

  parent.appendChild(el);

  // 6. Render children — items take precedence over slots
  if (component.items && component.items.length > 0) {
    for (const item of component.items) {
      renderNode(el, item.component, id, item.placement.x, item.placement.y, permissions, doc);
      const child = el.lastElementChild as HTMLElement;
      if (child) {
        applyGridPlacement(child, item.placement);
      }
    }
  } else if (component.slots) {
    const slotNames = getSlotNames(component) as string[];
    const panels = new Map<string, HTMLElement>();

    for (const slotName of slotNames) {
      const slotContainer = doc.createElement("div");
      slotContainer.dataset.slot = slotName;
      el.appendChild(slotContainer);
      panels.set(slotName, slotContainer);

      const children = getSlotChildren(component, slotName);
      for (let i = 0; i < children.length; i++) {
        renderNode(slotContainer, children[i]!, id, slotName, i, permissions, doc);
      }
    }

    // 7. Wire interactivity for interactive layout types
    wireInteractivity(el, component.type, slotNames, panels);
  }
}
