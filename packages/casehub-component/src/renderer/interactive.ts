export function wireInteractivity(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
): void {
  switch (type) {
    case "tabs":
    case "pills":
      wireTabs(container, type, slotNames, panels);
      break;
    case "accordion":
      wireAccordion(container, slotNames, panels);
      break;
    case "carousel":
      wireCarousel(container, slotNames, panels);
      break;
    case "stack":
      applyOneVisible(slotNames, panels, 0);
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

function wireTabs(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
): void {
  const bar = document.createElement("div");
  bar.dataset.tabBar = "";
  bar.className = type === "pills" ? "casehub-pills" : "casehub-tabs";

  slotNames.forEach((name) => {
    const button = document.createElement("button");
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
      }
    }
  });
}

function wireAccordion(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
): void {
  slotNames.forEach((name) => {
    const panel = panels.get(name);
    if (panel) {
      const header = document.createElement("button");
      header.dataset.accordionHeader = "";
      header.textContent = name;
      container.insertBefore(header, panel);

      header.addEventListener("click", () => {
        panel.style.display = panel.style.display === "none" ? "" : "none";
      });
    }
  });
}

function wireCarousel(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
): void {
  let currentIndex = 0;

  applyOneVisible(slotNames, panels, 0);

  const nav = document.createElement("div");
  const prevButton = document.createElement("button");
  prevButton.dataset.carouselPrev = "";
  prevButton.textContent = "←";

  const nextButton = document.createElement("button");
  nextButton.dataset.carouselNext = "";
  nextButton.textContent = "→";

  nav.appendChild(prevButton);
  nav.appendChild(nextButton);
  container.appendChild(nav);

  prevButton.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + slotNames.length) % slotNames.length;
    applyOneVisible(slotNames, panels, currentIndex);
  });

  nextButton.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % slotNames.length;
    applyOneVisible(slotNames, panels, currentIndex);
  });
}
