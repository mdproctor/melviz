import type { Component } from "../model/types.js";
import { slotSwapRegistry, dispatchSlotChange } from "./slot-swap.js";
import type { SwapFn } from "./slot-swap.js";

let stylesInjected = false;
function injectTabStyles(doc: Document): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = doc.createElement("style");
  style.textContent = `
[data-tab-bar] {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0 12px;
}
[data-tab-bar] button[data-slot] {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border: 1px solid #d0d5dd;
  border-radius: 20px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
}
[data-tab-bar] button[data-slot]:hover {
  background: #f2f4f7;
  border-color: #98a2b3;
  color: #344054;
}
[data-tab-bar] button[data-slot][data-active] {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}
[data-tab-bar] button[data-slot][data-active]:hover {
  background: #4338ca;
  border-color: #4338ca;
}
.casehub-sidebar {
  flex-direction: column;
  gap: 2px;
  padding: 0 12px 0 0;
  border-right: 1px solid #e5e7eb;
  min-width: 140px;
}
.casehub-sidebar button[data-slot] {
  border-radius: 8px;
  border: none;
  text-align: left;
  padding: 8px 12px;
}
`;
  doc.head.appendChild(style);
}

export interface LazyConfig {
  readonly slotChildren: Readonly<Record<string, readonly Component[]>>;
  readonly renderSlot: (
    parent: HTMLElement,
    children: readonly Component[],
    slotName: string,
  ) => void;
}

export function wireInteractivity(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document = globalThis.document,
  lazy?: LazyConfig,
): void {
  switch (type) {
    case "tabs":
    case "pills":
    case "tree":
    case "menu":
    case "tiles":
      wireTabs(container, type, slotNames, panels, doc, lazy);
      break;
    case "sidebar":
      wireSidebar(container, slotNames, panels, doc, lazy);
      break;
    case "accordion":
      wireAccordion(container, slotNames, panels, doc);
      break;
    case "carousel":
      wireCarousel(container, slotNames, panels, doc, lazy);
      break;
    case "stack":
      wireStack(container, slotNames, panels, lazy);
      break;
  }
}

function applyOneVisible(
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  activeIndex: number,
): void {
  slotNames.forEach((name, i) => {
    const panel = panels.get(name);
    if (panel) {
      panel.style.display = i === activeIndex ? "" : "none";
    }
  });
}

function updateButtons(bar: HTMLElement, activeSlot: string): void {
  for (const btn of bar.querySelectorAll<HTMLElement>("button[data-slot]")) {
    if (btn.dataset.slot === activeSlot) {
      btn.dataset.active = "";
    } else {
      delete btn.dataset.active;
    }
  }
}

function renderInitialSlot(
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy: LazyConfig | undefined,
): string {
  const currentSlot = slotNames[0] ?? "";
  if (lazy && currentSlot) {
    const firstPanel = panels.get(currentSlot);
    if (firstPanel) {
      lazy.renderSlot(
        firstPanel,
        lazy.slotChildren[currentSlot] ?? [],
        currentSlot,
      );
    }
  }
  applyOneVisible(slotNames, panels, 0);
  return currentSlot;
}

function buildSwap(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy: LazyConfig | undefined,
  getCurrentSlot: () => string,
  setCurrentSlot: (s: string) => void,
  afterSwap?: (slotName: string) => void,
): SwapFn {
  const swap: SwapFn = (slotName: string) => {
    if (slotName === getCurrentSlot()) return;

    if (lazy) {
      const oldPanel = panels.get(getCurrentSlot());
      if (oldPanel) oldPanel.innerHTML = "";
      const newPanel = panels.get(slotName);
      if (newPanel) {
        lazy.renderSlot(
          newPanel,
          lazy.slotChildren[slotName] ?? [],
          slotName,
        );
      }
    }

    const newIndex = slotNames.indexOf(slotName);
    if (newIndex >= 0) {
      applyOneVisible(slotNames, panels, newIndex);
    }

    setCurrentSlot(slotName);
    afterSwap?.(slotName);
    dispatchSlotChange(container, slotName);
  };

  slotSwapRegistry.set(container, swap);
  return swap;
}

function wireTabs(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectTabStyles(doc);
  const bar = doc.createElement("div");
  bar.dataset.tabBar = "";
  bar.className = type === "pills" ? "casehub-pills"
    : type === "tree" ? "casehub-tree"
    : type === "menu" ? "casehub-menu"
    : type === "tiles" ? "casehub-tiles"
    : "casehub-tabs";

  slotNames.forEach((name) => {
    const button = doc.createElement("button");
    button.dataset.slot = name;
    button.textContent = name;
    bar.appendChild(button);
  });

  container.insertBefore(bar, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => updateButtons(bar, slotName),
  );

  bar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") {
      const slotName = target.dataset.slot;
      if (slotName) swap(slotName);
    }
  });
}

function wireSidebar(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectTabStyles(doc);
  const bar = doc.createElement("div");
  bar.dataset.tabBar = "";
  bar.className = "casehub-sidebar";

  slotNames.forEach((name) => {
    const button = doc.createElement("button");
    button.dataset.slot = name;
    button.textContent = name;
    bar.appendChild(button);
  });

  container.insertBefore(bar, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => updateButtons(bar, slotName),
  );

  bar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") {
      const slotName = target.dataset.slot;
      if (slotName) swap(slotName);
    }
  });
}

function wireAccordion(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
): void {
  slotNames.forEach((name) => {
    const panel = panels.get(name);
    if (panel) {
      const header = doc.createElement("button");
      header.dataset.accordionHeader = "";
      header.textContent = name;
      container.insertBefore(header, panel);

      header.addEventListener("click", () => {
        const wasHidden = panel.style.display === "none";
        panel.style.display = wasHidden ? "" : "none";
        if (wasHidden) {
          dispatchSlotChange(container, name);
        }
      });
    }
  });
}

function wireCarousel(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
  );

  const nav = doc.createElement("div");
  const prevButton = doc.createElement("button");
  prevButton.dataset.carouselPrev = "";
  prevButton.textContent = "←";

  const nextButton = doc.createElement("button");
  nextButton.dataset.carouselNext = "";
  nextButton.textContent = "→";

  nav.appendChild(prevButton);
  nav.appendChild(nextButton);
  container.appendChild(nav);

  prevButton.addEventListener("click", () => {
    const currentIndex = slotNames.indexOf(currentSlot);
    const newIndex = (currentIndex - 1 + slotNames.length) % slotNames.length;
    swap(slotNames[newIndex]!);
  });

  nextButton.addEventListener("click", () => {
    const currentIndex = slotNames.indexOf(currentSlot);
    const newIndex = (currentIndex + 1) % slotNames.length;
    swap(slotNames[newIndex]!);
  });
}

function wireStack(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy?: LazyConfig,
): void {
  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
  );
}
