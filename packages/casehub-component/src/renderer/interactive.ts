export function wireInteractivity(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document = globalThis.document,
): void {
  switch (type) {
    case "tabs":
    case "pills":
      wireTabs(container, type, slotNames, panels, doc);
      break;
    case "sidebar":
      wireSidebar(container, slotNames, panels, doc);
      break;
    case "accordion":
      wireAccordion(container, slotNames, panels, doc);
      break;
    case "carousel":
      wireCarousel(container, slotNames, panels, doc);
      break;
    case "stack":
      applyOneVisible(slotNames, panels, 0);
      break;
  }
}

function dispatchSlotChange(container: HTMLElement, slotName: string): void {
  container.dispatchEvent(
    new CustomEvent("casehub-slot-change", {
      bubbles: true,
      composed: true,
      detail: {
        activeSlot: slotName,
        containerId: container.dataset.componentId,
      },
    }),
  );
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

function wireTabs(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
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
  applyOneVisible(slotNames, panels, 0);

  bar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") {
      const slotName = target.dataset.slot;
      if (slotName) {
        slotNames.forEach((name) => {
          const panel = panels.get(name);
          if (panel) {
            panel.style.display = name === slotName ? "" : "none";
          }
        });
        for (const btn of bar.querySelectorAll<HTMLElement>("button[data-slot]")) {
          if (btn.dataset.slot === slotName) {
            btn.dataset.active = "";
          } else {
            delete btn.dataset.active;
          }
        }
        dispatchSlotChange(container, slotName);
      }
    }
  });
}

function wireSidebar(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
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
  applyOneVisible(slotNames, panels, 0);

  bar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") {
      const slotName = target.dataset.slot;
      if (slotName) {
        slotNames.forEach((name) => {
          const panel = panels.get(name);
          if (panel) {
            panel.style.display = name === slotName ? "" : "none";
          }
        });
        for (const btn of bar.querySelectorAll<HTMLElement>("button[data-slot]")) {
          if (btn.dataset.slot === slotName) {
            btn.dataset.active = "";
          } else {
            delete btn.dataset.active;
          }
        }
        dispatchSlotChange(container, slotName);
      }
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
): void {
  let currentIndex = 0;

  applyOneVisible(slotNames, panels, 0);

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
    currentIndex = (currentIndex - 1 + slotNames.length) % slotNames.length;
    applyOneVisible(slotNames, panels, currentIndex);
    dispatchSlotChange(container, slotNames[currentIndex]!);
  });

  nextButton.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % slotNames.length;
    applyOneVisible(slotNames, panels, currentIndex);
    dispatchSlotChange(container, slotNames[currentIndex]!);
  });
}
