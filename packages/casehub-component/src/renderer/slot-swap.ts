export type SwapFn = (slotName: string) => void;

export const slotSwapRegistry = new WeakMap<HTMLElement, SwapFn>();

export function dispatchSlotChange(
  container: HTMLElement,
  slotName: string,
): void {
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
