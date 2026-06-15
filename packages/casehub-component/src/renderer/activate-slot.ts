export function activateSlot(
  container: HTMLElement,
  slotName: string,
): boolean {
  const panels = container.querySelectorAll<HTMLElement>(":scope > [data-slot]");
  let found = false;

  for (const panel of panels) {
    if (panel.dataset.slot === slotName) {
      panel.style.display = "";
      found = true;
    } else {
      panel.style.display = "none";
    }
  }

  if (!found) return false;

  // Update header active state if a tab/pill/sidebar bar exists
  const bar = container.querySelector<HTMLElement>(":scope > [data-tab-bar]");
  if (bar) {
    for (const button of bar.querySelectorAll<HTMLElement>("button[data-slot]")) {
      if (button.dataset.slot === slotName) {
        button.dataset.active = "";
      } else {
        delete button.dataset.active;
      }
    }
  }

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

  return true;
}
