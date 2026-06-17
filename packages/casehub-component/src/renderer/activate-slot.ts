import { slotSwapRegistry, dispatchSlotChange } from "./slot-swap.js";

export function activateSlot(
  container: HTMLElement,
  slotName: string,
): boolean {
  // Check if slot exists before attempting any activation
  const slotPanel = container.querySelector<HTMLElement>(`:scope > [data-slot="${slotName}"]`);
  if (!slotPanel) return false;

  const swap = slotSwapRegistry.get(container);
  if (swap) {
    swap(slotName);
    return true;
  }

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

  dispatchSlotChange(container, slotName);

  return true;
}
