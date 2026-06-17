import type { Component } from "../model/types.js";
import { slotSwapRegistry, dispatchSlotChange } from "./slot-swap.js";
import type { SwapFn } from "./slot-swap.js";

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
  const bar = doc.createElement("div");
  bar.dataset.tabBar = "";
  bar.className = type === "pills" ? "casehub-pills" : "casehub-tabs";

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
